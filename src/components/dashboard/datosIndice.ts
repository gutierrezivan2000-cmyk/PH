"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AGENT_IDS, isComingSoonAgent } from "@/lib/agents";

/* ════════════════════════════════════════════════════════════════════
   Datos vivos del índice y del dock (SPEC «Guía» §f.1).
   Salen SOLO de rutas GET que ya existen (IMPL §8): /api/calendar,
   /api/generations y /api/usage. Si una falla, su dato queda en null y el
   índice no muestra nada.

   Es una caché mínima por URL, compartida con las pantallas:
   - Inicio pide sus datos con `pedirJSON` y el armazón reutiliza la misma
     respuesta (antes se pedían dos veces al entrar a /dashboard).
   - La Bitácora publica lo que recarga tras marcar una obligación
     (`publicarJSON`), así el conteo del índice cambia en la misma pantalla.
   - Generar llama a `refrescarIndice()` al completar una generación.
   - El armazón vuelve a pedir en cada cambio de ruta y al volver a la ventana.
   ════════════════════════════════════════════════════════════════════ */

export type DatosIndice = {
  /** Bitácora: obligaciones pendientes con fecha ya pasada (mismo criterio que Inicio). */
  vencidas: number | null;
  /** Generar: copropiedades cuyo «Informe de gestión» del mes sigue pendiente (categoría «informe»). */
  porGenerar: number | null;
  /** Historial: generaciones completadas (/api/generations devuelve como máximo 100 → `tope`). */
  documentos: { n: number; tope: boolean } | null;
  /** Acceso a /empresa: plan Élite o beta (/api/usage). */
  elite: boolean;
};

export const URL_CALENDARIO = "/api/calendar";
export const URL_GENERACIONES = "/api/generations";
const URL_USO = "/api/usage";
const URLS = [URL_CALENDARIO, URL_GENERACIONES, URL_USO];

/** Dos pedidos de la misma URL en menos de esto comparten respuesta (Inicio + armazón al montar). */
const VIGENCIA_MS = 2000;

const SIN_DATOS: DatosIndice = { vencidas: null, porGenerar: null, documentos: null, elite: false };

/** Agentes lanzados (no «Próximamente»), de la configuración real de lib/agents. */
export const AGENTES_ACTIVOS = AGENT_IDS.filter((id) => !isComingSoonAgent(id)).length;

type ItemCalendario = { status?: string; dueDate?: string; category?: string };

const cache = new Map<string, { t: number; p: Promise<unknown> }>();
const ultimos = new Map<string, unknown>();
const oyentes = new Set<() => void>();
let datos: DatosIndice = SIN_DATOS;

/** Días desde hoy hasta una fecha «AAAA-MM-DD» en hora local (negativo = ya pasó). */
function diasHasta(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - base.getTime()) / 86400000);
}

function calcular(): DatosIndice {
  const cal = ultimos.get(URL_CALENDARIO) as { items?: unknown } | undefined;
  const gens = ultimos.get(URL_GENERACIONES);
  const uso = ultimos.get(URL_USO) as { planName?: string; planStatus?: string } | undefined;
  const items: ItemCalendario[] | null = Array.isArray(cal?.items) ? (cal.items as ItemCalendario[]) : null;
  const pendientes = items?.filter((it) => it.status === "pending" && typeof it.dueDate === "string") ?? null;
  return {
    vencidas: pendientes ? pendientes.filter((it) => diasHasta(it.dueDate as string) < 0).length : null,
    porGenerar: pendientes ? pendientes.filter((it) => it.category === "informe").length : null,
    documentos: Array.isArray(gens)
      ? { n: gens.filter((g: { status?: string }) => g.status === "completed").length, tope: gens.length >= 100 }
      : null,
    elite: Boolean(uso && (uso.planName === "elite" || uso.planStatus === "beta")),
  };
}

function emitir() {
  datos = calcular();
  oyentes.forEach((f) => f());
}

/**
 * GET de una ruta existente con caché de 2 s. Devuelve el JSON, o null si la
 * respuesta no es 2xx o no hubo red (el que llama decide qué es un error).
 * `fresco` ignora la caché (reintentos, recargas tras un cambio).
 */
export function pedirJSON<T = unknown>(url: string, opciones?: { fresco?: boolean }): Promise<T | null> {
  const previa = cache.get(url);
  if (!opciones?.fresco && previa && Date.now() - previa.t < VIGENCIA_MS) return previa.p as Promise<T | null>;
  const p: Promise<unknown> = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  cache.set(url, { t: Date.now(), p });
  p.then((v) => {
    if (v === null || !URLS.includes(url)) return;
    ultimos.set(url, v);
    emitir();
  });
  return p as Promise<T | null>;
}

/** Una pantalla que ya pidió una de estas rutas comparte el resultado (p. ej. la Bitácora tras marcar). */
export function publicarJSON(url: string, valor: unknown) {
  cache.set(url, { t: Date.now(), p: Promise.resolve(valor) });
  if (!URLS.includes(url)) return;
  ultimos.set(url, valor);
  emitir();
}

/** Vuelve a pedir los datos del índice sin caché (tras generar un informe, al volver a la ventana). */
export function refrescarIndice() {
  URLS.forEach((u) => void pedirJSON(u, { fresco: true }));
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
};
const leer = () => datos;
const leerServidor = () => SIN_DATOS;

/**
 * Datos vivos para el índice y el dock. Pide en cada cambio de ruta (con la
 * caché de 2 s compartida con la pantalla) y sin caché al volver a la ventana.
 */
export function useDatosIndice(pathname: string | null): DatosIndice {
  const valor = useSyncExternalStore(suscribir, leer, leerServidor);

  useEffect(() => {
    URLS.forEach((u) => void pedirJSON(u));
  }, [pathname]);

  useEffect(() => {
    let ultima = Date.now();
    const alVolver = () => {
      if (document.visibilityState !== "visible" || Date.now() - ultima < 10_000) return;
      ultima = Date.now();
      refrescarIndice();
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  return valor;
}
