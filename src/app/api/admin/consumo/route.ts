export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401 } from "@/lib/admin-auth";
import { personas, registrosDelPeriodo } from "@/lib/consumo/consultas";
import { codigoDeUsuario } from "@/lib/admin/identidad";
import { funcionDe } from "@/lib/consumo/funciones";
import { aCsv, informeDeConsumo, periodoPedido, segundosDeAudio } from "@/lib/consumo/reporte";

const VISTAS = ["funciones", "productos", "usuarios", "registros"] as const;
type Vista = (typeof VISTAS)[number];

/**
 * GET /api/admin/consumo?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&formato=csv&vista=funciones|productos|usuarios|registros]
 *
 * El consumo de IA del periodo (días de Bogotá, `hasta` incluido; por omisión el mes en curso), para precificar: por función,
 * por operación completa (generación, reunión, chat, importación) y por usuario. Con `formato=csv` descarga la vista pedida;
 * `registros` es cada llamada, para analizar aparte. Solo administradores.
 */
export async function GET(req: NextRequest) {
  const acceso = await requireAdminOr401();
  if ("error" in acceso) return acceso.error;

  const q = req.nextUrl.searchParams;
  const periodo = periodoPedido(q.get("desde"), q.get("hasta"));
  try {
    const { registros, truncado } = await registrosDelPeriodo(periodo);
    const informe = informeDeConsumo(registros);
    const gente = await personas([...new Set(registros.map((r) => r.userId))]);

    if (q.get("formato") !== "csv") {
      return NextResponse.json({
        periodo: { desde: periodo.desdeDia, hasta: periodo.hastaDia },
        truncado,
        ...informe,
        porUsuario: informe.porUsuario.map((u) => ({ ...u, ...(gente.get(u.userId) ?? { codigo: codigoDeUsuario(u.userId), nombre: "", email: "", empresa: "", plan: "" }) })),
      });
    }

    const vista: Vista = (VISTAS as readonly string[]).includes(q.get("vista") ?? "") ? (q.get("vista") as Vista) : "funciones";
    const usd = (n: number) => Number(n.toFixed(6));
    let encabezado: string[];
    let filas: Array<Array<string | number>>;
    if (vista === "funciones") {
      encabezado = ["grupo", "funcion", "tipo", "unidad", "veces", "usuarios", "costo_usd", "costo_promedio_usd", "costo_mediana_usd", "costo_p90_usd", "costo_max_usd", "tokens_entrada", "tokens_salida", "tokens_cache_lectura", "tokens_cache_escritura", "minutos_audio", "usd_por_hora_audio", "registros_estimados", "modelos"];
      filas = informe.porFuncion.map((f) => [
        f.grupo, f.nombre, f.tipo, f.unidad, f.veces, f.usuarios, usd(f.costoUsd), usd(f.porVez.promedio), usd(f.porVez.mediana), usd(f.porVez.p90), usd(f.porVez.maximo),
        f.entrada, f.salida, f.cacheLectura, f.cacheEscritura, Number((f.audioSegundos / 60).toFixed(2)), f.usdPorHoraDeAudio === null ? "" : usd(f.usdPorHoraDeAudio), f.estimados, f.modelos.join(" "),
      ]);
    } else if (vista === "productos") {
      encabezado = ["operacion", "tipo", "operaciones", "costo_usd", "costo_promedio_usd", "costo_mediana_usd", "costo_p90_usd", "costo_max_usd", "usd_por_hora_audio", "composicion"];
      filas = informe.porProducto.map((p) => [
        p.nombre, p.tipo, p.operaciones, usd(p.costoUsd), usd(p.porOperacion.promedio), usd(p.porOperacion.mediana), usd(p.porOperacion.p90), usd(p.porOperacion.maximo),
        p.usdPorHoraDeAudio === null ? "" : usd(p.usdPorHoraDeAudio), p.composicion.map((c) => `${c.tipo}=${c.porOperacion.toFixed(4)}`).join(" "),
      ]);
    } else if (vista === "usuarios") {
      encabezado = ["codigo", "nombre", "correo", "empresa", "plan", "grupo", "funcion", "tipo", "veces", "costo_usd"];
      filas = informe.porUsuario.flatMap((u) => {
        const p = gente.get(u.userId) ?? { codigo: codigoDeUsuario(u.userId), nombre: "", email: "", empresa: "", plan: "" };
        return u.porTipo.map((t) => [p.codigo, p.nombre, p.email, p.empresa, p.plan, funcionDe(t.tipo).grupo, t.nombre, t.tipo, t.veces, usd(t.costoUsd)]);
      });
    } else {
      encabezado = ["fecha", "codigo", "correo", "funcion", "tipo", "proveedor", "modelo", "tokens_entrada", "tokens_salida", "tokens_cache_lectura", "tokens_cache_escritura", "segundos_audio", "costo_usd", "operacion", "operacion_id"];
      filas = registros.map((r) => [
        r.date.toISOString(), codigoDeUsuario(r.userId), gente.get(r.userId)?.email ?? "", funcionDe(r.type).nombre, r.type, r.provider ?? "", r.model ?? "",
        r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens, segundosDeAudio(r), usd(r.costUsd), r.refType ?? "", r.refId ?? "",
      ]);
    }
    return new NextResponse(aCsv(encabezado, filas), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="consumo-${vista}-${periodo.desdeDia}_${periodo.hastaDia}.csv"`,
        "Cache-Control": "no-store",
        ...(truncado ? { "X-Consumo-Truncado": "1" } : {}),
      },
    });
  } catch (error) {
    console.error("[api/admin/consumo]", error);
    return NextResponse.json({ error: "No pudimos calcular el consumo." }, { status: 500 });
  }
}
