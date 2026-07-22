export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const IS_DEMO = process.env.DEMO_MODE === "true";
const TYPES = ["peticion", "queja", "reclamo", "sugerencia"] as const;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,48}$/;

// Radicado: PQR- + 6 unambiguous chars (no 0/O/1/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const b = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `PQR-${s}`;
}

async function unitFromToken(token: string) {
  const { db } = await import("@/lib/db");
  return db.unit.findUnique({
    where: { portalToken: token },
    select: { id: true, label: true, propertyId: true, property: { select: { userId: true } } },
  });
}

/** List the unit's PQRS (portal view). Query: ?token=... */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!TOKEN_RE.test(token) || IS_DEMO) return NextResponse.json({ pqrs: [] });

  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const unit = await unitFromToken(token);
    if (!unit) return NextResponse.json({ pqrs: [] });

    const { db } = await import("@/lib/db");
    const pqrs = await db.pqrs.findMany({
      where: { unitId: unit.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json({ pqrs });
  } catch (e) {
    console.error("[portal pqrs GET]", e);
    return NextResponse.json({ pqrs: [] });
  }
}

/** Radicate a new PQRS from the portal. */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, code: "PQR-DEMO12", demo: true }, { status: 201 });

  const body = await req.json().catch(() => ({}));
  const { token, type, subject, message, residentName, residentContact } = body as {
    token?: string;
    type?: string;
    subject?: string;
    message?: string;
    residentName?: string;
    residentContact?: string;
  };

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Enlace inválido." }, { status: 400 });
  }
  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Asunto y mensaje son requeridos." }, { status: 400 });
  }
  const kind = TYPES.includes((type || "") as (typeof TYPES)[number]) ? (type as string) : "peticion";

  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const unit = await unitFromToken(token);
    if (!unit) return NextResponse.json({ error: "Enlace inválido." }, { status: 404 });

    // Anti-spam: 5 radicados/hour per unit + 20/hour per IP.
    const rl1 = await rateLimit(`pqrs:unit:${unit.id}`, { max: 5, windowMs: 60 * 60 * 1000 });
    const rl2 = await rateLimit(`pqrs:ip:${clientIp(req)}`, { max: 20, windowMs: 60 * 60 * 1000 });
    if (!rl1.allowed || !rl2.allowed) {
      return NextResponse.json(
        { error: "Has enviado varias solicitudes en poco tiempo. Intenta más tarde." },
        { status: 429 }
      );
    }

    const { db } = await import("@/lib/db");
    // Unique code with a couple retries.
    let created = null;
    for (let attempt = 0; attempt < 4 && !created; attempt++) {
      const code = newCode();
      try {
        created = await db.pqrs.create({
          data: {
            userId: unit.property.userId,
            propertyId: unit.propertyId,
            unitId: unit.id,
            unitLabel: unit.label,
            code,
            type: kind,
            subject: subject.trim().slice(0, 160),
            status: "radicado",
            residentName: residentName?.trim().slice(0, 100) || null,
            residentContact: residentContact?.trim().slice(0, 120) || null,
            messages: { create: { fromAdmin: false, content: message.trim().slice(0, 4000) } },
          },
          select: { code: true },
        });
      } catch {
        if (attempt === 3) throw new Error("code collision");
      }
    }

    return NextResponse.json({ ok: true, code: created!.code }, { status: 201 });
  } catch (e) {
    console.error("[portal pqrs POST]", e);
    return NextResponse.json({ error: "No se pudo radicar la solicitud. Intenta de nuevo." }, { status: 500 });
  }
}
