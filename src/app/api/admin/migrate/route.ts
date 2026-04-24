export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const STATEMENTS: { name: string; sql: string }[] = [
  {
    name: "PropertyDocument table",
    sql: `CREATE TABLE IF NOT EXISTS "PropertyDocument" (
      "id" TEXT NOT NULL,
      "propertyId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "size" INTEGER NOT NULL DEFAULT 0,
      "mimeType" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PropertyDocument_pkey" PRIMARY KEY ("id")
    )`,
  },
  {
    name: "PropertyDocument propertyId index",
    sql: `CREATE INDEX IF NOT EXISTS "PropertyDocument_propertyId_idx" ON "PropertyDocument"("propertyId")`,
  },
  {
    name: "AgentChat table",
    sql: `CREATE TABLE IF NOT EXISTS "AgentChat" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "agentId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT 'Nueva conversacion',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "AgentChat_pkey" PRIMARY KEY ("id")
    )`,
  },
  {
    name: "AgentChat userId_agentId index",
    sql: `CREATE INDEX IF NOT EXISTS "AgentChat_userId_agentId_idx" ON "AgentChat"("userId", "agentId")`,
  },
  {
    name: "AgentMessage table",
    sql: `CREATE TABLE IF NOT EXISTS "AgentMessage" (
      "id" TEXT NOT NULL,
      "chatId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "attachments" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
    )`,
  },
  {
    name: "AgentMessage chatId index",
    sql: `CREATE INDEX IF NOT EXISTS "AgentMessage_chatId_idx" ON "AgentMessage"("chatId")`,
  },
  {
    name: "AgentMemory table",
    sql: `CREATE TABLE IF NOT EXISTS "AgentMemory" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "agentId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
    )`,
  },
  {
    name: "AgentMemory userId_agentId unique index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "AgentMemory_userId_agentId_key" ON "AgentMemory"("userId", "agentId")`,
  },
  {
    name: "PropertyDocument FK",
    sql: `DO $$ BEGIN
      ALTER TABLE "PropertyDocument" ADD CONSTRAINT "PropertyDocument_propertyId_fkey"
        FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  },
  {
    name: "AgentChat FK",
    sql: `DO $$ BEGIN
      ALTER TABLE "AgentChat" ADD CONSTRAINT "AgentChat_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  },
  {
    name: "AgentMessage FK",
    sql: `DO $$ BEGIN
      ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_chatId_fkey"
        FOREIGN KEY ("chatId") REFERENCES "AgentChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  },
  {
    name: "AgentMemory FK",
    sql: `DO $$ BEGIN
      ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  },
];

export async function POST(req: NextRequest) {
  const providedSecret =
    req.headers.get("x-admin-secret") || new URL(req.url).searchParams.get("secret");

  const expectedSecret = process.env.ADMIN_MIGRATE_SECRET || process.env.AUTH_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "ADMIN_MIGRATE_SECRET (o AUTH_SECRET) no configurado en el servidor" },
      { status: 500 }
    );
  }

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Secret invalido o faltante" }, { status: 401 });
  }

  const results: { name: string; status: "ok" | "failed"; error?: string }[] = [];

  for (const stmt of STATEMENTS) {
    try {
      await db.$executeRawUnsafe(stmt.sql);
      results.push({ name: stmt.name, status: "ok" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: stmt.name, status: "failed", error: msg });
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results,
  });
}

export async function GET() {
  return NextResponse.json({
    info: "Usa POST con header x-admin-secret o ?secret=... para ejecutar migraciones.",
    statements: STATEMENTS.map((s) => s.name),
  });
}
