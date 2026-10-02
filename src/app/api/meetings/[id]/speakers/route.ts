export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoGuardarHablantes } from "@/lib/meetings/demo";
import { aHablante, type FilaHablante } from "@/lib/meetings/mapeo";
import { numeroDeEtiqueta, planificarGuardado } from "@/lib/meetings/nombres";
import { validarHablantes } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ id: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });

/**
 * PUT /api/meetings/[id]/speakers { hablantes: [{ label, name, role?, personId? }] } → { speakers }
 *
 * Le pone nombre a las voces de la reunión. Una voz con nombre queda confirmada; sin nombre, no. Varias voces con el MISMO
 * nombre se fusionan en una (la que más habla): sus intervenciones pasan a ella y las otras desaparecen. Las voces que no
 * se mencionan no se tocan, y las etiquetas que no existen se ignoran (repetir el mismo pedido es inofensivo).
 */
export async function PUT(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const valida = validarHablantes(await req.json().catch(() => null));
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });
  const { hablantes } = valida.valor;

  if (ctx.demo) {
    const r = demoGuardarHablantes(ctx.userId, id, hablantes);
    return r ? NextResponse.json({ speakers: r }) : NO_ENCONTRADA();
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NO_ENCONTRADA();

    // Las personas elegidas tienen que ser de ESTA copropiedad.
    const personas = [...new Set(hablantes.flatMap((h) => (h.personId ? [h.personId] : [])))];
    if (personas.length > 0) {
      const validas = await db.propertyPerson.findMany({ where: { propertyId: reunion.propertyId, id: { in: personas } }, select: { id: true } });
      if (validas.length !== personas.length) return NextResponse.json({ error: "Una de las personas no es de esta copropiedad." }, { status: 400 });
    }

    const existentes = await db.meetingSpeaker.findMany({
      where: { meetingId: id },
      select: { label: true, name: true, role: true, personId: true, confirmed: true, talkMs: true },
    });
    const plan = planificarGuardado(existentes, hablantes);

    // Todo junto: una fusión a medias dejaría intervenciones de una voz que ya no existe.
    const operaciones = [
      ...plan.fusiones.flatMap((f) => [
        db.meetingUtterance.updateMany({ where: { meetingId: id, speaker: { in: f.absorbidas } }, data: { speaker: f.canonica } }),
        db.meetingSpeaker.deleteMany({ where: { meetingId: id, label: { in: f.absorbidas } } }),
      ]),
      ...plan.actualizar.map((a) =>
        db.meetingSpeaker.updateMany({
          where: { meetingId: id, label: a.label },
          data: { name: a.name, role: a.role, personId: a.personId, confirmed: a.confirmed, talkMs: a.talkMs },
        }),
      ),
    ];
    if (operaciones.length > 0) await db.$transaction(operaciones);

    const filas: FilaHablante[] = await db.meetingSpeaker.findMany({ where: { meetingId: id } });
    const speakers = filas
      .sort((a, b) => b.talkMs - a.talkMs || numeroDeEtiqueta(a.label) - numeroDeEtiqueta(b.label))
      .map(aHablante);
    return NextResponse.json({ speakers });
  } catch (error) {
    console.error("[api/meetings/[id]/speakers PUT]", error);
    return NextResponse.json({ error: "No pudimos guardar los nombres." }, { status: 500 });
  }
}
