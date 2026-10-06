import { db } from "@/lib/db";

/**
 * Tablas de «Reuniones» como SQL idempotente.
 *
 * El `build` corre `prisma db push`, pero si falla (la base no responde en ese
 * momento) el despliegue sigue y la primera consulta moriría con «relation does
 * not exist». Esto las crea al vuelo, igual que ensure-agent-tables.ts.
 *
 * DEBE seguir idéntico a los modelos Meeting* y PropertyPerson de
 * prisma/schema.prisma (mismos nombres, tipos, índices y claves foráneas). Los
 * tipos de Prisma → Postgres: String TEXT · Int INTEGER · Float DOUBLE PRECISION ·
 * Boolean BOOLEAN · DateTime TIMESTAMP(3) · Json JSONB. Solo cambios ADITIVOS:
 * las vistas previas pueden compartir la base de producción.
 */
const STATEMENTS: string[] = [
  /* ── Meeting ─────────────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "Meeting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'consejo',
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'borrador',
    "stage" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "coverage" DOUBLE PRECISION,
    "silences" JSONB,
    "audioUrl" TEXT,
    "transcriptUrl" TEXT,
    "digest" JSONB,
    "speakerRefs" JSONB,
    "provider" TEXT,
    "consentAt" TIMESTAMP(3),
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Meeting_userId_date_idx" ON "Meeting"("userId", "date")`,
  `CREATE INDEX IF NOT EXISTS "Meeting_propertyId_date_idx" ON "Meeting"("propertyId", "date")`,
  `CREATE INDEX IF NOT EXISTS "Meeting_status_updatedAt_idx" ON "Meeting"("status", "updatedAt")`,

  /* ── MeetingSource ───────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "MeetingSource" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "session" INTEGER,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "pathname" TEXT,
    "mimeType" TEXT,
    "sizeBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'subiendo',
    "normalizedMs" INTEGER NOT NULL DEFAULT 0,
    "segments" JSONB NOT NULL DEFAULT '[]',
    "durationMs" INTEGER,
    "offsetMs" INTEGER,
    "originalDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetingSource_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MeetingSource_meetingId_idx" ON "MeetingSource"("meetingId")`,

  /* ── MeetingLivePart ─────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "MeetingLivePart" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "session" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingLivePart_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MeetingLivePart_meetingId_session_seq_key" ON "MeetingLivePart"("meetingId", "session", "seq")`,
  `CREATE INDEX IF NOT EXISTS "MeetingLivePart_meetingId_idx" ON "MeetingLivePart"("meetingId")`,

  /* ── MeetingTask ─────────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "MeetingTask" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetingTask_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MeetingTask_meetingId_key_key" ON "MeetingTask"("meetingId", "key")`,
  `CREATE INDEX IF NOT EXISTS "MeetingTask_status_runAfter_idx" ON "MeetingTask"("status", "runAfter")`,
  `CREATE INDEX IF NOT EXISTS "MeetingTask_meetingId_kind_idx" ON "MeetingTask"("meetingId", "kind")`,

  /* ── MeetingUtterance ────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "MeetingUtterance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "MeetingUtterance_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MeetingUtterance_meetingId_startMs_idx" ON "MeetingUtterance"("meetingId", "startMs")`,

  /* ── MeetingSpeaker ──────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "MeetingSpeaker" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "personId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "suggestion" JSONB,
    "talkMs" INTEGER NOT NULL DEFAULT 0,
    "sampleStartMs" INTEGER,
    "sampleEndMs" INTEGER,
    CONSTRAINT "MeetingSpeaker_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MeetingSpeaker_meetingId_label_key" ON "MeetingSpeaker"("meetingId", "label")`,

  /* ── MeetingMarker ───────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "MeetingMarker" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "atMs" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingMarker_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MeetingMarker_meetingId_idx" ON "MeetingMarker"("meetingId")`,

  /* ── PropertyPerson ──────────────────────────────────────────────── */
  `CREATE TABLE IF NOT EXISTS "PropertyPerson" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PropertyPerson_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PropertyPerson_propertyId_idx" ON "PropertyPerson"("propertyId")`,

  /* ── Generation.meetingId (sin clave foránea: borrar la reunión no borra el acta) ── */
  `ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "meetingId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Generation_meetingId_idx" ON "Generation"("meetingId")`,

  /* ── Claves foráneas (CASCADE, como en el esquema) ───────────────── */
  `DO $$ BEGIN
    ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "MeetingSource" ADD CONSTRAINT "MeetingSource_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "MeetingLivePart" ADD CONSTRAINT "MeetingLivePart_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "MeetingTask" ADD CONSTRAINT "MeetingTask_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "MeetingUtterance" ADD CONSTRAINT "MeetingUtterance_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "MeetingSpeaker" ADD CONSTRAINT "MeetingSpeaker_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "MeetingMarker" ADD CONSTRAINT "MeetingMarker_meetingId_fkey"
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "PropertyPerson" ADD CONSTRAINT "PropertyPerson_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

/** Las sentencias, expuestas para la prueba que las compara con el esquema de Prisma. */
export const SENTENCIAS_REUNIONES = STATEMENTS;

let listo = false;
let enCurso: Promise<void> | null = null;

/**
 * Crea lo que falte. Se memoriza por proceso; si algo falla NO se memoriza (ver
 * ensureAdminSchema: cachear un fallo dejaba la instancia rota hasta reiniciarse).
 * Varias llamadas simultáneas comparten la misma ejecución. En demo no hace nada.
 */
export async function ensureMeetingsSchema(): Promise<void> {
  if (listo) return;
  if (process.env.DEMO_MODE === "true") {
    listo = true;
    return;
  }
  if (!enCurso) {
    enCurso = (async () => {
      let fallos = 0;
      for (const sql of STATEMENTS) {
        try {
          await db.$executeRawUnsafe(sql);
        } catch (err) {
          fallos++;
          console.error("[ensureMeetingsSchema] statement failed:", err);
        }
      }
      if (fallos === 0) listo = true;
    })().finally(() => {
      enCurso = null;
    });
  }
  await enCurso;
}
