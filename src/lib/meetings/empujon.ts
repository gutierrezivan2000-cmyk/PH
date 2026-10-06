/**
 * «Empujones»: arrancar el trabajo de la cola sin esperar al cron (que solo existe en producción).
 *
 * Las rutas llaman a `empujar()` y siguen: `after()` corre el trabajo cuando ya se respondió, dentro del
 * `maxDuration` de la ruta. Fuera de una petición (pruebas, scripts) `after()` no existe: se ejecuta directo.
 */
import { after } from "next/server";
import { trabajar } from "./trabajador";

/** Presupuesto de una invocación: las rutas tienen `maxDuration = 300` y se deja margen para responder y cerrar. */
export const PRESUPUESTO_EMPUJON_MS = 230_000;

export function empujar(presupuestoMs: number = PRESUPUESTO_EMPUJON_MS): void {
  const trabajo = async () => {
    try {
      await trabajar({ presupuestoMs });
    } catch (e) {
      console.error("[meetings/empujon]", e);
    }
  };
  try {
    after(trabajo);
  } catch {
    void trabajo();
  }
}
