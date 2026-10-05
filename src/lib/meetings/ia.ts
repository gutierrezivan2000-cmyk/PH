/**
 * La IA de Reuniones: un cliente de Claude para tareas de extracción con salida JSON estructurada (la ficha de la
 * reunión y, después, el acta y las preguntas).
 *
 * Decisiones, según la guía de la API de Claude:
 *  - Modelo `claude-opus-5-5` (se cambia con `MEETINGS_MODEL` en Vercel, sin desplegar).
 *  - En Opus 5.5 el pensamiento no se puede desactivar y el esfuerzo por defecto es `medium`: se fija el esfuerzo
 *    explícito (`MEETINGS_EFFORT`, por defecto `high`) y NO se manda `thinking` ni `temperature` (los rechaza).
 *  - Streaming + `finalMessage()`: una llamada larga no choca con los tiempos de espera.
 *  - Salida estructurada (`output_config.format`): el modelo devuelve JSON que cumple el esquema; aun así se valida a
 *    mano en `ficha.ts` (los tiempos, los identificadores y las etiquetas tienen que existir de verdad).
 *  - `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): si los clasificadores de seguridad rechazan una
 *    petición, la API la repite sola en otro modelo. Si la organización no tiene esa beta, se reintenta sin ella.
 *  - Se revisa `stop_reason` (`refusal`, `max_tokens`) ANTES de leer el contenido.
 *  - Los reintentos los hace la cola de tareas (`maxRetries: 0` en el SDK: dos reintentos del SDK se comerían el
 *    presupuesto de tiempo de la tarea).
 *  - Se registra el uso (entrada, salida y caché) y su costo, sumando los intentos del respaldo si los hubo.
 *
 * Los registros nunca llevan texto de la reunión.
 */

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

export const MODELO_POR_DEFECTO = "claude-opus-5-5";
export const ESFUERZO_POR_DEFECTO: Esfuerzo = "high";
const BETA_RESPALDO = "server-side-fallback-2026-07-01";
const ESFUERZOS: readonly Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"];

type Entorno = Readonly<Record<string, string | undefined>>;

export const modeloDeReuniones = (env: Entorno = process.env): string => env.MEETINGS_MODEL?.trim() || MODELO_POR_DEFECTO;

export function esfuerzoDeReuniones(env: Entorno = process.env, porDefecto: Esfuerzo = ESFUERZO_POR_DEFECTO): Esfuerzo {
  const pedido = env.MEETINGS_EFFORT?.trim().toLowerCase();
  return ESFUERZOS.find((e) => e === pedido) ?? porDefecto;
}

/** «Preguntar» piensa menos que el análisis y el acta (`medium`): es una charla, y cada pregunta se paga. Se cambia con `MEETINGS_EFFORT_PREGUNTAR`. */
export const ESFUERZO_DE_PREGUNTAR_POR_DEFECTO: Esfuerzo = "medium";

export function esfuerzoDePreguntar(env: Entorno = process.env): Esfuerzo {
  return esfuerzoDeReuniones({ MEETINGS_EFFORT: env.MEETINGS_EFFORT_PREGUNTAR }, ESFUERZO_DE_PREGUNTAR_POR_DEFECTO);
}

/* ════════════════════════════════════════════════════════════════════
   Contratos
   ════════════════════════════════════════════════════════════════════ */

export type EntradaIA = {
  /** Para los mensajes de error y el registro: «bloque 3», «ficha». */
  etiqueta: string;
  sistema: string;
  usuario: string;
  /** JSON Schema de la salida: objetos con `additionalProperties: false` y todos sus campos en `required`. */
  esquema: Record<string, unknown>;
  /** Tope de tokens de la respuesta, contando el pensamiento. */
  maxTokens?: number;
  esfuerzo?: Esfuerzo;
  /** Tiempo máximo de la llamada. */
  timeoutMs: number;
  senal?: AbortSignal;
};

export type UsoIA = { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number; costoUsd: number };

export type RespuestaIA = {
  json: unknown;
  uso: UsoIA;
  /** El modelo que produjo la respuesta (puede ser el de respaldo). */
  modelo: string;
  /** Una petición rechazada se repitió en otro modelo. */
  conRespaldo: boolean;
};

/** Un turno de una conversación con la IA. */
export type TurnoDeIA = { rol: "user" | "assistant"; texto: string };

/**
 * Una llamada que responde en TEXTO (el acta, las respuestas de «Preguntar»). La estructura es la que pide la caché del
 * servicio: lo que se repite entre llamadas (`compartido`: la transcripción completa de la reunión, ~100–200 mil tokens) va
 * primero y se guarda 1 h en la caché; lo que cambia (la sección, la pregunta) va después. El sistema y el esfuerzo tienen
 * que ser los mismos en todas las llamadas del trabajo: cambiarlos invalida lo guardado.
 */
export type EntradaTexto = {
  etiqueta: string;
  sistema: string;
  /** Lo que comparten todas las llamadas de un mismo trabajo. Debe ser byte a byte igual cada vez. */
  compartido: string;
  /** La conversación, de la primera pregunta a la última: alterna usuario y asistente y termina en un turno del usuario. */
  turnos: readonly TurnoDeIA[];
  maxTokens?: number;
  esfuerzo?: Esfuerzo;
  timeoutMs: number;
  senal?: AbortSignal;
  /** Cada trozo de texto apenas llega (Preguntar lo manda al navegador mientras se escribe). */
  alTexto?: (trozo: string) => void;
  /** Si la respuesta llega al tope de tokens: por omisión es un fallo (un acta cortada no sirve); en una charla se devuelve lo escrito. */
  permitirCorte?: boolean;
};

export type RespuestaTexto = {
  texto: string;
  uso: UsoIA;
  modelo: string;
  conRespaldo: boolean;
  /** La respuesta se cortó por el tope de tokens (solo con `permitirCorte`). */
  cortada: boolean;
};

/** Escribir en la caché lo que van a compartir las llamadas siguientes, sin generar nada (`max_tokens: 0`). */
export type EntradaDeCalentamiento = Pick<EntradaTexto, "etiqueta" | "sistema" | "compartido" | "esfuerzo" | "timeoutMs" | "senal">;

export interface ClienteIA {
  generarJson(entrada: EntradaIA): Promise<RespuestaIA>;
  generarTexto(entrada: EntradaTexto): Promise<RespuestaTexto>;
  calentar(entrada: EntradaDeCalentamiento): Promise<{ uso: UsoIA; modelo: string }>;
}

/** Un fallo de la IA, con el mensaje que ve la persona y si vale la pena reintentar. Lo convierte en `ErrorTarea` la cola. */
export class ErrorIA extends Error {
  readonly reintentable: boolean;
  constructor(mensaje: string, opciones: { reintentable: boolean }) {
    super(mensaje);
    this.name = "ErrorIA";
    this.reintentable = opciones.reintentable;
  }
}

/* ════════════════════════════════════════════════════════════════════
   Costo
   ════════════════════════════════════════════════════════════════════ */

/** `escritura` es la escritura en caché de 5 min (1,25× la entrada); `escritura1h`, la de 1 h (2× la entrada). */
type Precio = { entrada: number; salida: number; lectura: number; escritura: number; escritura1h: number };

/** US$ por millón de tokens. Precios a verificar con los de Anthropic; el costo es una estimación para los cupos y los informes. */
export const PRECIOS_USD_POR_MTOK: Readonly<Record<string, Precio>> = {
  "claude-opus-5-5": { entrada: 4, salida: 20, lectura: 0.2, escritura: 5, escritura1h: 8 },
  "claude-opus-5": { entrada: 5, salida: 25, lectura: 0.5, escritura: 6.25, escritura1h: 10 },
  "claude-opus-4-8": { entrada: 5, salida: 25, lectura: 0.5, escritura: 6.25, escritura1h: 10 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, lectura: 0.2, escritura: 2.5, escritura1h: 4 },
  "claude-sonnet-5": { entrada: 2, salida: 10, lectura: 0.2, escritura: 2.5, escritura1h: 4 },
  "claude-fable-5-1": { entrada: 10, salida: 50, lectura: 0.25, escritura: 12.5, escritura1h: 20 },
  "claude-haiku-4-5": { entrada: 1, salida: 5, lectura: 0.1, escritura: 1.25, escritura1h: 2 },
};
/** De un modelo que no está en la tabla se supone el precio de Opus 5: mejor pasarse que quedarse corto. */
const PRECIO_DESCONOCIDO = PRECIOS_USD_POR_MTOK["claude-opus-5"];

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

type UsoCrudo = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  /** El desglose de lo escrito en caché por duración: lo de 1 h cuesta más que lo de 5 min. */
  cache_creation?: { ephemeral_1h_input_tokens?: unknown } | null;
  model?: unknown;
  type?: unknown;
};

const costoDe = (u: Omit<UsoIA, "costoUsd">, p: Precio, escritura1h: number): number => {
  const de1h = Math.min(escritura1h, u.cacheEscritura);
  return (u.entrada * p.entrada + u.salida * p.salida + u.cacheLectura * p.lectura + (u.cacheEscritura - de1h) * p.escritura + de1h * p.escritura1h) / 1_000_000;
};

/**
 * El uso de una respuesta y lo que costó. Si hubo respaldo, `usage.iterations` trae cada intento (los rechazados y el que
 * respondió) y manda sobre el uso de arriba, que solo cuenta el último.
 */
export function calcularUso(
  mensaje: { model?: unknown; usage?: (UsoCrudo & { iterations?: unknown }) | null },
  modeloSolicitado: string,
): UsoIA {
  const modeloFinal = typeof mensaje.model === "string" && mensaje.model ? mensaje.model : modeloSolicitado;
  const entradas: UsoCrudo[] = Array.isArray(mensaje.usage?.iterations)
    ? (mensaje.usage.iterations as UsoCrudo[]).filter((x) => x && (numero(x.input_tokens) || numero(x.output_tokens) || numero(x.cache_read_input_tokens)))
    : [];
  const filas: Array<{ uso: UsoCrudo; modelo: string }> =
    entradas.length > 0
      ? entradas.map((uso) => ({
          uso,
          modelo: typeof uso.model === "string" && uso.model ? uso.model : uso.type === "fallback_message" ? modeloFinal : modeloSolicitado,
        }))
      : [{ uso: mensaje.usage ?? {}, modelo: modeloFinal }];

  const total: UsoIA = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0 };
  for (const { uso, modelo } of filas) {
    const parte = {
      entrada: numero(uso.input_tokens),
      salida: numero(uso.output_tokens),
      cacheLectura: numero(uso.cache_read_input_tokens),
      cacheEscritura: numero(uso.cache_creation_input_tokens),
    };
    total.entrada += parte.entrada;
    total.salida += parte.salida;
    total.cacheLectura += parte.cacheLectura;
    total.cacheEscritura += parte.cacheEscritura;
    total.costoUsd += costoDe(parte, PRECIOS_USD_POR_MTOK[modelo] ?? PRECIO_DESCONOCIDO, numero(uso.cache_creation?.ephemeral_1h_input_tokens));
  }
  return total;
}

/** Suma el uso de varias llamadas. */
export const sumarUso = (a: UsoIA, b: UsoIA): UsoIA => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  cacheLectura: a.cacheLectura + b.cacheLectura,
  cacheEscritura: a.cacheEscritura + b.cacheEscritura,
  costoUsd: a.costoUsd + b.costoUsd,
});

export const USO_VACIO: UsoIA = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0 };

/** Los tokens que se cuentan de un uso: todos los que se leyeron o escribieron (los mismos en el análisis, el acta y las preguntas). */
export const tokensDeUso = (u: UsoIA): number => u.entrada + u.salida + u.cacheLectura + u.cacheEscritura;

/* ════════════════════════════════════════════════════════════════════
   Errores
   ════════════════════════════════════════════════════════════════════ */

const comoObjeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** El 400 de «esta organización no tiene esa beta»: el mensaje nombra el encabezado `anthropic-beta`. */
const esBetaNoDisponible = (e: unknown): boolean => {
  const x = comoObjeto(e);
  return x.status === 400 && typeof x.message === "string" && /anthropic-beta/i.test(x.message);
};

/**
 * Qué hacer con un fallo de la llamada. Se reintentan los del momento (sin respuesta, 408, 409, 429, 5xx y 529
 * «saturado»); no se reintentan los que no se arreglan solos: credenciales, saldo, modelo que no existe o una petición
 * que el servicio rechaza.
 */
export function aErrorIA(e: unknown): ErrorIA {
  if (e instanceof ErrorIA) return e;
  const x = comoObjeto(e);
  const status = typeof x.status === "number" ? x.status : null;
  const detalle = typeof x.message === "string" ? x.message.slice(0, 200) : "";

  if (status === 402 || (status === 400 && /credit balance|billing/i.test(detalle))) {
    return new ErrorIA("No pudimos analizar la reunión con IA: el servicio no tiene saldo disponible. Avisa a soporte.", { reintentable: false });
  }
  if (status === 401 || status === 403) {
    return new ErrorIA("No pudimos analizar la reunión con IA: el servicio no aceptó las credenciales. Avisa a soporte.", { reintentable: false });
  }
  if (status === 404) {
    return new ErrorIA("No pudimos analizar la reunión con IA: el modelo configurado no está disponible. Avisa a soporte.", { reintentable: false });
  }
  if (status !== null && status >= 400 && status < 500 && ![408, 409, 429].includes(status)) {
    return new ErrorIA(`El servicio de IA rechazó la solicitud${detalle ? ` (${detalle})` : ""}.`, { reintentable: false });
  }
  return new ErrorIA(
    status === 429 || status === 529 ? "El servicio de IA está saturado. Se vuelve a intentar." : `El servicio de IA no respondió${detalle ? `: ${detalle}` : ""}.`,
    { reintentable: true },
  );
}

/* ════════════════════════════════════════════════════════════════════
   El cliente
   ════════════════════════════════════════════════════════════════════ */

type ContenidoCrudo = { type?: unknown; text?: unknown };
export type MensajeCrudo = {
  model?: unknown;
  stop_reason?: unknown;
  stop_details?: { category?: unknown; explanation?: unknown } | null;
  content?: ContenidoCrudo[] | null;
  usage?: (UsoCrudo & { iterations?: unknown }) | null;
};
export type FlujoDeAnthropic = { on?(evento: "text", fn: (trozo: unknown) => void): unknown; finalMessage(): Promise<MensajeCrudo> };
export type ClienteDeAnthropic = {
  beta: {
    messages: {
      stream(params: Record<string, unknown>, opciones?: Record<string, unknown>): FlujoDeAnthropic;
      create?(params: Record<string, unknown>, opciones?: Record<string, unknown>): Promise<MensajeCrudo>;
    };
  };
};

export type OpcionesClienteIA = {
  /** Para pruebas: un cliente de Anthropic falso. */
  cliente?: ClienteDeAnthropic;
  apiKey?: string;
  modelo?: string;
  /** Pedir el respaldo de la API (`fallbacks: "default"`). Por omisión sí, salvo `MEETINGS_FALLBACKS=off`. */
  respaldo?: boolean;
};

/** Si la organización no tiene la beta del respaldo, se avisa una vez y se deja de pedirla en este proceso. */
let respaldoNoDisponible = false;
/** Solo para pruebas. */
export const reiniciarRespaldo = (): void => {
  respaldoNoDisponible = false;
};

const TOPE_DE_TOKENS = 32_000;

function textoDe(mensaje: MensajeCrudo): string {
  return (mensaje.content ?? [])
    .flatMap((b) => (b && b.type === "text" && typeof b.text === "string" ? [b.text] : []))
    .join("")
    .trim();
}

export function crearClienteIA(opciones: OpcionesClienteIA = {}): ClienteIA {
  const modelo = opciones.modelo ?? modeloDeReuniones();
  const quiereRespaldo = opciones.respaldo ?? process.env.MEETINGS_FALLBACKS?.trim().toLowerCase() !== "off";
  let cliente: Promise<ClienteDeAnthropic> | null = null;

  const obtenerCliente = (): Promise<ClienteDeAnthropic> => {
    if (opciones.cliente) return Promise.resolve(opciones.cliente);
    const apiKey = opciones.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Promise.reject(new ErrorIA("No pudimos analizar la reunión con IA: el servicio no está configurado. Avisa a soporte.", { reintentable: false }));
    }
    cliente ??= import("@anthropic-ai/sdk").then(({ default: Anthropic }) => new Anthropic({ apiKey, maxRetries: 0 }) as unknown as ClienteDeAnthropic);
    return cliente;
  };

  async function llamar(entrada: EntradaIA, conRespaldo: boolean): Promise<MensajeCrudo> {
    const params: Record<string, unknown> = {
      model: modelo,
      max_tokens: entrada.maxTokens ?? TOPE_DE_TOKENS,
      system: entrada.sistema,
      messages: [{ role: "user", content: entrada.usuario }],
      // Sin `thinking` (en Opus 5.5 siempre piensa) y sin `temperature` (los modelos 5 la rechazan).
      output_config: { effort: entrada.esfuerzo ?? esfuerzoDeReuniones(), format: { type: "json_schema", schema: entrada.esquema } },
    };
    if (conRespaldo) {
      params.betas = [BETA_RESPALDO];
      params.fallbacks = "default";
    }
    const flujo = (await obtenerCliente()).beta.messages.stream(params, { timeout: entrada.timeoutMs, signal: entrada.senal, maxRetries: 0 });
    return flujo.finalMessage();
  }

  /**
   * Hace la llamada pidiendo el respaldo del servicio; si la organización no tiene esa beta (un 400 que nombra
   * `anthropic-beta`), se repite sin ella y se deja de pedirla en este proceso.
   */
  async function enviarConRespaldo(llamarCon: (conRespaldo: boolean) => Promise<MensajeCrudo>): Promise<{ mensaje: MensajeCrudo; conRespaldo: boolean }> {
    let conRespaldo = quiereRespaldo && !respaldoNoDisponible;
    try {
      try {
        return { mensaje: await llamarCon(conRespaldo), conRespaldo };
      } catch (e) {
        if (!conRespaldo || !esBetaNoDisponible(e)) throw e;
        console.warn("[meetings/ia] la organización no tiene la beta del respaldo de modelos: se sigue sin ella.");
        respaldoNoDisponible = true;
        conRespaldo = false;
        return { mensaje: await llamarCon(false), conRespaldo };
      }
    } catch (e) {
      throw aErrorIA(e);
    }
  }

  /** Los mensajes de una llamada de texto: el bloque compartido (con la caché de 1 h) y la primera pregunta, y lo que sigue. */
  function mensajesDeTexto(entrada: Pick<EntradaTexto, "compartido" | "turnos">): Array<Record<string, unknown>> {
    const [primero, ...resto] = entrada.turnos;
    if (!primero || primero.rol !== "user" || entrada.turnos[entrada.turnos.length - 1].rol !== "user" || resto.some((t, i) => t.rol !== (i % 2 === 0 ? "assistant" : "user"))) {
      throw new ErrorIA("La conversación con la IA no es válida (debe alternar y terminar en una pregunta).", { reintentable: false });
    }
    return [
      {
        role: "user",
        content: [
          { type: "text", text: entrada.compartido, cache_control: { type: "ephemeral", ttl: "1h" } },
          { type: "text", text: primero.texto },
        ],
      },
      ...resto.map((t) => ({ role: t.rol, content: t.texto })),
    ];
  }

  return {
    async generarJson(entrada: EntradaIA): Promise<RespuestaIA> {
      const { mensaje } = await enviarConRespaldo((conRespaldo) => llamar(entrada, conRespaldo));
      // Primero cómo terminó, después el contenido.
      const motivo = mensaje.stop_reason;
      if (motivo === "refusal") {
        const categoria = typeof mensaje.stop_details?.category === "string" ? ` (${mensaje.stop_details.category})` : "";
        throw new ErrorIA(`La IA no pudo analizar ${entrada.etiqueta}${categoria}.`, { reintentable: false });
      }
      if (motivo === "max_tokens") throw new ErrorIA(`La respuesta de la IA para ${entrada.etiqueta} se cortó antes de terminar. Se vuelve a intentar.`, { reintentable: true });

      const texto = textoDe(mensaje);
      if (!texto) throw new ErrorIA(`La IA no devolvió nada para ${entrada.etiqueta}. Se vuelve a intentar.`, { reintentable: true });
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new ErrorIA(`La IA devolvió ${entrada.etiqueta} en un formato que no se pudo leer. Se vuelve a intentar.`, { reintentable: true });
      }
      const usoRespuesta = calcularUso(mensaje, modelo);
      const modeloFinal = typeof mensaje.model === "string" && mensaje.model ? mensaje.model : modelo;
      return { json, uso: usoRespuesta, modelo: modeloFinal, conRespaldo: modeloFinal !== modelo };
    },

    async generarTexto(entrada: EntradaTexto): Promise<RespuestaTexto> {
      const mensajes = mensajesDeTexto(entrada);
      const { mensaje } = await enviarConRespaldo(async (conRespaldo) => {
        const params: Record<string, unknown> = {
          model: modelo,
          max_tokens: entrada.maxTokens ?? TOPE_DE_TOKENS,
          // El sistema va como texto, igual que en el calentamiento: el prefijo tiene que ser idéntico para que la caché sirva.
          system: entrada.sistema,
          messages: mensajes,
          output_config: { effort: entrada.esfuerzo ?? esfuerzoDeReuniones() },
        };
        if (conRespaldo) {
          params.betas = [BETA_RESPALDO];
          params.fallbacks = "default";
        }
        const flujo = (await obtenerCliente()).beta.messages.stream(params, { timeout: entrada.timeoutMs, signal: entrada.senal, maxRetries: 0 });
        const alTexto = entrada.alTexto;
        if (alTexto) flujo.on?.("text", (trozo) => typeof trozo === "string" && trozo ? alTexto(trozo) : undefined);
        return flujo.finalMessage();
      });

      const motivo = mensaje.stop_reason;
      if (motivo === "refusal") {
        const categoria = typeof mensaje.stop_details?.category === "string" ? ` (${mensaje.stop_details.category})` : "";
        throw new ErrorIA(`La IA no pudo trabajar ${entrada.etiqueta}${categoria}.`, { reintentable: false });
      }
      const cortada = motivo === "max_tokens";
      if (cortada && !entrada.permitirCorte) {
        throw new ErrorIA(`La respuesta de la IA para ${entrada.etiqueta} se cortó antes de terminar. Se vuelve a intentar.`, { reintentable: true });
      }
      const texto = textoDe(mensaje);
      if (!texto) throw new ErrorIA(`La IA no devolvió nada para ${entrada.etiqueta}. Se vuelve a intentar.`, { reintentable: true });
      const modeloFinal = typeof mensaje.model === "string" && mensaje.model ? mensaje.model : modelo;
      return { texto, uso: calcularUso(mensaje, modelo), modelo: modeloFinal, conRespaldo: modeloFinal !== modelo, cortada };
    },

    async calentar(entrada: EntradaDeCalentamiento): Promise<{ uso: UsoIA; modelo: string }> {
      let mensaje: MensajeCrudo;
      try {
        const sdk = await obtenerCliente();
        if (!sdk.beta.messages.create) throw new ErrorIA("El cliente de IA no sabe calentar la caché.", { reintentable: false });
        // `max_tokens: 0`: el servicio lee el prefijo y lo escribe en la caché y no genera nada (no se cobra salida). Mismos
        // modelo, sistema y esfuerzo que las llamadas de verdad, y el punto de caché en el último bloque compartido.
        mensaje = await sdk.beta.messages.create(
          {
            model: modelo,
            max_tokens: 0,
            system: entrada.sistema,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: entrada.compartido, cache_control: { type: "ephemeral", ttl: "1h" } },
                  { type: "text", text: "Calentando la caché: no respondas." },
                ],
              },
            ],
            output_config: { effort: entrada.esfuerzo ?? esfuerzoDeReuniones() },
          },
          { timeout: entrada.timeoutMs, signal: entrada.senal, maxRetries: 0 },
        );
      } catch (e) {
        throw aErrorIA(e);
      }
      return { uso: calcularUso(mensaje, modelo), modelo: typeof mensaje.model === "string" && mensaje.model ? mensaje.model : modelo };
    },
  };
}
