/**
 * La lógica de la pestaña «Hablantes» que no depende de React: qué eligió la persona para cada voz, qué nombre queda, qué voces
 * se van a unir y qué se manda a guardar. Va aparte para probarla a fondo.
 */
import type { HablanteDTO, PersonaDTO } from "./dto";
import { claveDeNombre, type PedidoDeHablante } from "./nombres";
import { ROLES_PERSONA, esRolPersona, type RolPersona } from "./tipos";

/** El valor del selector de nombre para «Otra persona…» (se escribe el nombre a mano y se crea la persona). */
export const OTRA = "__otra__";

export type EleccionDeVoz = {
  /** "" = sin nombre; el identificador de una persona de la copropiedad; o `OTRA`. */
  persona: string;
  /** El nombre escrito a mano cuando `persona` es `OTRA`. */
  libre: string;
  /** "" = sin rol. */
  rol: "" | RolPersona;
};

/** «Presidente del consejo» o «presidente» → «presidente»; lo que no se reconoce, "". */
export function rolDeTexto(texto: string | null | undefined): "" | RolPersona {
  if (!texto) return "";
  if (esRolPersona(texto)) return texto;
  const buscado = claveDeNombre(texto);
  const clave = (Object.keys(ROLES_PERSONA) as RolPersona[]).find((k) => claveDeNombre(ROLES_PERSONA[k]) === buscado);
  return clave ?? "";
}

const personaPorNombre = (nombre: string, personas: readonly PersonaDTO[]) => personas.find((p) => claveDeNombre(p.name) === claveDeNombre(nombre));

/** Lo que muestra el formulario al abrirse: lo ya guardado de esa voz. */
export function eleccionInicial(h: HablanteDTO, personas: readonly PersonaDTO[]): EleccionDeVoz {
  const persona = h.personId ? personas.find((p) => p.id === h.personId) : undefined;
  if (persona) return { persona: persona.id, libre: "", rol: rolDeTexto(h.role) || rolDeTexto(persona.role) };
  if (h.name) {
    const igual = personaPorNombre(h.name, personas);
    if (igual) return { persona: igual.id, libre: "", rol: rolDeTexto(h.role) || rolDeTexto(igual.role) };
    return { persona: OTRA, libre: h.name, rol: rolDeTexto(h.role) };
  }
  return { persona: "", libre: "", rol: "" };
}

/** Lo que pasa al pulsar «Usar este nombre» en la sugerencia de la IA. */
export function aplicarSugerencia(h: HablanteDTO, personas: readonly PersonaDTO[]): EleccionDeVoz {
  const sug = h.suggestion;
  if (!sug?.nombre) return eleccionInicial(h, personas);
  const igual = personaPorNombre(sug.nombre, personas);
  if (igual) return { persona: igual.id, libre: "", rol: rolDeTexto(sug.rol) || rolDeTexto(igual.role) };
  return { persona: OTRA, libre: sug.nombre, rol: rolDeTexto(sug.rol) };
}

/** Elegir una persona de la lista pone también su rol (la persona puede cambiarlo después). */
export function alElegirPersona(persona: string, anterior: EleccionDeVoz, personas: readonly PersonaDTO[]): EleccionDeVoz {
  const p = personas.find((x) => x.id === persona);
  return { persona, libre: persona === OTRA ? anterior.libre : "", rol: p ? rolDeTexto(p.role) || anterior.rol : persona === "" ? "" : anterior.rol };
}

/** El nombre que quedaría para esa voz ("" si no tiene). */
export function nombreElegido(e: EleccionDeVoz, personas: readonly PersonaDTO[]): string {
  if (e.persona === OTRA) return e.libre.replace(/\s+/g, " ").trim();
  return personas.find((p) => p.id === e.persona)?.name ?? "";
}

/** Grupos de voces que tendrían el mismo nombre: al guardar se unen en una sola. */
export function vocesQueSeUniran(elecciones: Readonly<Record<string, EleccionDeVoz>>, personas: readonly PersonaDTO[]): string[][] {
  const porNombre = new Map<string, string[]>();
  for (const [label, e] of Object.entries(elecciones)) {
    const nombre = nombreElegido(e, personas);
    if (!nombre) continue;
    const clave = claveDeNombre(nombre);
    porNombre.set(clave, [...(porNombre.get(clave) ?? []), label]);
  }
  return [...porNombre.values()].filter((g) => g.length > 1);
}

export function hayCambios(a: Readonly<Record<string, EleccionDeVoz>>, b: Readonly<Record<string, EleccionDeVoz>>): boolean {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of claves) {
    const x = a[k];
    const y = b[k];
    if (!x || !y || x.persona !== y.persona || x.rol !== y.rol || (x.persona === OTRA && x.libre.trim() !== y.libre.trim())) return true;
  }
  return false;
}

/**
 * Lo que se manda a guardar. `crear` tiene los identificadores de las personas que se acaban de crear («Otra persona…»),
 * por el nombre que se les puso.
 */
export function aPedidos(
  elecciones: Readonly<Record<string, EleccionDeVoz>>,
  personas: readonly PersonaDTO[],
  creadas: ReadonlyMap<string, string> = new Map(),
): PedidoDeHablante[] {
  return Object.entries(elecciones).map(([label, e]) => {
    const name = nombreElegido(e, personas) || null;
    const personId = e.persona === OTRA ? (name ? creadas.get(claveDeNombre(name)) ?? null : null) : e.persona || null;
    return { label, name, role: e.rol || null, personId };
  });
}

/** Las voces nuevas que hay que crear como personas de la copropiedad antes de guardar. */
export function personasPorCrear(elecciones: Readonly<Record<string, EleccionDeVoz>>, personas: readonly PersonaDTO[]): Array<{ name: string; role: RolPersona | null }> {
  const vistas = new Set<string>();
  const salida: Array<{ name: string; role: RolPersona | null }> = [];
  for (const e of Object.values(elecciones)) {
    if (e.persona !== OTRA) continue;
    const name = nombreElegido(e, personas);
    if (!name || personaPorNombre(name, personas) || vistas.has(claveDeNombre(name))) continue;
    vistas.add(claveDeNombre(name));
    salida.push({ name, role: e.rol || null });
  }
  return salida;
}
