import { db } from "@/lib/db";

/**
 * Tablas de la memoria operativa de los agentes (PropertyEvent, PropertyMemory, AgentAction, AgentChatFocus), como SQL
 * idempotente (mismo patrón que ensure-meetings-schema.ts: si el `prisma db push` del build falla, se crean al vuelo).
 * DEBE seguir idéntico a los modelos de prisma/schema.prisma. Solo cambios ADITIVOS.
 */
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "PropertyEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'usuario',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyEvent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PropertyEvent_propertyId_createdAt_idx" ON "PropertyEvent"("propertyId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "PropertyEvent_userId_createdAt_idx" ON "PropertyEvent"("userId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "PropertyMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'nota',
    "content" TEXT NOT NULL,
    "authorAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyMemory_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PropertyMemory_propertyId_createdAt_idx" ON "PropertyMemory"("propertyId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "AgentAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT,
    "chatId" TEXT,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "result" JSONB,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentAction_userId_status_idx" ON "AgentAction"("userId", "status")`,
  `CREATE INDEX IF NOT EXISTS "AgentAction_chatId_idx" ON "AgentAction"("chatId")`,
  `CREATE TABLE IF NOT EXISTS "AgentChatFocus" (
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentChatFocus_pkey" PRIMARY KEY ("chatId")
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentChatFocus_userId_idx" ON "AgentChatFocus"("userId")`,
];

let listo: Promise<void> | null = null;

/** Crea (una vez por proceso) lo que falte. Si falla, no se cachea el fallo: la próxima llamada lo intenta de nuevo. */
export function ensureOperacionSchema(): Promise<void> {
  if (!listo) {
    listo = (async () => {
      for (const sql of STATEMENTS) await db.$executeRawUnsafe(sql);
    })().catch((e) => {
      listo = null;
      throw e;
    });
  }
  return listo;
}
