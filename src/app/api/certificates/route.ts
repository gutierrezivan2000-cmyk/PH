export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exigirModulo } from "@/lib/modulos-acceso";
import { randomBytes } from "node:crypto";
import { computeUnitSummary } from "@/lib/cartera";
import { registrarEvento } from "@/lib/agentes/eventos";
import {
  TIPOS_DE_CERTIFICADO,
  decidirPazYSalvo,
  validarMotivoDeRevocacion,
  vigenciaPorDefecto,
  type TipoDeCertificado,
} from "@/lib/certificados";

const IS_DEMO = process.env.DEMO_MODE === "true";

const TYPES = TIPOS_DE_CERTIFICADO;

function newVerifyCode(): string {
  // 12 URL-safe chars ≈ 72 bits of entropy — unguessable, short enough to type.
  return randomBytes(9).toString("base64url");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  {
    const puerta = await exigirModulo("certificados");
    if ("error" in puerta) return puerta.error;
  }
  if (IS_DEMO) {
    const { getDemoCertificates } = await import("@/lib/demo-store");
    return NextResponse.json({
      certificates: getDemoCertificates(req.nextUrl.searchParams.get("propertyId")),
    });
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const where: { userId: string; propertyId?: string } = { userId: session.user.id };
    if (propertyId) where.propertyId = propertyId;

    const certificates = await db.certificate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { property: { select: { name: true } } },
    });
    return NextResponse.json({ certificates });
  } catch (error) {
    console.error("[certificates GET]", error);
    return NextResponse.json({ error: "Error al cargar certificados" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  {
    const puerta = await exigirModulo("certificados");
    if ("error" in puerta) return puerta.error;
  }

  const body = await req.json().catch(() => ({}));
  const { propertyId, type, unitId, unitLabel, recipientName, recipientDocument, validUntil, residesSince, note, confirmaAlDia } =
    body as {
      confirmaAlDia?: boolean;
      propertyId?: string;
      type?: string;
      unitId?: string;
      unitLabel?: string;
      recipientName?: string;
      recipientDocument?: string;
      validUntil?: string;
      residesSince?: string;
      note?: string;
    };

  if (!propertyId || !TYPES.includes(type as (typeof TYPES)[number])) {
    return NextResponse.json({ error: "Tipo de certificado inválido." }, { status: 400 });
  }
  if (!recipientName?.trim()) {
    return NextResponse.json({ error: "El nombre del titular es requerido." }, { status: 400 });
  }
  if (validUntil) {
    // Real calendar-date validation: reject both non-parsing values
    // (2026-13-05) and silently-rolling ones (2026-02-31).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(validUntil);
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    if (
      !m ||
      !d ||
      d.getUTCFullYear() !== +m[1] ||
      d.getUTCMonth() !== +m[2] - 1 ||
      d.getUTCDate() !== +m[3]
    ) {
      return NextResponse.json({ error: "Fecha de validez inválida." }, { status: 400 });
    }
  }

  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true }, { status: 201 });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { checkSubscriptionAccess } = await import("@/lib/usage");

    const access = await checkSubscriptionAccess(session.user.id);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason || "Necesitas una suscripción activa para expedir certificados." },
        { status: 403 }
      );
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    // Resolve the unit. Any client-supplied unitId must belong to THIS
    // property (never persist an unvalidated cross-tenant reference), and when
    // a unit is selected its directory label wins over any stale free text.
    let safeUnitId: string | null = null;
    let label = "";
    let cartera: { enMora: number; saldo: number } | null = null;
    const SELECCION_DE_UNIDAD = {
      label: true,
      charges: { select: { amount: true, paidAmount: true, dueDate: true } },
      payments: { select: { amount: true } },
    } as const;
    const aCartera = (unit: { charges: { amount: number; paidAmount: number; dueDate: Date }[]; payments: { amount: number }[] }) => {
      const resumen = computeUnitSummary(unit.charges, unit.payments.reduce((s, p) => s + p.amount, 0), new Date());
      return { enMora: resumen.overdueAmount, saldo: resumen.balance };
    };
    if (unitId) {
      const unit = await db.unit.findFirst({ where: { id: unitId, propertyId }, select: SELECCION_DE_UNIDAD });
      if (!unit) {
        return NextResponse.json({ error: "Unidad no encontrada." }, { status: 400 });
      }
      safeUnitId = unitId;
      label = unit.label;
      cartera = aCartera(unit);
    } else {
      const escrita = unitLabel?.trim().slice(0, 60) || "";
      label = escrita;
      // Una unidad escrita a mano que SÍ existe en el directorio se trata como tal: su cartera se consulta igual. Si no, el
      // «está al día» de quien emite sería la única verificación, y el paz y salvo podría afirmar algo falso.
      if (escrita) {
        const coincidencias = await db.unit.findMany({
          where: { propertyId, label: { equals: escrita, mode: "insensitive" } },
          select: { id: true, ...SELECCION_DE_UNIDAD },
          take: 2,
        });
        if (coincidencias.length === 1) {
          safeUnitId = coincidencias[0].id;
          label = coincidencias[0].label;
          cartera = aCartera(coincidencias[0]);
        } else if (coincidencias.length > 1) {
          return NextResponse.json({ error: "Hay varias unidades con ese nombre en la copropiedad. Elígela de la lista." }, { status: 400 });
        }
      }
    }
    if (!label) {
      return NextResponse.json({ error: "Indica la unidad (ej: Apto 502)." }, { status: 400 });
    }

    const meta: Record<string, string | number> = {};
    const tipo = type as TipoDeCertificado;
    // Un paz y salvo afirma que la unidad está al día: se verifica contra la cartera antes de emitirlo y queda constancia.
    if (tipo === "paz_y_salvo") {
      const decision = decidirPazYSalvo({ cartera, confirmaAlDia: confirmaAlDia === true });
      if (!decision.ok) {
        return NextResponse.json(
          { error: decision.mensaje, code: decision.codigo, enMora: decision.enMora, saldo: decision.saldo },
          { status: decision.codigo === "saldo_pendiente" ? 409 : 400 }
        );
      }
      meta.verificadoCon = decision.verificacion.origen;
      meta.verificadoEn = new Date().toISOString();
      if (decision.verificacion.origen === "cartera") {
        meta.saldoAlEmitir = Math.round(decision.verificacion.saldo); // saldo total (puede incluir cobros que aún no vencen)
        meta.vencidoAlEmitir = 0; // la regla: sin valores vencidos sin pagar
      }
    }
    meta.emitidoEn = new Date().toISOString();
    if (recipientDocument?.trim()) meta.recipientDocument = recipientDocument.trim().slice(0, 30);
    // Todo certificado vence: si no se indica una fecha, se aplica la vigencia por defecto del tipo.
    meta.validUntil = validUntil || vigenciaPorDefecto(tipo);
    if (residesSince?.trim()) meta.residesSince = residesSince.trim().slice(0, 100);
    if (note?.trim()) meta.note = note.trim().slice(0, 600);

    const certificate = await db.certificate.create({
      data: {
        userId: session.user.id,
        propertyId,
        unitId: safeUnitId,
        type: type as string,
        recipientName: recipientName.trim().slice(0, 120),
        unitLabel: label,
        meta,
        verifyCode: newVerifyCode(),
      },
    });

    await registrarEvento({
      userId: session.user.id,
      propertyId,
      modulo: "certificados",
      accion: "certificado_emitido",
      resumen: `Certificado de ${type} emitido para ${label}`,
      refType: "Certificate",
      refId: certificate.id,
    });

    return NextResponse.json({ ok: true, id: certificate.id }, { status: 201 });
  } catch (error) {
    console.error("[certificates POST]", error);
    return NextResponse.json({ error: "Error al expedir el certificado" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  {
    const puerta = await exigirModulo("certificados");
    if ("error" in puerta) return puerta.error;
  }

  const body = await req.json().catch(() => ({}));
  const { id, action, reason } = body as { id?: string; action?: string; reason?: string };
  if (action === "restore") {
    return NextResponse.json(
      { error: "Una revocación es definitiva. Si el certificado se revocó por error, expide uno nuevo." },
      { status: 400 }
    );
  }
  if (!id || action !== "revoke") {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  const motivo = validarMotivoDeRevocacion(reason);
  if (!motivo.ok) return NextResponse.json({ error: motivo.error }, { status: 400 });

  if (IS_DEMO) return NextResponse.json({ ok: true });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const existing = await db.certificate.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, status: true, meta: true, propertyId: true, type: true, unitLabel: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Certificado no encontrado" }, { status: 404 });
    }
    if (existing.status === "revoked") return NextResponse.json({ ok: true });

    const antes = (existing.meta && typeof existing.meta === "object" ? existing.meta : {}) as Record<string, unknown>;
    // Solo si sigue vigente: dos revocaciones a la vez no pueden pisarse el registro de quién y por qué.
    const revocado = await db.certificate.updateMany({
      where: { id, userId: session.user.id, status: "valid" },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        meta: { ...antes, revocacion: { motivo: motivo.motivo, por: session.user.id, en: new Date().toISOString() } },
      },
    });
    if (revocado.count !== 1) return NextResponse.json({ ok: true });
    await registrarEvento({
      userId: session.user.id,
      propertyId: existing.propertyId,
      modulo: "certificados",
      accion: "certificado_revocado",
      resumen: `Certificado de ${existing.type} de ${existing.unitLabel} revocado`,
      refType: "Certificate",
      refId: existing.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[certificates PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
