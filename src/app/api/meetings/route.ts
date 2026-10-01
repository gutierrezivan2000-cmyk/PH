export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { getPropertyById } from "@/lib/demo-store";
import { exigirVisible, propiedadDelUsuario } from "@/lib/meetings/acceso";
import { SELECCION_RESUMEN } from "@/lib/meetings/consultas";
import { MAX_REUNIONES_DEMO, demoCrearReunion, demoReuniones } from "@/lib/meetings/demo";
import { aResumen } from "@/lib/meetings/mapeo";
import { tituloSugerido } from "@/lib/meetings/tipos";
import { validarNuevaReunion } from "@/lib/meetings/validar";

/** La lista no pagina: 200 reuniones son años de consejos de una copropiedad. */
const MAX_LISTA = 200;

/** GET /api/meetings?propertyId= → { items: ReunionResumen[] } (la más reciente primero). */
export async function GET(req: NextRequest) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const propertyId = req.nextUrl.searchParams.get("propertyId")?.trim() || null;

  if (ctx.demo) return NextResponse.json({ items: demoReuniones(ctx.userId, propertyId) });

  try {
    await ensureMeetingsSchema();
    const filas = await db.meeting.findMany({
      where: { userId: ctx.userId, ...(propertyId ? { propertyId } : {}) },
      orderBy: { date: "desc" },
      take: MAX_LISTA,
      select: SELECCION_RESUMEN,
    });
    return NextResponse.json({ items: filas.map((f) => aResumen(f)) });
  } catch (error) {
    console.error("[api/meetings GET]", error);
    return NextResponse.json({ error: "No pudimos cargar las reuniones." }, { status: 500 });
  }
}

/** POST /api/meetings { propertyId, type?, title?, date? } → 201 { meeting } (un borrador, todavía sin audio). */
export async function POST(req: NextRequest) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;

  const valida = validarNuevaReunion(await req.json().catch(() => null));
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });
  const { propertyId, type, date } = valida.valor;
  const title = valida.valor.title ?? tituloSugerido(type, date);

  if (ctx.demo) {
    if (!getPropertyById(propertyId, ctx.userId)) {
      return NextResponse.json({ error: "Copropiedad no encontrada" }, { status: 404 });
    }
    const creada = demoCrearReunion(ctx.userId, { propertyId, type, title, date });
    if (!creada) {
      return NextResponse.json(
        { error: `El demo admite hasta ${MAX_REUNIONES_DEMO} reuniones. Elimina alguna para crear otra.` },
        { status: 403 },
      );
    }
    return NextResponse.json({ meeting: creada }, { status: 201 });
  }

  try {
    await ensureMeetingsSchema();
    const propiedad = await propiedadDelUsuario(propertyId, ctx.userId);
    if (!propiedad) return NextResponse.json({ error: "Copropiedad no encontrada" }, { status: 404 });
    const fila = await db.meeting.create({
      data: { userId: ctx.userId, propertyId, type, title, date },
      select: SELECCION_RESUMEN,
    });
    return NextResponse.json({ meeting: aResumen(fila) }, { status: 201 });
  } catch (error) {
    console.error("[api/meetings POST]", error);
    return NextResponse.json({ error: "No pudimos crear la reunión." }, { status: 500 });
  }
}
