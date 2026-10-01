export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPropertyById } from "@/lib/demo-store";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, propiedadDelUsuario } from "@/lib/meetings/acceso";
import { MAX_PERSONAS_DEMO, demoCrearPersona, demoPersonas } from "@/lib/meetings/demo";
import { aPersona } from "@/lib/meetings/mapeo";
import { validarPersona } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ propertyId: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Copropiedad no encontrada" }, { status: 404 });
const MAX_PERSONAS = 200;

/** GET /api/properties/[propertyId]/people → { items: PersonaDTO[] } (activas, por nombre). */
export async function GET(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { propertyId } = await params;

  if (ctx.demo) {
    if (!getPropertyById(propertyId, ctx.userId)) return NO_ENCONTRADA();
    return NextResponse.json({ items: demoPersonas(propertyId) });
  }

  try {
    await ensureMeetingsSchema();
    if (!(await propiedadDelUsuario(propertyId, ctx.userId))) return NO_ENCONTRADA();
    const filas = await db.propertyPerson.findMany({ where: { propertyId, active: true }, orderBy: { name: "asc" } });
    return NextResponse.json({ items: filas.map(aPersona) });
  } catch (error) {
    console.error("[api/people GET]", error);
    return NextResponse.json({ error: "No pudimos cargar las personas." }, { status: 500 });
  }
}

/**
 * POST /api/properties/[propertyId]/people { name, role? } → { person }.
 * Es idempotente por nombre: si ya hay una persona activa con ese nombre devuelve esa (200), así
 * «Otra persona…» en la lista de hablantes no duplica a nadie. Si la crea, 201.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { propertyId } = await params;

  const valida = validarPersona(await req.json().catch(() => null));
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });
  const { name, role } = valida.valor;

  if (ctx.demo) {
    if (!getPropertyById(propertyId, ctx.userId)) return NO_ENCONTRADA();
    const r = demoCrearPersona(propertyId, { name, role });
    if (!r) {
      return NextResponse.json({ error: `El demo admite hasta ${MAX_PERSONAS_DEMO} personas por copropiedad.` }, { status: 403 });
    }
    return NextResponse.json({ person: r.persona }, { status: r.creada ? 201 : 200 });
  }

  try {
    await ensureMeetingsSchema();
    if (!(await propiedadDelUsuario(propertyId, ctx.userId))) return NO_ENCONTRADA();
    const existente = await db.propertyPerson.findFirst({
      where: { propertyId, active: true, name: { equals: name, mode: "insensitive" } },
    });
    if (existente) return NextResponse.json({ person: aPersona(existente) }, { status: 200 });
    if ((await db.propertyPerson.count({ where: { propertyId } })) >= MAX_PERSONAS) {
      return NextResponse.json({ error: `Máximo ${MAX_PERSONAS} personas por copropiedad.` }, { status: 400 });
    }
    const creada = await db.propertyPerson.create({ data: { propertyId, name, role } });
    return NextResponse.json({ person: aPersona(creada) }, { status: 201 });
  } catch (error) {
    console.error("[api/people POST]", error);
    return NextResponse.json({ error: "No pudimos guardar a la persona." }, { status: 500 });
  }
}
