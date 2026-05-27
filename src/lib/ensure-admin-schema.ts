import { db } from "@/lib/db";

/**
 * Idempotent DDL that brings the database up to date with the admin/tickets
 * schema additions (User.role, Subscription add-on fields, Ticket,
 * TicketMessage, AdminAuditLog).
 *
 * This mirrors the existing ensureAgentTables() pattern: Neon + Vercel
 * build-time `prisma db push` is unreliable, so we self-heal at runtime using
 * the runtime connection. All statements use IF NOT EXISTS / duplicate_object
 * guards, so running this repeatedly is safe.
 */
const STATEMENTS: string[] = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user'`,
  `ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "addonAgents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
  `ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "adminNotes" TEXT`,
  `CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Ticket_userId_idx" ON "Ticket"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"("status")`,
  `CREATE INDEX IF NOT EXISTS "Ticket_assignedTo_idx" ON "Ticket"("assignedTo")`,
  `DO $$ BEGIN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "TicketMessage_ticketId_idx" ON "TicketMessage"("ticketId")`,
  `DO $$ BEGIN
    ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_adminId_idx" ON "AdminAuditLog"("adminId")`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action")`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt")`,
  `DO $$ BEGIN
    ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

let ensured = false;

export async function ensureAdminSchema(): Promise<void> {
  if (ensured) return;
  for (const sql of STATEMENTS) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (err) {
      console.error("[ensureAdminSchema] statement failed:", err);
    }
  }
  ensured = true;
}

/** True if an error looks like a missing column/relation (schema drift). */
export function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("does not exist") ||
    msg.includes("column") ||
    msg.includes("42703") || // undefined_column
    msg.includes("42P01") || // undefined_table
    msg.includes("P2022") || // Prisma: column does not exist
    msg.includes("P2021") // Prisma: table does not exist
  );
}
