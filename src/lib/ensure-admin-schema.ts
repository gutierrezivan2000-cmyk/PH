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
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brandColor" TEXT`,
  // Moderation: ban/suspend a user (blocks login + revokes sessions).
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "banReason" TEXT`,
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
  // Billing: server-side pending orders (payment integrity)
  `CREATE TABLE IF NOT EXISTS "PendingOrder" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'cop',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "epaycoRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PendingOrder_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PendingOrder_ref_key" ON "PendingOrder"("ref")`,
  `CREATE INDEX IF NOT EXISTS "PendingOrder_userId_idx" ON "PendingOrder"("userId")`,
  // Rate limiting: fixed-window counters
  `CREATE TABLE IF NOT EXISTS "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RateLimit_key_key" ON "RateLimit"("key")`,
  `CREATE INDEX IF NOT EXISTS "RateLimit_windowStart_idx" ON "RateLimit"("windowStart")`,
  // Enterprise portfolio: optional grouping label on properties.
  `ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "groupLabel" TEXT`,
  // Enterprise batch: per-property monthly input staging.
  `CREATE TABLE IF NOT EXISTS "PropertyMonthlyData" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "files" JSONB NOT NULL DEFAULT '[]',
    "additionalText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyMonthlyData_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PropertyMonthlyData_propertyId_month_year_key" ON "PropertyMonthlyData"("propertyId", "month", "year")`,
  `CREATE INDEX IF NOT EXISTS "PropertyMonthlyData_userId_year_month_idx" ON "PropertyMonthlyData"("userId", "year", "month")`,
  `DO $$ BEGIN
    ALTER TABLE "PropertyMonthlyData" ADD CONSTRAINT "PropertyMonthlyData_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Enterprise batch generation.
  `ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "batchId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Generation_batchId_idx" ON "Generation"("batchId")`,
  `CREATE TABLE IF NOT EXISTS "GenerationBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "docTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'processing',
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "GenerationBatch_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "GenerationBatch_userId_idx" ON "GenerationBatch"("userId")`,
  // Compliance calendar: building profile + acted-on/custom items.
  `ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "features" JSONB`,
  `CREATE TABLE IF NOT EXISTS "ComplianceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "title" TEXT,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'done',
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceRecord_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceRecord_propertyId_itemKey_key" ON "ComplianceRecord"("propertyId", "itemKey")`,
  `CREATE INDEX IF NOT EXISTS "ComplianceRecord_userId_idx" ON "ComplianceRecord"("userId")`,
  `CREATE INDEX IF NOT EXISTS "ComplianceRecord_propertyId_idx" ON "ComplianceRecord"("propertyId")`,
  // Units (contact directory per property) + Announcements (comunicados).
  `CREATE TABLE IF NOT EXISTS "Unit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "residentName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Unit_propertyId_idx" ON "Unit"("propertyId")`,
  `CREATE INDEX IF NOT EXISTS "Unit_userId_idx" ON "Unit"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Announcement_propertyId_idx" ON "Announcement"("propertyId")`,
  `CREATE INDEX IF NOT EXISTS "Announcement_userId_idx" ON "Announcement"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Cartera (F2): coeficiente/cuota en Unit + cargos y pagos.
  `ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "coeficiente" DOUBLE PRECISION`,
  `ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "monthlyFee" INTEGER`,
  // F3: resident portal token.
  `ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "portalToken" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Unit_portalToken_key" ON "Unit"("portalToken")`,
  // F3: admin WhatsApp contact per property.
  `ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT`,
  // F3.2: PQRS del residente.
  `CREATE TABLE IF NOT EXISTS "Pqrs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'peticion',
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'radicado',
    "residentName" TEXT,
    "residentContact" TEXT,
    "unitLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pqrs_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Pqrs_code_key" ON "Pqrs"("code")`,
  `CREATE INDEX IF NOT EXISTS "Pqrs_userId_idx" ON "Pqrs"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Pqrs_propertyId_idx" ON "Pqrs"("propertyId")`,
  `CREATE INDEX IF NOT EXISTS "Pqrs_status_idx" ON "Pqrs"("status")`,
  `DO $$ BEGIN
    ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "PqrsMessage" (
    "id" TEXT NOT NULL,
    "pqrsId" TEXT NOT NULL,
    "fromAdmin" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PqrsMessage_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PqrsMessage_pqrsId_idx" ON "PqrsMessage"("pqrsId")`,
  `DO $$ BEGIN
    ALTER TABLE "PqrsMessage" ADD CONSTRAINT "PqrsMessage_pqrsId_fkey"
      FOREIGN KEY ("pqrsId") REFERENCES "Pqrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // F3.2b: cached extracted text of property documents (asistente del reglamento).
  `ALTER TABLE "PropertyDocument" ADD COLUMN IF NOT EXISTS "extractedText" TEXT`,
  `CREATE TABLE IF NOT EXISTS "Charge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'admin',
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "month" INTEGER,
    "year" INTEGER,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Charge_propertyId_idx" ON "Charge"("propertyId")`,
  `CREATE INDEX IF NOT EXISTS "Charge_unitId_idx" ON "Charge"("unitId")`,
  `CREATE INDEX IF NOT EXISTS "Charge_userId_idx" ON "Charge"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "Charge" ADD CONSTRAINT "Charge_unitId_fkey"
      FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "UnitPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'transferencia',
    "reference" TEXT,
    "note" TEXT,
    "allocations" JSONB NOT NULL DEFAULT '[]',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitPayment_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "UnitPayment_propertyId_idx" ON "UnitPayment"("propertyId")`,
  `CREATE INDEX IF NOT EXISTS "UnitPayment_unitId_idx" ON "UnitPayment"("unitId")`,
  `CREATE INDEX IF NOT EXISTS "UnitPayment_userId_idx" ON "UnitPayment"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "UnitPayment" ADD CONSTRAINT "UnitPayment_unitId_fkey"
      FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Presupuesto y ejecución (F2.3).
  `CREATE TABLE IF NOT EXISTS "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Budget_propertyId_year_key" ON "Budget"("propertyId", "year")`,
  `CREATE INDEX IF NOT EXISTS "Budget_userId_idx" ON "Budget"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "Budget" ADD CONSTRAINT "Budget_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "concept" TEXT NOT NULL,
    "itemId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'gasto',
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "LedgerEntry_propertyId_idx" ON "LedgerEntry"("propertyId")`,
  `CREATE INDEX IF NOT EXISTS "LedgerEntry_userId_idx" ON "LedgerEntry"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Assemblies (convocatoria + control de términos).
  `CREATE TABLE IF NOT EXISTS "Assembly" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'presencial',
    "location" TEXT,
    "agenda" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'convocada',
    "convokedAt" TIMESTAMP(3),
    "actaReadyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Assembly_userId_idx" ON "Assembly"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Assembly_propertyId_idx" ON "Assembly"("propertyId")`,
  `DO $$ BEGIN
    ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Certificates (paz y salvo / residencia) with public QR verification.
  `CREATE TABLE IF NOT EXISTS "Certificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "type" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "unitLabel" TEXT NOT NULL,
    "meta" JSONB,
    "verifyCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_verifyCode_key" ON "Certificate"("verifyCode")`,
  `CREATE INDEX IF NOT EXISTS "Certificate_userId_idx" ON "Certificate"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Certificate_propertyId_idx" ON "Certificate"("propertyId")`,
  `DO $$ BEGIN
    ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
