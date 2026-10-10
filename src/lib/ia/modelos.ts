/**
 * Qué modelo de Claude y qué esfuerzo usa cada función de la app: un solo lugar.
 *
 * Regla del dueño (actualizada el 15 de octubre de 2026, con el tope de uso por porcentaje):
 *  - TODO usa Claude Haiku 5.5, con el esfuerzo que corresponde a cada función (y a cada turno del chat).
 *  - Sonnet 5.5 no se usa por defecto: el chat lo usaría solo si se asigna con `IA_MODELO_AGENTE_CHAT` (o `IA_MODELO_CHAT`),
 *    porque con el uso real cuesta ~20 veces más por mensaje y casi todo el chat es consulta corta.
 *  - Opus 5.5 no se usa salvo que haga falta de verdad (hoy no se usa en ninguna función; se puede asignar a una con
 *    una variable de entorno, sin desplegar).
 *
 * Se cambian sin tocar código con variables de entorno de Vercel:
 *  - `IA_MODELO_CHAT`          → el modelo del chat de los agentes.
 *  - `IA_MODELO_GENERAL`       → el modelo de todo lo demás.
 *  (La variable antigua `ANTHROPIC_MODEL` ya no se lee: si seguía puesta en Vercel con otro modelo, anularía esta decisión en silencio.)
 *  - `IA_MODELO_<TIPO>`        → el modelo de UNA función (p. ej. `IA_MODELO_INFORME=claude-sonnet-5-5`).
 *  - `IA_ESFUERZO_<TIPO>`      → el esfuerzo de UNA función (`low`, `medium`, `high`, `xhigh` o `max`).
 *  Reuniones (ficha, acta y preguntas) tiene su propia configuración (`lib/meetings/ia.ts`): `MEETINGS_MODEL` (o, si falta,
 *  `IA_MODELO_GENERAL`), `MEETINGS_EFFORT` y `MEETINGS_EFFORT_PREGUNTAR`. Los ajustes por función de arriba no aplican a Reuniones.
 *
 * Los modelos 5 piensan por defecto (pensamiento adaptativo) y el pensamiento cuenta como tokens de salida: el esfuerzo es lo que
 * controla cuánto piensan, y por tanto el costo y la latencia. Los modelos 5 rechazan `temperature`, `top_k` y el prefill: no se mandan.
 */
export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

export const MODELO_CHAT_POR_DEFECTO = "claude-haiku-5-5";
export const MODELO_GENERAL_POR_DEFECTO = "claude-haiku-5-5";

const ESFUERZOS: readonly Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"];

type Entorno = Readonly<Record<string, string | undefined>>;

/** Funciones que usan el modelo del chat (todas las demás usan el general). */
const FUNCIONES_DE_CHAT: ReadonlySet<string> = new Set(["agente_chat"]);

/**
 * Esfuerzo por función. Criterio: documentos largos y con consecuencias legales piensan más (`high`); la conversación y la
 * extracción de datos, lo justo (`medium`); lo mecánico (leer una imagen, poner un título), casi nada (`low`).
 */
export const ESFUERZO_POR_FUNCION: Readonly<Record<string, Esfuerzo>> = {
  informe: "high",
  acta: "high",
  generacion: "high",
  requisitos_acta: "medium",
  correccion: "medium",
  generacion_lectura: "low",
  agente_chat: "medium",
  agente_titulo: "low",
  agente_lectura: "low",
  carta_cobro: "medium",
  import_unidades: "medium",
  import_bitacora: "medium",
  comunicado_draft: "medium",
  asistente_reglamento: "medium",
  reunion_ia: "high",
  reunion_acta: "high",
  reunion_pregunta: "medium",
};
const ESFUERZO_POR_DEFECTO: Esfuerzo = "medium";

const sufijo = (tipo: string) => tipo.toUpperCase().replace(/[^A-Z0-9]/g, "_");

export function modeloDeFuncion(tipo: string, env: Entorno = process.env): string {
  const propio = env[`IA_MODELO_${sufijo(tipo)}`]?.trim();
  if (propio) return propio;
  if (FUNCIONES_DE_CHAT.has(tipo)) return env.IA_MODELO_CHAT?.trim() || MODELO_CHAT_POR_DEFECTO;
  return env.IA_MODELO_GENERAL?.trim() || MODELO_GENERAL_POR_DEFECTO;
}

export function esfuerzoDeFuncion(tipo: string, env: Entorno = process.env): Esfuerzo {
  const pedido = env[`IA_ESFUERZO_${sufijo(tipo)}`]?.trim().toLowerCase();
  return ESFUERZOS.find((e) => e === pedido) ?? ESFUERZO_POR_FUNCION[tipo] ?? ESFUERZO_POR_DEFECTO;
}

/**
 * Frases que piden análisis o redactar un documento: ahí el chat piensa más. Preguntar «¿cuánto debe…?», «resume…» o «explica…» NO
 * entra: la respuesta sale de las herramientas con los datos reales y pensar más solo la encarece.
 */
const PIDE_ANALISIS = /\b(analiz|compar|proyec|redact|borrador|informe|acta|estrategia)/i;

/**
 * Esfuerzo de UN turno del chat. Lo decide el asistente según lo que se pide: un saludo o una confirmación casi no piensan;
 * una consulta con análisis, un archivo adjunto o un texto largo sí. Si `IA_ESFUERZO_AGENTE_CHAT` está definida, la fija para todos.
 */
export function esfuerzoDelTurno(mensaje: string, { adjuntos = 0 }: { adjuntos?: number } = {}, env: Entorno = process.env): Esfuerzo {
  const fijo = env.IA_ESFUERZO_AGENTE_CHAT?.trim().toLowerCase();
  const pedido = ESFUERZOS.find((e) => e === fijo);
  if (pedido) return pedido;
  const texto = mensaje.trim();
  if (adjuntos > 0 || texto.length > 600 || PIDE_ANALISIS.test(texto)) return "high";
  if (texto.length <= 25 && !texto.includes("?")) return "low";
  return "medium";
}

export const configDeFuncion = (tipo: string, env: Entorno = process.env) => ({ modelo: modeloDeFuncion(tipo, env), esfuerzo: esfuerzoDeFuncion(tipo, env) });

/** ¿Este modelo acepta `output_config.effort`? Los 5.x y Opus 4.6 en adelante sí; Haiku 4.5 y anteriores, no. */
export function aceptaEsfuerzo(modelo: string): boolean {
  const m = modelo.toLowerCase();
  return /claude-(opus-(4-[6-9]|5)|sonnet-(4-6|5)|haiku-5|fable|mythos)/.test(m);
}

/** El respaldo del servidor (`fallbacks`) solo existe para los modelos grandes; Haiku 5.5 no lo tiene. */
export function aceptaRespaldoDelServidor(modelo: string): boolean {
  return /claude-(opus|fable|mythos|sonnet)/.test(modelo.toLowerCase());
}

/**
 * El parámetro de esfuerzo listo para esparcir en la petición (vacío si el modelo no lo acepta). El tipo del SDK instalado aún
 * no conoce `xhigh`; el valor llega tal cual a la API.
 */
export function parametroDeEsfuerzo(modelo: string, esfuerzo: Esfuerzo): { output_config?: { effort: "low" | "medium" | "high" | "max" } } {
  return aceptaEsfuerzo(modelo) ? { output_config: { effort: esfuerzo as "high" } } : {};
}

/** ¿El error es la API diciendo que no entiende el esfuerzo? (Para reintentar sin él en vez de fallar.) */
export function esErrorDeEsfuerzo(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /(output_config|effort)/i.test(msg) && /(400|invalid_request|not supported|unsupported|extra inputs|unexpected)/i.test(msg);
}
