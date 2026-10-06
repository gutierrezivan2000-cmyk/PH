"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { almacenDeGrabaciones } from "@/lib/meetings/almacen-navegador";
import { crearGrabadora, type Grabadora } from "@/lib/meetings/grabadora";
import { crearApiGrabacion } from "@/lib/meetings/grabadora-api";
import {
  ESPACIO_BAJO_BYTES, abrirMicrofono, entornoDelNavegador, espacioLibreEnDispositivo, mantenerPantallaEncendida,
  soportaBloqueoDePantalla, tomarCandado,
} from "@/lib/meetings/grabadora-navegador";

/**
 * Un motor por reunión, compartido: si la persona sale de la página mientras graba, la grabación sigue en la
 * pestaña, y al volver la pantalla se conecta al MISMO motor (no empieza otro que abra de nuevo el micrófono).
 * El motor lleva consigo el candado de la reunión: solo una pestaña del navegador puede tener su grabadora.
 */
type Entrada = {
  gr: Grabadora;
  /** La petición del candado de la reunión (se hace UNA vez por motor: dos montajes seguidos no compiten entre sí). */
  candado: Promise<(() => void) | null> | null;
  /** Cómo soltar el candado, cuando ya se tomó. */
  soltar: (() => void) | null;
  /** Cuántas pantallas montadas usan este motor ahora. */
  usuarios: number;
};

const registro = new Map<string, Entrada>();

function entradaDe(meetingId: string): Entrada {
  let e = registro.get(meetingId);
  if (!e) {
    e = {
      gr: crearGrabadora({
        meetingId,
        almacen: almacenDeGrabaciones(),
        api: crearApiGrabacion(meetingId),
        entorno: entornoDelNavegador(),
        abrir: abrirMicrofono,
      }),
      candado: null,
      soltar: null,
      usuarios: 0,
    };
    registro.set(meetingId, e);
  }
  return e;
}

/** Pide el candado de la reunión una sola vez; quien llama después recibe la misma respuesta. */
function pedirCandado(e: Entrada, meetingId: string): Promise<(() => void) | null> {
  e.candado ??= tomarCandado(`soph-grabadora-${meetingId}`).then((soltar) => {
    if (soltar && registro.get(meetingId) !== e) {
      soltar(); // la reunión se «olvidó» mientras se esperaba: nadie lo va a usar
      return null;
    }
    e.soltar = soltar;
    return soltar;
  });
  return e.candado;
}
const contarUsuario = (e: Entrada, delta: 1 | -1) => {
  e.usuarios += delta;
};

/** Cuando la grabación terminó o se descartó, el motor ya no hace falta (y se suelta el candado). */
export function olvidarGrabadora(meetingId: string): void {
  const e = registro.get(meetingId);
  e?.soltar?.();
  registro.delete(meetingId);
}

/** ¿Hay una grabación en marcha en esta pestaña, de cualquier reunión? */
export function hayGrabacionEnMarcha(): boolean {
  return [...registro.values()].some((e) => e.gr.ocupada());
}

/** Si ESTA pestaña está grabando (o terminando de grabar) esa reunión ahora mismo: cuánto lleva. */
export function grabacionEnCurso(meetingId: string): { transcurridoMs: number } | null {
  const e = registro.get(meetingId);
  if (!e) return null;
  const { fase, transcurridoMs } = e.gr.estado();
  return fase === "grabando" || fase === "pausada" || fase === "cerrando" ? { transcurridoMs } : null;
}

/** Todas las grabaciones que esta pestaña tiene en marcha ahora (por si la persona salió de su pantalla): el aviso global las lee. */
export function grabacionesEnCurso(): Array<{ meetingId: string; transcurridoMs: number }> {
  return [...registro.keys()].flatMap((meetingId) => {
    const g = grabacionEnCurso(meetingId);
    return g ? [{ meetingId, transcurridoMs: g.transcurridoMs }] : [];
  });
}

const sinSuscripcion = () => () => {};

export type EstadoCandado = "buscando" | "mio" | "ocupado";

/**
 * La grabadora de una reunión para una pantalla de React: su estado en vivo, más lo que es del navegador y no del
 * motor: el candado de una sola pestaña, avisar al cerrar la pestaña, mantener la pantalla encendida y vigilar el
 * espacio del dispositivo.
 */
export function useGrabadora(meetingId: string) {
  const entrada = useMemo(() => entradaDe(meetingId), [meetingId]);
  const gr = entrada.gr;
  const estado = useSyncExternalStore(gr.suscribir, gr.estado, gr.estado);
  const [candado, setCandado] = useState<EstadoCandado>(entrada.soltar ? "mio" : "buscando");
  const [preparada, setPreparada] = useState(false);
  const [espacioBajo, setEspacioBajo] = useState(false);
  const bloqueoSoportado = useSyncExternalStore(sinSuscripcion, soportaBloqueoDePantalla, () => true);

  // Quién usa el motor: al salir de la pantalla, si no hay nada en marcha se libera (si graba o sube, sigue).
  useEffect(() => {
    contarUsuario(entrada, 1);
    return () => {
      contarUsuario(entrada, -1);
      // Un instante después: si la pantalla se vuelve a montar enseguida (desarrollo, navegación rápida) no se suelta.
      setTimeout(() => {
        if (entrada.usuarios === 0 && !entrada.gr.ocupada()) olvidarGrabadora(meetingId);
      }, 0);
    };
  }, [entrada, meetingId]);

  // El candado: dos pestañas con la misma grabadora pisarían lo guardado en el dispositivo.
  useEffect(() => {
    let cancelado = false;
    void pedirCandado(entrada, meetingId).then((soltar) => {
      if (!cancelado) setCandado(soltar ? "mio" : "ocupado");
    });
    return () => {
      cancelado = true;
    };
  }, [entrada, meetingId]);

  // Lo que quedó guardado en este dispositivo de una visita anterior se rescata (y empieza a subirse) al entrar.
  useEffect(() => {
    if (candado !== "mio") return;
    let vivo = true;
    void gr.inicializar().finally(() => {
      if (vivo) setPreparada(true);
    });
    return () => {
      vivo = false;
    };
  }, [gr, candado]);

  // Cerrar la pestaña mientras se graba corta el audio: el navegador pregunta antes. Si además lo guardado vive solo en memoria, también.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      const fase = gr.estado().fase;
      if (fase === "grabando" || fase === "pausada" || (almacenDeGrabaciones().enMemoria && gr.ocupada())) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [gr]);

  // La pantalla no se apaga mientras se graba.
  const grabando = estado.fase === "grabando" || estado.fase === "pausada";
  useEffect(() => {
    if (!grabando) return;
    const bloqueo = mantenerPantallaEncendida();
    return () => bloqueo.soltar();
  }, [grabando]);

  // El espacio del dispositivo: se mira al entrar y cada 5 minutos.
  useEffect(() => {
    if (candado !== "mio") return;
    let vivo = true;
    const medir = () =>
      void espacioLibreEnDispositivo().then((libre) => {
        if (vivo && libre !== null) setEspacioBajo(libre < ESPACIO_BAJO_BYTES);
      });
    medir();
    const t = setInterval(medir, 5 * 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [candado]);

  return {
    gr, estado, preparada, candado, espacioBajo,
    sinBloqueoDePantalla: grabando && !bloqueoSoportado,
    guardadoSoloEnMemoria: almacenDeGrabaciones().enMemoria,
  };
}
