"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { almacenDeSubidas } from "@/lib/meetings/almacen-navegador";
import { procesarReunion } from "@/lib/meetings/cliente";
import { crearGestor, type Enlaces, type Gestor, type InstantaneaGestor } from "@/lib/meetings/gestor-subidas";
import { crearApiSimulada, crearApiSubida } from "@/lib/meetings/subida-api";

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Solo demo: `localStorage["soph-demo-subida-mbps"]` cambia la velocidad simulada por parte (para pruebas). */
function velocidadDemo(): number | undefined {
  try {
    const mbps = Number(window.localStorage.getItem("soph-demo-subida-mbps"));
    return mbps > 0 ? mbps * 1024 * 1024 : undefined;
  } catch {
    return undefined;
  }
}

type Registrada = { name: string; sizeBytes: number };
type Entrada = { gestor: Gestor; fijarFuentes: (f: Registrada[]) => void };

/**
 * Un gestor por reunión, vivo mientras la pestaña esté abierta: si la persona se va a otra pantalla de la
 * app y vuelve, la subida sigue (y se ve su avance) en vez de cancelarse al cambiar de página.
 */
const registro = new Map<string, Entrada>();

function entradaDe(meetingId: string): Entrada {
  let e = registro.get(meetingId);
  if (!e) {
    let fuentes: Registrada[] = [];
    const gestor = crearGestor({
      meetingId,
      almacen: almacenDeSubidas(),
      api: DEMO ? crearApiSimulada(meetingId, velocidadDemo()) : crearApiSubida(meetingId),
      procesar: async () => {
        await procesarReunion(meetingId);
      },
      fuentesRegistradas: () => fuentes,
    });
    e = { gestor, fijarFuentes: (f) => { fuentes = f; } };
    registro.set(meetingId, e);
  }
  return e;
}

/** Mantiene la pantalla encendida mientras algo se sube: un móvil que se duerme corta la conexión. */
function usePantallaEncendida(activo: boolean) {
  useEffect(() => {
    if (!activo || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let candado: WakeLockSentinel | null = null;
    let cerrado = false;
    const pedir = async () => {
      try {
        const c = await navigator.wakeLock.request("screen");
        if (cerrado) void c.release().catch(() => {});
        else candado = c;
      } catch {
        /* sin permiso (batería baja, pestaña oculta…): la subida sigue igual */
      }
    };
    void pedir();
    // El navegador suelta el candado al ocultar la pestaña: se vuelve a pedir al volver.
    const alVolver = () => {
      if (document.visibilityState === "visible" && (!candado || candado.released)) void pedir();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      cerrado = true;
      document.removeEventListener("visibilitychange", alVolver);
      void candado?.release().catch(() => {});
    };
  }, [activo]);
}

/**
 * El gestor de subidas de una reunión y su estado actual. `fuentes` son los archivos ya registrados en el
 * servidor; `enlaces` se avisan cuando uno se registra y cuando la reunión se envía a procesar.
 */
export function useSubidas(
  meetingId: string,
  fuentes: Registrada[],
  enlaces: Enlaces,
): { gestor: Gestor; estado: InstantaneaGestor } {
  const entrada = entradaDe(meetingId);
  const { gestor } = entrada;

  const ultimosEnlaces = useRef(enlaces);
  useEffect(() => {
    ultimosEnlaces.current = enlaces;
  });

  const clave = fuentes.map((f) => `${f.name}:${f.sizeBytes}`).join("|");
  useEffect(() => {
    entrada.fijarFuentes(fuentes.map((f) => ({ name: f.name, sizeBytes: f.sizeBytes })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume el contenido de `fuentes`
  }, [entrada, clave]);

  useEffect(() => {
    gestor.enlazar({
      alRegistrar: () => ultimosEnlaces.current.alRegistrar?.(),
      alProcesar: () => ultimosEnlaces.current.alProcesar?.(),
    });
    void gestor.cargarInterrumpidas();
    return () => gestor.enlazar({});
  }, [gestor]);

  const estado = useSyncExternalStore(gestor.suscribir, gestor.instantanea, gestor.instantanea);
  usePantallaEncendida(estado.activa && !estado.pausada);
  return { gestor, estado };
}
