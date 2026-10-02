/**
 * Qué proveedor transcribe. Por defecto OpenAI (`gpt-4o-transcribe-diarize`: no pide cuenta nueva). Con
 * `TRANSCRIPCION_PROVEEDOR=assemblyai` y su clave, el hito 10 lo reemplazará; mientras no exista ese adaptador, se
 * avisa en el registro y se usa OpenAI. En modo demo no hay red: se usa el proveedor de ejemplo.
 */
import { crearProveedorDemo } from "./demo";
import { crearProveedorOpenAI } from "./openai";
import type { ProveedorDeTranscripcion } from "./tipos";

export function elegirProveedor(env: Readonly<Record<string, string | undefined>> = process.env): ProveedorDeTranscripcion {
  if (env.DEMO_MODE === "true") return crearProveedorDemo();
  const pedido = (env.TRANSCRIPCION_PROVEEDOR ?? "openai").trim().toLowerCase();
  if (pedido === "assemblyai") {
    console.warn("[meetings/transcripcion] AssemblyAI todavía no está disponible: se transcribe con OpenAI.");
  } else if (pedido !== "openai" && pedido !== "") {
    console.warn(`[meetings/transcripcion] Proveedor desconocido «${pedido.slice(0, 30)}»: se transcribe con OpenAI.`);
  }
  return crearProveedorOpenAI({ apiKey: env.OPENAI_API_KEY });
}
