import { db } from "@/lib/db";
import { crearCaminoRapido } from "@/lib/schema-catalogo";

/**
 * Tablas de la memoria operativa de los agentes (PropertyEvent, PropertyMemory, AgentAction, AgentChatFocus), como SQL
 * idempotente (mismo patrón que ensure-meetings-schema.ts). El `build` ya NO corre `prisma db push` (en Prisma 7 fallaba en cada
 * despliegue y el `|| echo` lo tapaba): estas tablas existen solo porque esta función las crea al vuelo.
 * DEBE seguir idéntico a los modelos de prisma/schema.prisma (lo comprueba src/lib/schema-drift.test.ts). Solo cambios ADITIVOS;
 * una columna nueva en una tabla ya publicada va en el CREATE TABLE Y en un ALTER ... ADD COLUMN IF NOT EXISTS.
 *
 * Antes de correr nada hace UNA consulta al catálogo (src/lib/schema-catalogo.ts) con los objetos que estas sentencias crearían;
 * si ya existen todos, no ejecuta DDL. Los objetos se derivan de estas mismas sentencias.
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

/** Las sentencias, expuestas para la prueba que las compara con el esquema de Prisma y para POST /api/admin/migrate. */
export const SENTENCIAS_OPERACION = STATEMENTS;

/** Camino rápido: una consulta al catálogo que dice si ya existe todo lo de STATEMENTS (expuesto para las pruebas). */
export const CAMINO_RAPIDO_OPERACION = crearCaminoRapido("ensureOperacionSchema", STATEMENTS);

let listo: Promise<void> | null = null;

/**
 * Crea (una vez por proceso) lo que falte. Cada sentencia va por separado: si un índice falla (por ejemplo, porque ya
 * existe con otro nombre), no impide crear las tablas que vienen después. Si falla una TABLA, la llamada falla y no se
 * cachea: la próxima vez lo intenta de nuevo.
 */
export function ensureOperacionSchema(): Promise<void> {
  if (!listo) {
    listo = (async () => {
      // Base al día (lo normal): una sola consulta de solo lectura y ninguna sentencia de DDL.
      if (await CAMINO_RAPIDO_OPERACION.alDia((sql) => db.$queryRawUnsafe(sql))) return;
      const fallosDeTabla: unknown[] = [];
      for (const sql of STATEMENTS) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (e) {
          if (sql.startsWith("CREATE TABLE")) fallosDeTabla.push(e);
          else console.error("[ensure-operacion-schema] índice no creado:", sql.slice(0, 80), e);
        }
      }
      if (fallosDeTabla.length > 0) throw fallosDeTabla[0];
    })().catch((e) => {
      listo = null;
      throw e;
    });
  }
  return listo;
}
