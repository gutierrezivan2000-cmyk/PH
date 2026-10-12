/**
 * El SQL de las columnas de detalle de `UsageRecord` (consumo de IA por función), escrito UNA sola vez.
 *
 * Lo usan dos lugares y no puede haber dos copias: `ensureAdminSchema` (spread dentro de su lista, en su posición de siempre) y
 * `asegurarColumnasDeConsumo` en `registrar.ts` (que las asegura la primera vez que se registra o se lee consumo). Es un módulo
 * aparte y sin dependencias para que `registrar.ts` no arrastre `ensure-admin-schema` (ni la base) solo por esta lista.
 *
 * Idempotente y aditivo, como todo el SQL de arranque: lo vigila `src/lib/schema-drift.test.ts`.
 */
export const SENTENCIAS_COLUMNAS_CONSUMO: readonly string[] = [
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "provider" TEXT`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "model" TEXT`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "audioSeconds" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "refType" TEXT`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "refId" TEXT`,
];
