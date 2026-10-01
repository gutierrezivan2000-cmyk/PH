export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPropertyById } from "@/lib/demo-store";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible } from "@/lib/meetings/acceso";
import { demoActualizarPersona, demoEliminarPersona } from "@/lib/meetings/demo";
import { aPersona } from "@/lib/meetings/mapeo";
import { validarCambiosPersona } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ propertyId: string; personId: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });

/** La persona solo se toca si su copropiedad es del usuario. */
function personaDelUsuario(personId: string, propertyId: string, userId: string) {
  return db.propertyPerson.findFirst({ where: { id: personId, propertyId, property: { userId } } });
}

/** PATCH /api/properties/[propertyId]/people/[personId] { name?, role?, active? } → { person } */
export async function PATCH(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { propertyId, personId } = await params;

  const valida = validarCambiosPersona(await req.json().catch(() => null));
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });

  if (ctx.demo) {
    if (!getPropertyById(propertyId, ctx.userId)) return NO_ENCONTRADA();
    const p = demoActualizarPersona(propertyId, personId, valida.valor);
    return p ? NextResponse.json({ person: p }) : NO_ENCONTRADA();
  }

  try {
    await ensureMeetingsSchema();
    if (!(await personaDelUsuario(personId, propertyId, ctx.userId))) return NO_ENCONTRADA();
    const actualizada = await db.propertyPerson.update({ where: { id: personId }, data: valida.valor });
    return NextResponse.json({ person: aPersona(actualizada) });
  } catch (error) {
    console.error("[api/people PATCH]", error);
    return NextResponse.json({ error: "No pudimos guardar los cambios." }, { status: 500 });
  }
}

/** DELETE /api/properties/[propertyId]/people/[personId]. Los hablantes de reuniones ya guardan su propio nombre. */
export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { propertyId, personId } = await params;

  if (ctx.demo) {
    if (!getPropertyById(propertyId, ctx.userId)) return NO_ENCONTRADA();
    return demoEliminarPersona(propertyId, personId) ? NextResponse.json({ ok: true }) : NO_ENCONTRADA();
  }

  try {
    await ensureMeetingsSchema();
    if (!(await personaDelUsuario(personId, propertyId, ctx.userId))) return NO_ENCONTRADA();
    await db.propertyPerson.delete({ where: { id: personId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/people DELETE]", error);
    return NextResponse.json({ error: "No pudimos eliminar a la persona." }, { status: 500 });
  }
}
