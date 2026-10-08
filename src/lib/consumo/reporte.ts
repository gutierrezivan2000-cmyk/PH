/**
 * El informe de consumo para precificar (puro: se prueba sin base de datos). Recibe los registros de un periodo y responde:
 *  - por función: cuántas veces se usó, cuántos tokens (separados como se cobran), cuántos minutos de audio y cuánto costó, en
 *    total y por vez (promedio, mediana y p90: el p90 es lo que cuesta un caso «grande», el que fija el precio);
 *  - por producto: cuánto cuesta una generación completa, una reunión (y su hora de audio), un chat, una importación — sumando
 *    todas las llamadas que pertenecen a cada una;
 *  - por usuario: cuánto gastó cada cuenta y en qué.
 */
import { funcionDe } from "./funciones";

export type RegistroDeConsumo = {
  userId: string;
  type: string;
  date: Date;
  costUsd: number;
  tokens: number;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  audioSeconds: number;
  refType: string | null;
  refId: string | null;
};

export type Distribucion = { n: number; promedio: number; mediana: number; p90: number; maximo: number };

export type ResumenDeFuncion = {
  tipo: string;
  nombre: string;
  grupo: string;
  unidad: string;
  veces: number;
  usuarios: number;
  costoUsd: number;
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura: number;
  audioSegundos: number;
  /** Costo de cada vez (cada registro). */
  porVez: Distribucion;
  /** Costo por hora de audio (solo en las funciones de audio). */
  usdPorHoraDeAudio: number | null;
  /** Registros sin el detalle (anteriores a la medición por función): su costo es una tarifa aproximada. */
  estimados: number;
  modelos: string[];
};

export type ResumenDeProducto = {
  tipo: string;
  nombre: string;
  /** Cuántas operaciones (generaciones, reuniones, chats…) tuvieron consumo en el periodo. */
  operaciones: number;
  costoUsd: number;
  porOperacion: Distribucion;
  /** Las funciones que componen el costo de una operación, de mayor a menor. */
  composicion: Array<{ tipo: string; nombre: string; costoUsd: number; porOperacion: number }>;
  /** Reuniones: costo total por hora de audio grabado (todo lo de la reunión, dividido entre sus horas). */
  usdPorHoraDeAudio: number | null;
};

export type ResumenDeUsuario = {
  userId: string;
  costoUsd: number;
  veces: number;
  tokens: number;
  audioSegundos: number;
  porTipo: Array<{ tipo: string; nombre: string; veces: number; costoUsd: number }>;
};

export type InformeDeConsumo = {
  total: { costoUsd: number; veces: number; usuarios: number; entrada: number; salida: number; cacheLectura: number; cacheEscritura: number; audioSegundos: number; estimados: number; costoEstimadoUsd: number };
  porProveedor: Array<{ proveedor: string; costoUsd: number; veces: number }>;
  porFuncion: ResumenDeFuncion[];
  porProducto: ResumenDeProducto[];
  porUsuario: ResumenDeUsuario[];
};

const NOMBRE_DE_PRODUCTO: Record<string, string> = {
  generacion: "Generación de documentos (todo lo de una generación)",
  reunion: "Reunión (transcripción, resumen, acta y preguntas)",
  chat: "Chat con un asistente (todos sus mensajes)",
  importacion: "Importación de unidades",
};

/** Percentil por el método del rango más cercano, sobre valores ya ordenados. */
const percentil = (ordenados: number[], p: number): number => (ordenados.length ? ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1))] : 0);

export function distribucion(valores: number[]): Distribucion {
  if (valores.length === 0) return { n: 0, promedio: 0, mediana: 0, p90: 0, maximo: 0 };
  const o = [...valores].sort((a, b) => a - b);
  return { n: o.length, promedio: o.reduce((s, v) => s + v, 0) / o.length, mediana: percentil(o, 50), p90: percentil(o, 90), maximo: o[o.length - 1] };
}

/** Los segundos de audio de un registro: la columna nueva o, en los registros anteriores de audio, `tokens` (que eran segundos). */
export const segundosDeAudio = (r: RegistroDeConsumo): number => (r.audioSeconds > 0 ? r.audioSeconds : funcionDe(r.type).tokensSonSegundos ? r.tokens : 0);

const esEstimado = (r: RegistroDeConsumo): boolean => !r.model;

export function informeDeConsumo(registros: readonly RegistroDeConsumo[]): InformeDeConsumo {
  const total = { costoUsd: 0, veces: 0, usuarios: 0, entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0, audioSegundos: 0, estimados: 0, costoEstimadoUsd: 0 };
  const usuarios = new Set<string>();
  const proveedores = new Map<string, { costoUsd: number; veces: number }>();
  const funciones = new Map<string, { registros: RegistroDeConsumo[]; usuarios: Set<string> }>();
  const productos = new Map<string, Map<string, RegistroDeConsumo[]>>(); // refType → refId → registros
  const porUsuario = new Map<string, RegistroDeConsumo[]>();

  for (const r of registros) {
    const costo = Number.isFinite(r.costUsd) && r.costUsd > 0 ? r.costUsd : 0;
    total.costoUsd += costo;
    total.veces += 1;
    total.entrada += r.inputTokens;
    total.salida += r.outputTokens;
    total.cacheLectura += r.cacheReadTokens;
    total.cacheEscritura += r.cacheWriteTokens;
    total.audioSegundos += segundosDeAudio(r);
    if (esEstimado(r)) {
      total.estimados += 1;
      total.costoEstimadoUsd += costo;
    }
    usuarios.add(r.userId);

    const prov = r.provider ?? "sin detalle";
    const p = proveedores.get(prov) ?? { costoUsd: 0, veces: 0 };
    p.costoUsd += costo;
    p.veces += 1;
    proveedores.set(prov, p);

    const f = funciones.get(r.type) ?? { registros: [], usuarios: new Set<string>() };
    f.registros.push(r);
    f.usuarios.add(r.userId);
    funciones.set(r.type, f);

    if (r.refType && r.refId) {
      const deTipo = productos.get(r.refType) ?? new Map<string, RegistroDeConsumo[]>();
      deTipo.set(r.refId, [...(deTipo.get(r.refId) ?? []), r]);
      productos.set(r.refType, deTipo);
    }

    porUsuario.set(r.userId, [...(porUsuario.get(r.userId) ?? []), r]);
  }
  total.usuarios = usuarios.size;

  const costoDe = (r: RegistroDeConsumo) => (Number.isFinite(r.costUsd) && r.costUsd > 0 ? r.costUsd : 0);

  const porFuncion: ResumenDeFuncion[] = [...funciones.entries()]
    .map(([tipo, f]) => {
      const def = funcionDe(tipo);
      const audioSegundos = f.registros.reduce((s, r) => s + segundosDeAudio(r), 0);
      const costoUsd = f.registros.reduce((s, r) => s + costoDe(r), 0);
      return {
        tipo,
        nombre: def.nombre,
        grupo: def.grupo,
        unidad: def.unidad,
        veces: f.registros.length,
        usuarios: f.usuarios.size,
        costoUsd,
        entrada: f.registros.reduce((s, r) => s + r.inputTokens, 0),
        salida: f.registros.reduce((s, r) => s + r.outputTokens, 0),
        cacheLectura: f.registros.reduce((s, r) => s + r.cacheReadTokens, 0),
        cacheEscritura: f.registros.reduce((s, r) => s + r.cacheWriteTokens, 0),
        audioSegundos,
        porVez: distribucion(f.registros.map(costoDe)),
        usdPorHoraDeAudio: def.tokensSonSegundos && audioSegundos > 0 ? costoUsd / (audioSegundos / 3600) : null,
        estimados: f.registros.filter(esEstimado).length,
        modelos: [...new Set(f.registros.map((r) => r.model).filter((m): m is string => !!m))].sort(),
      };
    })
    .sort((a, b) => b.costoUsd - a.costoUsd);

  const porProducto: ResumenDeProducto[] = [...productos.entries()]
    .map(([tipo, operaciones]) => {
      const costos = [...operaciones.values()].map((rs) => rs.reduce((s, r) => s + costoDe(r), 0));
      const costoUsd = costos.reduce((s, v) => s + v, 0);
      const porTipo = new Map<string, number>();
      let audio = 0;
      for (const rs of operaciones.values()) {
        for (const r of rs) {
          porTipo.set(r.type, (porTipo.get(r.type) ?? 0) + costoDe(r));
          audio += segundosDeAudio(r);
        }
      }
      return {
        tipo,
        nombre: NOMBRE_DE_PRODUCTO[tipo] ?? tipo,
        operaciones: operaciones.size,
        costoUsd,
        porOperacion: distribucion(costos),
        composicion: [...porTipo.entries()]
          .map(([t, c]) => ({ tipo: t, nombre: funcionDe(t).nombre, costoUsd: c, porOperacion: c / operaciones.size }))
          .sort((a, b) => b.costoUsd - a.costoUsd),
        usdPorHoraDeAudio: tipo === "reunion" && audio > 0 ? costoUsd / (audio / 3600) : null,
      };
    })
    .sort((a, b) => b.costoUsd - a.costoUsd);

  const resumenDeUsuarios: ResumenDeUsuario[] = [...porUsuario.entries()]
    .map(([userId, rs]) => {
      const porTipo = new Map<string, { veces: number; costoUsd: number }>();
      for (const r of rs) {
        const t = porTipo.get(r.type) ?? { veces: 0, costoUsd: 0 };
        t.veces += 1;
        t.costoUsd += costoDe(r);
        porTipo.set(r.type, t);
      }
      return {
        userId,
        costoUsd: rs.reduce((s, r) => s + costoDe(r), 0),
        veces: rs.length,
        tokens: rs.reduce((s, r) => s + r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0),
        audioSegundos: rs.reduce((s, r) => s + segundosDeAudio(r), 0),
        porTipo: [...porTipo.entries()].map(([tipo, t]) => ({ tipo, nombre: funcionDe(tipo).nombre, ...t })).sort((a, b) => b.costoUsd - a.costoUsd),
      };
    })
    .sort((a, b) => b.costoUsd - a.costoUsd);

  return {
    total,
    porProveedor: [...proveedores.entries()].map(([proveedor, p]) => ({ proveedor, ...p })).sort((a, b) => b.costoUsd - a.costoUsd),
    porFuncion,
    porProducto,
    porUsuario: resumenDeUsuarios,
  };
}

/* ════════════════════════════════════════════════════════════════════
   El periodo y el CSV
   ════════════════════════════════════════════════════════════════════ */

const DESFASE_BOGOTA_MS = 5 * 3_600_000;

/** Un día `AAAA-MM-DD` de Bogotá a su primer instante (UTC). null si no es una fecha. */
export function inicioDeDiaEnBogota(dia: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return null;
  const medianoche = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Un día que no existe (30 de febrero) se corre al mes siguiente: se rechaza.
  if (Number.isNaN(medianoche.getTime()) || medianoche.toISOString().slice(0, 10) !== dia) return null;
  return new Date(medianoche.getTime() + DESFASE_BOGOTA_MS);
}

/** El día de Bogotá de un instante, `AAAA-MM-DD`. */
export const diaEnBogota = (d: Date): string => new Date(d.getTime() - DESFASE_BOGOTA_MS).toISOString().slice(0, 10);

export type Periodo = { desde: Date; hasta: Date; desdeDia: string; hastaDia: string };

/**
 * El periodo pedido (días de Bogotá, `hasta` incluido). Sin fechas válidas: el mes en curso. Un rango al revés se corrige.
 */
export function periodoPedido(desdeTexto: string | null | undefined, hastaTexto: string | null | undefined, ahora: Date = new Date()): Periodo {
  const hoy = diaEnBogota(ahora);
  const primeroDelMes = `${hoy.slice(0, 8)}01`;
  let desdeDia = desdeTexto && inicioDeDiaEnBogota(desdeTexto) ? desdeTexto : primeroDelMes;
  let hastaDia = hastaTexto && inicioDeDiaEnBogota(hastaTexto) ? hastaTexto : hoy;
  if (desdeDia > hastaDia) [desdeDia, hastaDia] = [hastaDia, desdeDia];
  const desde = inicioDeDiaEnBogota(desdeDia)!;
  const hasta = new Date(inicioDeDiaEnBogota(hastaDia)!.getTime() + 86_400_000);
  return { desde, hasta, desdeDia, hastaDia };
}

const celda = (v: string | number): string => {
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : v;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Filas a CSV (separador coma, UTF-8 con BOM para que Excel lea bien las tildes). */
export function aCsv(encabezado: string[], filas: Array<Array<string | number>>): string {
  return "﻿" + [encabezado, ...filas].map((f) => f.map(celda).join(",")).join("\n") + "\n";
}
