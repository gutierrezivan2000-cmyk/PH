import { db } from "@/lib/db";
import { SENTENCIAS_COLUMNAS_CONSUMO } from "@/lib/consumo/esquema";
import { crearCaminoRapido } from "@/lib/schema-catalogo";

/**
 * SQL idempotente que deja la base al día con el esquema de Prisma: las tablas base (User, Property, Generation…), el panel de
 * administración, los tickets, el cobro, el modo empresa y todos los módulos de la administración (cartera, PQRS, asambleas…).
 *
 * Es el MECANISMO REAL de migración de este proyecto, junto con ensureAgentTables, ensureMeetingsSchema, ensureOperacionSchema y
 * POST /api/admin/migrate. El `build` ya NO corre `prisma db push` (en Prisma 7 fallaba en cada despliegue y el `|| echo` lo
 * tapaba, así que el esquema nunca se aplicó por ahí): una tabla o columna existe en producción solo si alguna de estas
 * sentencias la crea. Por eso `src/lib/schema-drift.test.ts` exige que TODO lo que declara prisma/schema.prisma tenga aquí su SQL.
 *
 * Reglas: solo cambios ADITIVOS (nada de DROP ni de cambiar tipos) y todas con IF NOT EXISTS o un guard de duplicate_object,
 * así que repetirlas es seguro. Una columna nueva va en el CREATE TABLE (bases nuevas) Y en un ALTER ... ADD COLUMN IF NOT
 * EXISTS (bases que ya tenían la tabla): solo con el CREATE, las bases existentes se quedaban sin ella.
 *
 * Arranque barato: antes de correr nada, ensureAdminSchema hace UNA consulta al catálogo (ver src/lib/schema-catalogo.ts) que
 * pregunta si ya existe todo lo que estas sentencias crearían; si existe, no ejecuta ninguna (cada ALTER/CREATE INDEX "IF NOT
 * EXISTS" toma un bloqueo de la tabla aunque el objeto exista). Los objetos que se buscan se DERIVAN de estas mismas sentencias,
 * así que agregar una sentencia aquí la incluye sola en la comprobación.
 */
const STATEMENTS: string[] = [
  // ── Tablas base ───────────────────────────────────────────────────────────
  // Ningún camino en runtime las creaba: existían en producción solo porque alguien corrió `prisma db push` a mano, y una base
  // vacía (entorno nuevo, vista previa) fallaba en cada sentencia de abajo con «relation "User" does not exist». Son el espejo
  // exacto del SQL que genera Prisma (`prisma migrate diff --from-empty`); en una base que ya las tiene no hacen nada.
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT,
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "termsVersion" TEXT,
    "cargo" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "city" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "epaycoPublicKey" TEXT,
    "epaycoPCustId" TEXT,
    "epaycoPKey" TEXT,
    "epaycoTest" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'user',
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
  )`,
  // Los únicos de las tablas base van en un DO/EXCEPTION (como PendingOrder_epaycoRef_key, más abajo): en una base heredada con
  // filas repetidas el índice no se puede crear, y una sentencia que falla siempre impediría memoizar el auto-reparado.
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'User_email_key no se pudo crear: %', SQLERRM;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
  )`,
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Account_provider_providerAccountId_key no se pudo crear: %', SQLERRM;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
  )`,
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Session_sessionToken_key no se pudo crear: %', SQLERRM;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // VerificationToken no tiene clave primaria en el esquema (solo los dos únicos).
  `CREATE TABLE IF NOT EXISTS "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
  )`,
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'VerificationToken_token_key no se pudo crear: %', SQLERRM;
  END $$`,
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'VerificationToken_identifier_token_key no se pudo crear: %', SQLERRM;
  END $$`,
  // addonAgents va NOT NULL (Prisma lo deja nulo): igual que el ALTER de más abajo, para que una base nueva y una reparada queden iguales.
  `CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "epaycoCustomerId" TEXT,
    "epaycoSubscriptionId" TEXT,
    "epaycoRef" TEXT,
    "planId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "addonAgents" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
  )`,
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_userId_key" ON "Subscription"("userId");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Subscription_userId_key no se pudo crear: %', SQLERRM;
  END $$`,
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_epaycoCustomerId_key" ON "Subscription"("epaycoCustomerId");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Subscription_epaycoCustomerId_key no se pudo crear: %', SQLERRM;
  END $$`,
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_epaycoSubscriptionId_key" ON "Subscription"("epaycoSubscriptionId");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Subscription_epaycoSubscriptionId_key no se pudo crear: %', SQLERRM;
  END $$`,
  `DO $$ BEGIN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "Property" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "units" INTEGER,
    "features" JSONB,
    "whatsapp" TEXT,
    "groupLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Property_userId_idx" ON "Property"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "Property" ADD CONSTRAINT "Property_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Generation.updatedAt lleva DEFAULT (Prisma no): es el mismo del ALTER de más abajo, para que las filas que insertan otros
  // caminos sin ese campo y las bases reparadas se comporten igual.
  `CREATE TABLE IF NOT EXISTS "Generation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "batchId" TEXT,
    "meetingId" TEXT,
    "inputFiles" JSONB NOT NULL,
    "inputText" TEXT,
    "outputFiles" JSONB,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Generation_userId_createdAt_idx" ON "Generation"("userId", "createdAt")`,
  `DO $$ BEGIN
    ALTER TABLE "Generation" ADD CONSTRAINT "Generation_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "Generation" ADD CONSTRAINT "Generation_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "UsageRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" INTEGER NOT NULL DEFAULT 0,
    "refType" TEXT,
    "refId" TEXT,
    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "UsageRecord_userId_date_idx" ON "UsageRecord"("userId", "date")`,
  `DO $$ BEGIN
    ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // Columnas de las tablas base que se agregaron al esquema DESPUÉS del primer `db push` (15-abr-2026) y que ningún ALTER cubría:
  // una base empujada entonces no las tiene. Son las únicas de las tablas base sin ALTER cuya fecha lo justifica.
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT`,
  `ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0`,
  // Consumo de IA por función (src/lib/consumo): el detalle de cada registro de uso. La lista vive en consumo/esquema.ts porque
  // registrar.ts también la usa (asegurarColumnasDeConsumo): así hay una sola copia.
  ...SENTENCIAS_COLUMNAS_CONSUMO,
  `CREATE INDEX IF NOT EXISTS "UsageRecord_type_date_idx" ON "UsageRecord"("type", "date")`,
  `CREATE INDEX IF NOT EXISTS "UsageRecord_refType_refId_idx" ON "UsageRecord"("refType", "refId")`,
  // Constancia de aceptación de los documentos legales (src/lib/legal).
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brandColor" TEXT`,
  // Moderation: ban/suspend a user (blocks login + revokes sessions).
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "banReason" TEXT`,
  // Revocación de sesiones al cambiar la contraseña (ver auth.ts).
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3)`,
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
  // Marca de actividad para el watchdog de lotes (ver process-batch). DEFAULT
  // now() para que las filas existentes no aparezcan como colgadas.
  `ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  // «meetingId» la agregó Reuniones (también la crea ensureMeetingsSchema), pero Prisma la pide en TODA consulta a Generation
  // (informes, historial, lotes): una base donde Reuniones nunca corrió se quedaba sin ella y fallaba la generación entera.
  `ALTER TABLE "Generation" ADD COLUMN IF NOT EXISTS "meetingId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Generation_meetingId_idx" ON "Generation"("meetingId")`,
  `CREATE INDEX IF NOT EXISTS "Generation_status_updatedAt_idx" ON "Generation"("status", "updatedAt")`,
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
  // Documentos de la copropiedad (manual de convivencia, reglamento). Antes los creaba ensureAgentTables, pero los leen rutas ajenas
  // a los agentes (la autorización de las subidas, el portal del residente, la generación): en una base nueva todas morían con
  // «relation does not exist» hasta que alguien abría el chat de un agente. Ahora van con las tablas base.
  `CREATE TABLE IF NOT EXISTS "PropertyDocument" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "extractedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertyDocument_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PropertyDocument_propertyId_idx" ON "PropertyDocument"("propertyId")`,
  `DO $$ BEGIN
    ALTER TABLE "PropertyDocument" ADD CONSTRAINT "PropertyDocument_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // F3.2b: cached extracted text of property documents (asistente del reglamento). La columna llegó después de la tabla.
  `ALTER TABLE "PropertyDocument" ADD COLUMN IF NOT EXISTS "extractedText" TEXT`,
  // F3.3: admin's own ePayco credentials + resident payment orders.
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "epaycoPublicKey" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "epaycoPCustId" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "epaycoPKey" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "epaycoTest" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE TABLE IF NOT EXISTS "UnitPaymentOrder" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "epaycoRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "UnitPaymentOrder_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UnitPaymentOrder_ref_key" ON "UnitPaymentOrder"("ref")`,
  `CREATE INDEX IF NOT EXISTS "UnitPaymentOrder_userId_idx" ON "UnitPaymentOrder"("userId")`,
  `CREATE INDEX IF NOT EXISTS "UnitPaymentOrder_unitId_idx" ON "UnitPaymentOrder"("unitId")`,
  `CREATE INDEX IF NOT EXISTS "UnitPaymentOrder_status_idx" ON "UnitPaymentOrder"("status")`,
  `ALTER TABLE "UnitPaymentOrder" ADD COLUMN IF NOT EXISTS "test" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "UnitPaymentOrder" ADD COLUMN IF NOT EXISTS "failReason" TEXT`,
  // Anti-replay: one ePayco transaction can settle AT MOST one order.
  `CREATE UNIQUE INDEX IF NOT EXISTS "UnitPaymentOrder_epaycoRef_key" ON "UnitPaymentOrder"("epaycoRef")`,
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
  // Clave de idempotencia del pago manual (ver cartera/payments): un reintento no duplica el pago.
  `ALTER TABLE "UnitPayment" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UnitPayment_idempotencyKey_key" ON "UnitPayment"("idempotencyKey")`,
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
  // Anti-replay de suscripciones: una transacción de ePayco no puede cerrar dos
  // órdenes. Va dentro de un DO/EXCEPTION porque si una base heredada ya tiene
  // refs duplicadas el índice no se puede crear, y una sentencia que falla
  // siempre impediría memoizar el auto-reparado en cada petición.
  `DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "PendingOrder_epaycoRef_key" ON "PendingOrder"("epaycoRef");
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PendingOrder_epaycoRef_key no se pudo crear: %', SQLERRM;
  END $$`,
  // Bitácora: zonas comunes y pólizas con fecha relevante (mantenimiento / vencimiento).
  `CREATE TABLE IF NOT EXISTS "CommonAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "recurrenceMonths" INTEGER,
    "lastDoneAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommonAsset_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CommonAsset_userId_idx" ON "CommonAsset"("userId")`,
  `CREATE INDEX IF NOT EXISTS "CommonAsset_propertyId_idx" ON "CommonAsset"("propertyId")`,
  `DO $$ BEGIN
    ALTER TABLE "CommonAsset" ADD CONSTRAINT "CommonAsset_propertyId_fkey"
      FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

/** Las sentencias, expuestas para la prueba que las compara con el esquema de Prisma y para POST /api/admin/migrate. */
export const SENTENCIAS_ADMIN = STATEMENTS;

/** Camino rápido: una consulta al catálogo que dice si ya existe todo lo de STATEMENTS (expuesto para las pruebas). */
export const CAMINO_RAPIDO_ADMIN = crearCaminoRapido("ensureAdminSchema", STATEMENTS);

let ensured = false;
let enCurso: Promise<void> | null = null;

export async function ensureAdminSchema(): Promise<void> {
  if (ensured) return;
  // Demo has no database — running 400+ DDL statements only to catch 400+
  // failures burned a second per call and flooded the log.
  if (process.env.DEMO_MODE === "true") {
    ensured = true;
    return;
  }

  // Las llamadas simultáneas de una instancia en frío comparten UNA ejecución: antes cada una corría las 160 sentencias a la vez
  // (y varios CREATE TABLE concurrentes sobre la misma tabla pueden chocar entre sí).
  enCurso ??= aplicar().finally(() => {
    enCurso = null;
  });
  await enCurso;
}

async function aplicar(): Promise<void> {
  // Base al día (lo normal): una sola consulta de solo lectura y ninguna sentencia de DDL.
  if (await CAMINO_RAPIDO_ADMIN.alDia((sql) => db.$queryRawUnsafe(sql))) {
    ensured = true;
    return;
  }

  let failures = 0;
  for (const sql of STATEMENTS) {
    try {
      await db.$executeRawUnsafe(sql);
    } catch (err) {
      failures++;
      console.error("[ensureAdminSchema] statement failed:", err);
    }
  }
  // Only memoize a clean run. Marking it done after failures cached a *failed*
  // self-heal for the life of the instance: if the very first call landed
  // while the DB was unreachable (cold start, Neon suspended, blip), every
  // later request skipped the DDL and the drift it exists to repair persisted
  // until the instance was recycled — the self-heal died exactly when needed.
  if (failures === 0) ensured = true;
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
