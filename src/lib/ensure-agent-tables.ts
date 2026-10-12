import { db } from "@/lib/db";

/**
 * Tablas de los agentes (chats, mensajes y memoria) como SQL idempotente.
 *
 * El `build` ya NO corre `prisma db push` (en Prisma 7 fallaba en cada despliegue y el `|| echo` lo tapaba): estas tablas existen
 * solo porque esta función las crea. DEBE seguir idéntico a los modelos de prisma/schema.prisma (lo comprueba
 * src/lib/schema-drift.test.ts). Solo cambios ADITIVOS; una columna nueva va en el CREATE TABLE Y en un ALTER ... ADD COLUMN IF NOT
 * EXISTS. Las claves foráneas apuntan a User, que crea ensureAdminSchema. PropertyDocument ya NO se crea aquí sino en
 * ensureAdminSchema: la leen rutas que nada tienen que ver con los agentes (subida de archivos, portal, documentos).
 */
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "AgentChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nueva conversacion',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentChat_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentChat_userId_agentId_idx" ON "AgentChat"("userId", "agentId")`,
  `CREATE TABLE IF NOT EXISTS "AgentMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AgentMessage_chatId_idx" ON "AgentMessage"("chatId")`,
  `CREATE TABLE IF NOT EXISTS "AgentMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentMemory_userId_agentId_key" ON "AgentMemory"("userId", "agentId")`,
  `DO $$ BEGIN
    ALTER TABLE "AgentChat" ADD CONSTRAINT "AgentChat_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_chatId_fkey"
      FOREIGN KEY ("chatId") REFERENCES "AgentChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

/** Las sentencias, expuestas para la prueba que las compara con el esquema de Prisma y para POST /api/admin/migrate. */
export const SENTENCIAS_AGENTES = STATEMENTS;

let ensured = false;

export async function ensureAgentTables(): Promise<void> {
  if (ensured) return;
  if (process.env.DEMO_MODE === "true") {
    ensured = true;
    return;
  }

  let failures = 0;
  for (const sql of STATEMENTS) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (err) {
      failures++;
      console.error("[ensureAgentTables] statement failed:", err);
    }
  }
  // See ensureAdminSchema: memoizing after failures cached a failed self-heal
  // for the life of the instance.
  if (failures === 0) ensured = true;
}

export function isMissingRelationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("42P01") ||
    msg.includes("P2021")
  );
}
