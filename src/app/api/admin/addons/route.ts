export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction, isEnvAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { codigoDeUsuario, filtroDeBusqueda } from "@/lib/admin/identidad";
import { MENSAJE_AUTOCONCESION, autoconcesionBloqueada, marcaDeCambioPropio } from "@/lib/admin/autoconcesion";
import { calcMrr } from "@/lib/plan";

const ADDON_AGENTS = ["metra", "nomethes", "hermes", "logistes"] as const;
type AddonAgent = (typeof ADDON_AGENTS)[number];

export async function GET(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const onlyWithSub = searchParams.get("onlyWithSub") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  // Nombre, correo, empresa, ciudad, teléfono o código.
  const busqueda = filtroDeBusqueda(q);
  if (busqueda) Object.assign(where, busqueda);
  if (onlyWithSub) {
    where.subscription = { isNot: null };
  }

  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      subscription: {
        select: {
          id: true,
          planId: true,
          status: true,
          addonAgents: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Per-addon stats: count of users with each addon
  const addonStats: Record<AddonAgent, { count: number; mrr: number }> = {
    metra: { count: 0, mrr: 0 },
    nomethes: { count: 0, mrr: 0 },
    hermes: { count: 0, mrr: 0 },
    logistes: { count: 0, mrr: 0 },
  };

  for (const u of users) {
    if (!u.subscription?.addonAgents) continue;
    for (const agent of u.subscription.addonAgents) {
      if (agent in addonStats) {
        addonStats[agent as AddonAgent].count += 1;
        addonStats[agent as AddonAgent].mrr += 5;
      }
    }
  }

  const enriched = users.map((u) => ({
    id: u.id,
    codigo: codigoDeUsuario(u.id),
    name: u.name,
    email: u.email,
    image: u.image,
    planId: u.subscription?.planId ?? null,
    subStatus: u.subscription?.status ?? "none",
    addonAgents: u.subscription?.addonAgents ?? [],
    monthlyTotal: u.subscription
      ? calcMrr(u.subscription.planId, u.subscription.addonAgents)
      : 0,
  }));

  return NextResponse.json({ users: enriched, addonStats });
}

export async function PATCH(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  let body: { userId: string; agent: AddonAgent; enabled: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Lista blanca: solo userId, agent y enabled; el resto del cuerpo se ignora.
  const { userId, agent, enabled } = body ?? ({} as typeof body);

  if (typeof userId !== "string" || !userId || typeof agent !== "string" || !agent || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Missing fields: userId, agent, enabled" }, { status: 400 });
  }

  if (!ADDON_AGENTS.includes(agent)) {
    return NextResponse.json(
      { error: `Invalid agent. Must be one of: ${ADDON_AGENTS.join(", ")}` },
      { status: 400 }
    );
  }

  // Un administrador no se activa add-ons a sí mismo (no pasaría por ningún cobro); los propietarios sí, para probarlos.
  if (autoconcesionBloqueada(admin.userId, userId, isEnvAdmin(admin.email))) {
    return NextResponse.json({ error: MENSAJE_AUTOCONCESION }, { status: 403 });
  }

  // Confirm target user exists
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Upsert subscription
  let subscription = await db.subscription.findUnique({ where: { userId } });

  let updatedAddons: string[];

  if (!subscription) {
    // Create stub subscription with the addon already set
    updatedAddons = enabled ? [agent] : [];
    subscription = await db.subscription.create({
      data: {
        userId,
        status: "inactive",
        addonAgents: updatedAddons,
      },
    });
  } else {
    const current = subscription.addonAgents ?? [];
    if (enabled) {
      updatedAddons = current.includes(agent) ? current : [...current, agent];
    } else {
      updatedAddons = current.filter((a) => a !== agent);
    }
    subscription = await db.subscription.update({
      where: { userId },
      data: { addonAgents: updatedAddons },
    });
  }

  // Audit log
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  await logAdminAction({
    adminId: admin.userId,
    action: "addon.toggle",
    targetType: "subscription",
    targetId: subscription.id,
    metadata: { userId, agent, enabled, ...marcaDeCambioPropio(admin.userId, userId) },
    ipAddress: ip,
  });

  return NextResponse.json({
    ok: true,
    addonAgents: updatedAddons,
  });
}
