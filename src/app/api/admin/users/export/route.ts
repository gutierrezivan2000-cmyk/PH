export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { CAMPOS_DE_IDENTIDAD, codigoDeUsuario } from "@/lib/admin/identidad";
import { aCsv, diaEnBogota } from "@/lib/consumo/reporte";

const fecha = (d: Date | null | undefined) => (d ? d.toISOString() : "");

/** Directorio de clientes en CSV: identidad, contacto, fechas, plan y uso. Sin contenido generado. Queda en la auditoría. */
export async function GET() {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
  await ensureAdminSchema();
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [usuarios, costo] = await Promise.all([
    db.user.findMany({
      select: {
        ...CAMPOS_DE_IDENTIDAD,
        accounts: { select: { provider: true } },
        subscription: { select: { planId: true, status: true, currentPeriodEnd: true } },
        _count: { select: { properties: true, generations: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.usageRecord.groupBy({ by: ["userId"], where: { date: { gte: hace30 } }, _sum: { costUsd: true } }),
  ]);
  const costoDe = new Map(costo.map((c) => [c.userId, c._sum.costUsd ?? 0]));

  const csv = aCsv(
    [
      "codigo", "nombre", "correo", "telefono", "cargo", "empresa", "ciudad", "rol", "bloqueado", "ingreso_con", "correo_verificado",
      "registro", "ultimo_ingreso", "terminos_version", "terminos_aceptados", "plan", "estado_plan", "fin_periodo", "propiedades",
      "generaciones", "costo_ia_30d_usd",
    ],
    usuarios.map((u) => [
      codigoDeUsuario(u.id), u.name ?? "", u.email, u.phone ?? "", u.cargo ?? "", u.company ?? "", u.city ?? "", u.role, u.banned ? "si" : "no",
      u.accounts.some((a) => a.provider === "google") ? "google" : "correo", fecha(u.emailVerified), fecha(u.createdAt), fecha(u.lastLoginAt),
      u.termsVersion ?? "", fecha(u.termsAcceptedAt), u.subscription?.planId ?? "", u.subscription?.status ?? "", fecha(u.subscription?.currentPeriodEnd),
      u._count.properties, u._count.generations, Number((costoDe.get(u.id) ?? 0).toFixed(4)),
    ]),
  );

  await logAdminAction({ adminId: r.admin.userId, action: "user.export", targetType: "user", metadata: { filas: usuarios.length } });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${diaEnBogota(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
