/**
 * Ponerle nombre a las voces de una reunión, y fusionarlas.
 *
 * La transcripción solo sabe «Voz 1», «Voz 2»… La persona (o la IA, como sugerencia) les pone nombre. Dos voces con el
 * MISMO nombre son la misma persona que el reconocimiento partió en dos: se fusionan en una (la que más habla) y sus
 * intervenciones pasan a ella. `planificarGuardado` decide todo eso sin tocar la base, para probarlo a fondo y para que la
 * ruta de verdad y el demo hagan exactamente lo mismo.
 */

export type FilaDeHablante = {
  label: string;
  name: string | null;
  role: string | null;
  personId: string | null;
  confirmed: boolean;
  talkMs: number;
};

export type PedidoDeHablante = { label: string; name: string | null; role: string | null; personId: string | null };

export type PlanDeGuardado = {
  /** Lo que queda escrito en cada voz que sigue existiendo y cambia (las de una fusión llevan el habla sumada). */
  actualizar: Array<{ label: string; name: string | null; role: string | null; personId: string | null; confirmed: boolean; talkMs: number }>;
  /** Voces que se absorben en otra: sus intervenciones pasan a `canonica` y su fila se borra. */
  fusiones: Array<{ canonica: string; absorbidas: string[]; talkMs: number }>;
};

/** El número de una etiqueta: V1 → 1, H12 → 12 (para ordenar y desempatar). */
export const numeroDeEtiqueta = (label: string): number => {
  const m = /^[VH](\d+)$/.exec(label);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
};

/** Dos nombres son el mismo si solo cambian las mayúsculas, las tildes o los espacios. */
export const claveDeNombre = (nombre: string): string =>
  nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function planificarGuardado(existentes: readonly FilaDeHablante[], pedidos: readonly PedidoDeHablante[]): PlanDeGuardado {
  const pedidoDe = new Map(pedidos.map((p) => [p.label, p]));

  // Cómo quedaría cada voz: lo pedido, o lo que ya tenía si no se mencionó.
  const quedaria = existentes.map((e) => {
    const p = pedidoDe.get(e.label);
    const name = (p ? p.name : e.name)?.trim() || null;
    return {
      label: e.label,
      name,
      role: (p ? p.role : e.role)?.trim() || null,
      personId: (p ? p.personId : e.personId) || null,
      talkMs: e.talkMs,
      tocada: Boolean(p),
    };
  });

  // Las voces con el mismo nombre forman un grupo; en cada grupo de dos o más, manda la que más habla.
  const grupos = new Map<string, typeof quedaria>();
  for (const q of quedaria) {
    if (!q.name) continue;
    const clave = claveDeNombre(q.name);
    grupos.set(clave, [...(grupos.get(clave) ?? []), q]);
  }
  const absorbidas = new Set<string>();
  const fusiones: PlanDeGuardado["fusiones"] = [];
  const conFusion = new Map<string, { role: string | null; personId: string | null; talkMs: number; name: string }>();
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const orden = [...grupo].sort((a, b) => b.talkMs - a.talkMs || numeroDeEtiqueta(a.label) - numeroDeEtiqueta(b.label));
    const canonica = orden[0];
    const otras = orden.slice(1);
    for (const o of otras) absorbidas.add(o.label);
    const talkMs = orden.reduce((s, x) => s + x.talkMs, 0);
    fusiones.push({ canonica: canonica.label, absorbidas: otras.map((o) => o.label).sort((a, b) => numeroDeEtiqueta(a) - numeroDeEtiqueta(b)), talkMs });
    conFusion.set(canonica.label, {
      name: canonica.name as string,
      role: canonica.role ?? orden.find((x) => x.role)?.role ?? null,
      personId: canonica.personId ?? orden.find((x) => x.personId)?.personId ?? null,
      talkMs,
    });
  }

  const actualizar: PlanDeGuardado["actualizar"] = [];
  for (const q of quedaria) {
    if (absorbidas.has(q.label)) continue;
    const f = conFusion.get(q.label);
    if (!q.tocada && !f) continue; // una voz que no se tocó ni se fusiona se deja como está
    actualizar.push({
      label: q.label,
      name: f?.name ?? q.name,
      role: f ? f.role : q.role,
      personId: f ? f.personId : q.personId,
      confirmed: Boolean(q.name),
      talkMs: f ? f.talkMs : q.talkMs,
    });
  }
  return { actualizar, fusiones: fusiones.sort((a, b) => numeroDeEtiqueta(a.canonica) - numeroDeEtiqueta(b.canonica)) };
}
