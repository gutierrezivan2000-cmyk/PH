/**
 * Lo que un agente puede HACER en la app. Siempre pasa por la persona: el agente propone, la interfaz muestra una tarjeta con lo
 * que va a ocurrir y solo al aprobarla se ejecuta (con las mismas reglas que si lo hiciera ella en la pantalla del módulo).
 *
 * Aquí están los validadores PUROS (con pruebas) y el catálogo. La ejecución contra la base de datos está en `acciones-ejecutar.ts`.
 * Para sumar una acción nueva: agrégala a `TIPOS_DE_ACCION`, escribe su validador aquí y su ejecución allá; el agente la conoce sola
 * (la herramienta `proponer_accion` toma su esquema de este catálogo).
 */
import { fmtCOP } from "@/lib/cartera";
import type { ComingSoonKey } from "@/lib/feature-flags";

export const TIPOS_DE_ACCION = ["registrar_pago", "registrar_movimiento_presupuesto", "responder_pqrs", "agregar_a_bitacora"] as const;
export type TipoDeAccion = (typeof TIPOS_DE_ACCION)[number];

/** Qué módulo en lanzamiento gradual necesita cada acción (null = no depende de ninguno). */
export const MODULO_DE_ACCION: Record<TipoDeAccion, ComingSoonKey | null> = {
  registrar_pago: "cartera",
  registrar_movimiento_presupuesto: "presupuesto",
  responder_pqrs: "pqrs",
  agregar_a_bitacora: null,
};

export const ETIQUETA_DE_ACCION: Record<TipoDeAccion, string> = {
  registrar_pago: "Registrar un pago",
  registrar_movimiento_presupuesto: "Registrar un movimiento del presupuesto",
  responder_pqrs: "Responder una PQRS",
  agregar_a_bitacora: "Agregar a la bitácora",
};

type Resultado<T> = { ok: true; datos: T; resumen: string } | { ok: false; error: string };

const txt = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length >= min && t.length <= max ? t : null;
};
/** Texto largo que conserva los saltos de línea. */
const parrafos = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  return t.length >= min && t.length <= max ? t : null;
};
/** Un monto en pesos. Acepta 1250000, "1250000", "1.250.000" (puntos de miles, como se escribe en Colombia) y "$ 1.250.000,50". */
export function aMonto(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const t = v.replace(/[\s$]/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
    else if (/^\d+([.,]\d+)?$/.test(t)) n = Number(t.replace(",", "."));
    else return null;
  } else return null;
  return Number.isFinite(n) && Math.round(n) > 0 && Math.round(n) <= 1_000_000_000 ? Math.round(n) : null;
}
const monto = aMonto;
/** AAAA-MM-DD válida (calendario real); si falta, hoy en Bogotá. */
export function fechaIso(v: unknown, hoy: string): string | null {
  if (v === undefined || v === null || v === "") return hoy;
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? v.trim() : null;
}

export const METODOS_DE_PAGO = ["efectivo", "transferencia", "consignacion", "otro"] as const;
export const TIPOS_DE_MOVIMIENTO = ["ingreso", "gasto", "fondo_aporte", "fondo_retiro"] as const;
export const ESTADOS_DE_PQRS = ["en_proceso", "resuelto", "cerrado"] as const;

export type DatosPago = { unidad: string; monto: number; metodo: (typeof METODOS_DE_PAGO)[number]; referencia: string | null; fecha: string };
export type DatosMovimiento = { concepto: string; tipo: (typeof TIPOS_DE_MOVIMIENTO)[number]; monto: number; fecha: string; rubro: string | null };
export type DatosRespuestaPqrs = { codigo: string; respuesta: string; estado: (typeof ESTADOS_DE_PQRS)[number] | null };
export type DatosBitacora = { nombre: string; tipo: "zona_comun" | "poliza"; fecha: string; proveedor: string | null; referencia: string | null; recurrenciaMeses: number | null };

export function validarPago(e: Record<string, unknown>, hoy: string): Resultado<DatosPago> {
  const unidad = txt(e.unidad, 1, 60);
  const m = monto(e.monto);
  const metodo = (METODOS_DE_PAGO as readonly string[]).includes(String(e.metodo ?? "transferencia")) ? (String(e.metodo ?? "transferencia") as DatosPago["metodo"]) : null;
  const fecha = fechaIso(e.fecha, hoy);
  if (!unidad) return { ok: false, error: "Falta la unidad (por ejemplo «Apto 502»)." };
  if (!m) return { ok: false, error: "El monto debe ser un número mayor que cero (en pesos)." };
  if (!metodo) return { ok: false, error: `El método debe ser uno de: ${METODOS_DE_PAGO.join(", ")}.` };
  if (!fecha) return { ok: false, error: "La fecha debe ser AAAA-MM-DD." };
  const referencia = txt(e.referencia, 1, 100);
  return { ok: true, datos: { unidad, monto: m, metodo, referencia, fecha }, resumen: `Registrar un pago de ${fmtCOP(m)} en ${unidad} por ${metodo} (${fecha})${referencia ? `, ref. ${referencia}` : ""}` };
}

export function validarMovimiento(e: Record<string, unknown>, hoy: string): Resultado<DatosMovimiento> {
  const concepto = txt(e.concepto, 3, 120);
  const m = monto(e.monto);
  const tipo = (TIPOS_DE_MOVIMIENTO as readonly string[]).includes(String(e.tipo)) ? (String(e.tipo) as DatosMovimiento["tipo"]) : null;
  const fecha = fechaIso(e.fecha, hoy);
  if (!concepto) return { ok: false, error: "El concepto debe tener entre 3 y 120 caracteres." };
  if (!tipo) return { ok: false, error: `El tipo debe ser uno de: ${TIPOS_DE_MOVIMIENTO.join(", ")}.` };
  if (!m) return { ok: false, error: "El monto debe ser un número mayor que cero (en pesos)." };
  if (!fecha) return { ok: false, error: "La fecha debe ser AAAA-MM-DD." };
  const rubro = txt(e.rubro, 1, 80);
  return { ok: true, datos: { concepto, tipo, monto: m, fecha, rubro }, resumen: `Registrar en el presupuesto un ${tipo.replace("_", " ")} de ${fmtCOP(m)}: «${concepto}» (${fecha})${rubro ? `, rubro ${rubro}` : ""}` };
}

export function validarRespuestaPqrs(e: Record<string, unknown>): Resultado<DatosRespuestaPqrs> {
  const codigo = typeof e.codigo === "string" ? e.codigo.trim().toUpperCase() : "";
  const respuesta = parrafos(e.respuesta, 10, 4000);
  const estado = e.estado === undefined || e.estado === null || e.estado === "" ? null : (ESTADOS_DE_PQRS as readonly string[]).includes(String(e.estado)) ? (String(e.estado) as DatosRespuestaPqrs["estado"]) : "invalido";
  if (!/^PQR-[A-Z0-9]{4,10}$/.test(codigo)) return { ok: false, error: "El código de la PQRS debe verse así: PQR-ABC123." };
  if (!respuesta) return { ok: false, error: "La respuesta debe tener entre 10 y 4.000 caracteres." };
  if (estado === "invalido") return { ok: false, error: `El estado debe ser uno de: ${ESTADOS_DE_PQRS.join(", ")}.` };
  return { ok: true, datos: { codigo, respuesta, estado }, resumen: `Responder la ${codigo}${estado ? ` y marcarla «${estado}»` : ""}. Texto completo que se enviará a la administración:\n${respuesta}` };
}

export function validarBitacora(e: Record<string, unknown>, hoy: string): Resultado<DatosBitacora> {
  const nombre = txt(e.nombre, 3, 120);
  const tipo = e.tipo === "poliza" || e.tipo === "zona_comun" ? e.tipo : null;
  const fecha = e.fecha ? fechaIso(e.fecha, hoy) : null;
  if (!nombre) return { ok: false, error: "El nombre debe tener entre 3 y 120 caracteres." };
  if (!tipo) return { ok: false, error: "El tipo debe ser «poliza» o «zona_comun»." };
  if (!fecha) return { ok: false, error: "Falta la fecha de vencimiento o próximo mantenimiento (AAAA-MM-DD)." };
  const rec = e.recurrenciaMeses === undefined || e.recurrenciaMeses === null ? null : Number(e.recurrenciaMeses);
  if (rec !== null && !(Number.isInteger(rec) && rec >= 1 && rec <= 60)) return { ok: false, error: "La recurrencia debe ser un número de meses entre 1 y 60." };
  return {
    ok: true,
    datos: { nombre, tipo, fecha, proveedor: txt(e.proveedor, 1, 120), referencia: txt(e.referencia, 1, 100), recurrenciaMeses: rec },
    resumen: `Agregar a la bitácora ${tipo === "poliza" ? "la póliza" : "la zona común"} «${nombre}», con fecha ${fecha}${rec ? `, cada ${rec} meses` : ""}`,
  };
}

export type AccionValidada =
  | { ok: true; tipo: "registrar_pago"; datos: DatosPago; resumen: string }
  | { ok: true; tipo: "registrar_movimiento_presupuesto"; datos: DatosMovimiento; resumen: string }
  | { ok: true; tipo: "responder_pqrs"; datos: DatosRespuestaPqrs; resumen: string }
  | { ok: true; tipo: "agregar_a_bitacora"; datos: DatosBitacora; resumen: string }
  | { ok: false; error: string };

export function validarAccion(tipo: unknown, datos: unknown, hoy: string): AccionValidada {
  const e = datos && typeof datos === "object" && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {};
  switch (tipo) {
    case "registrar_pago": { const r = validarPago(e, hoy); return r.ok ? { ...r, tipo } : r; }
    case "registrar_movimiento_presupuesto": { const r = validarMovimiento(e, hoy); return r.ok ? { ...r, tipo } : r; }
    case "responder_pqrs": { const r = validarRespuestaPqrs(e); return r.ok ? { ...r, tipo } : r; }
    case "agregar_a_bitacora": { const r = validarBitacora(e, hoy); return r.ok ? { ...r, tipo } : r; }
    default:
      return { ok: false, error: `Esa acción no existe. Las disponibles son: ${TIPOS_DE_ACCION.join(", ")}.` };
  }
}
