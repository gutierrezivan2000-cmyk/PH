export const runtime = "nodejs";
export const maxDuration = 60;

import { secretoCoincide } from "@/lib/secreto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SENTENCIAS_ADMIN } from "@/lib/ensure-admin-schema";
import { SENTENCIAS_AGENTES } from "@/lib/ensure-agent-tables";
import { SENTENCIAS_REUNIONES } from "@/lib/ensure-meetings-schema";
import { SENTENCIAS_OPERACION } from "@/lib/ensure-operacion-schema";

// Camino MANUAL para llevar la base al día (el `build` ya no corre `prisma db push`). Ejecuta TODAS las sentencias de los ensure*
// (las mismas que corren solas en cada ruta), en este orden: primero las de «admin», que crean las tablas base (User, Property…)
// de las que cuelgan las claves foráneas de las demás. Son idempotentes y aditivas: repetir la llamada es seguro.
const STATEMENTS: { name: string; sql: string }[] = (
  [
    ["admin", SENTENCIAS_ADMIN],
    ["agentes", SENTENCIAS_AGENTES],
    ["reuniones", SENTENCIAS_REUNIONES],
    ["operacion", SENTENCIAS_OPERACION],
  ] as [string, string[]][]
).flatMap(([familia, sentencias]) =>
  sentencias.map((sql, i) => ({ name: `${familia} ${i + 1}: ${sql.replace(/\s+/g, " ").trim().slice(0, 80)}`, sql }))
);

// Autenticación compartida por GET y POST: solo por header (un secreto en la URL queda en logs, historial y Referer).
// Exige un secreto DEDICADO: nunca caer en AUTH_SECRET (es la llave de firma del JWT y este endpoint corre DDL crudo).
function autorizar(req: NextRequest): NextResponse | null {
  const providedSecret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_MIGRATE_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "ADMIN_MIGRATE_SECRET no configurado en el servidor" },
      { status: 500 }
    );
  }

  if (!secretoCoincide(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Secret invalido o faltante" }, { status: 401 });
  }
  return null;
}

export async function POST(req: NextRequest) {
  const denegado = autorizar(req);
  if (denegado) return denegado;

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

export async function GET(req: NextRequest) {
  // El listado revela nombres de tablas y columnas: mismo control que POST.
  const denegado = autorizar(req);
  if (denegado) return denegado;
  return NextResponse.json({
    info: "Usa POST con el header x-admin-secret para ejecutar migraciones.",
    statements: STATEMENTS.map((s) => s.name),
  });
}
