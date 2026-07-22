export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Diagnostics expose env-var presence, DB info, and trigger a paid AI call —
  // admin-only. Accepts the dedicated migrate secret or an admin session.
  const secret = req.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_MIGRATE_SECRET;
  if (!expected || secret !== expected) {
    const { requireAdmin } = await import("@/lib/admin-auth");
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const results: Record<string, string> = {};
  const timings: Record<string, number> = {};

  // Step 1: Check env vars
  const start = Date.now();
  results.AUTH_SECRET = process.env.AUTH_SECRET ? "SET" : "MISSING";
  results.AUTH_GOOGLE_ID = process.env.AUTH_GOOGLE_ID ? "SET" : "MISSING";
  results.DATABASE_URL = process.env.DATABASE_URL ? "SET (" + process.env.DATABASE_URL?.substring(0, 20) + "...)" : "MISSING";
  results.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ? "SET" : "MISSING";
  results.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ? "SET" : "MISSING";
  results.DEMO_MODE = process.env.DEMO_MODE || "not set";
  results.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "not set (default claude-sonnet-5)";
  timings.envCheck = Date.now() - start;

  // Step 2: Test DB connection
  try {
    const t = Date.now();
    const { db } = await import("@/lib/db");
    timings.dbImport = Date.now() - t;

    const t2 = Date.now();
    const userCount = await db.user.count();
    timings.dbQuery = Date.now() - t2;
    results.db = `OK (${userCount} users)`;
  } catch (e) {
    timings.dbImport = Date.now() - start;
    results.db = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Step 3: Test AI call (tiny request)
  try {
    const t = Date.now();
    const { generateWithClaude } = await import("@/lib/ai-client");
    timings.aiImport = Date.now() - t;

    const t2 = Date.now();
    const res = await generateWithClaude(
      "Responde en una sola linea.",
      "Di 'OK funciona' y nada mas.",
    );
    timings.aiCall = Date.now() - t2;
    results.ai = `OK: "${res.text.substring(0, 50)}" (${res.tokensUsed} tokens, ${timings.aiCall}ms)`;
  } catch (e) {
    results.ai = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Step 4: Test Blob
  try {
    const t = Date.now();
    const { put, del } = await import("@vercel/blob");
    timings.blobImport = Date.now() - t;

    const t2 = Date.now();
    const blob = await put("debug/test.txt", "test", { access: "private", contentType: "text/plain" });
    timings.blobUpload = Date.now() - t2;
    results.blob = `OK: ${blob.url.substring(0, 50)}... (${timings.blobUpload}ms)`;

    // Clean up
    await del(blob.url);
  } catch (e) {
    results.blob = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    totalTime: Date.now() - start,
    timings,
    results,
  }, { status: 200 });
}
