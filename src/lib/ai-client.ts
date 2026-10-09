import Anthropic from "@anthropic-ai/sdk";
import { TIPOS } from "@/lib/consumo/funciones";
import type { Tokens } from "@/lib/consumo/precios";
import { registrarConsumo, tipoDeLectura, type RefDeConsumo } from "@/lib/consumo/registrar";
import { tokensDeAnthropic } from "@/lib/consumo/uso";
import { configDeFuncion, esErrorDeEsfuerzo, parametroDeEsfuerzo } from "@/lib/ia/modelos";

// Lazy-init: only create client when actually called
let _client: Anthropic | null = null;

/**
 * The SDK defaults to a 10-minute timeout and 2 retries — longer than any of
 * our routes can run (`maxDuration` is 30–300s). A slow API call was therefore
 * never surfaced as an error we could report: the platform killed the function
 * first and answered a 504 with an HTML body, which the browser showed as a
 * generic network failure. Timing out *inside* the route's own budget turns
 * that into a catchable error with a message for the user.
 *
 * The default suits the long report generations (maxDuration 300). Routes with
 * a tighter budget pass their own — see `timeoutMs`.
 */
const DEFAULT_TIMEOUT_MS = 240_000;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: DEFAULT_TIMEOUT_MS,
      // One retry, not two: a second retry always lands past the route budget.
      maxRetries: 1,
    });
  }
  return _client;
}

// El modelo y el esfuerzo salen de `lib/ia/modelos.ts` según la función (`consumo.tipo`): el chat usa Sonnet 5.5 y todo lo demás
// Haiku 5.5. Un modelo pasado a mano gana sobre esa tabla.
export async function generateWithClaude(
  systemPrompt: string,
  userContent: string,
  model?: string,
  /**
   * Timeout por llamada. INVARIANTE: con `maxRetries: 1` el SDK hace hasta DOS
   * intentos completos, así que debe cumplirse
   *
   *     timeoutMs * 2 + trabajo_de_la_ruta  <  maxDuration
   *
   * Ponerlo solo por debajo de maxDuration no basta: el reintento se pasaba
   * siempre del presupuesto y la plataforma mataba la función, devolviendo el
   * 504 con cuerpo HTML que estos timeouts existen para evitar.
   */
  opts: {
    timeoutMs?: number;
    /**
     * Registrar el consumo de esta llamada con esta función (`TIPOS`). El usuario y la operación salen de aquí o del contexto
     * (`conConsumo`). Sin esto, quien llama registra por su cuenta.
     */
    consumo?: { tipo: string; userId?: string; ref?: RefDeConsumo | null };
  } = {}
): Promise<{ text: string; tokensUsed: number; model: string; tokens: Tokens; costUsd: number }> {
  const client = getClient();
  const config = configDeFuncion(opts.consumo?.tipo ?? "general");
  const modelo = model ?? config.modelo;

  try {
    console.log(`[AI] Sending request: system=${systemPrompt.length} chars, user=${userContent.length} chars, model=${modelo}, effort=${config.esfuerzo}`);

    // El pensamiento de los modelos 5 cuenta como salida y comparte `max_tokens` con la respuesta. 20.000 es el tope que el SDK
    // permite sin streaming.
    const peticion = {
      model: modelo,
      max_tokens: 20_000,
        // Cache the (stable, ~3.4k-token) system prompt so repeat generations —
        // including across users within the cache window — don't re-pay input
        // cost for it. The per-request user content stays uncached.
        system: [
          { type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } },
        ],
        messages: [{ role: "user" as const, content: userContent }],
        // NOTE: no `temperature` — la familia Claude 5 (Sonnet 5.5, Haiku 5.5) la rechaza.
    };
    const opcionesDeRed = opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined;
    let response;
    try {
      response = await client.messages.create({ ...peticion, ...parametroDeEsfuerzo(modelo, config.esfuerzo) }, opcionesDeRed);
    } catch (e) {
      // Si la API no entiende el esfuerzo de este modelo, se repite sin él en vez de fallar: lo importante es que responda.
      if (!esErrorDeEsfuerzo(e)) throw e;
      console.warn("[AI] el modelo no acepta `effort`: se reintenta sin él");
      response = await client.messages.create(peticion, opcionesDeRed);
    }
    if (response.stop_reason === "refusal") {
      throw new Error("La IA no pudo atender esta solicitud. Reformula el texto e intenta de nuevo.");
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    console.log(`[AI] Response: ${text.length} chars, ${tokensUsed} tokens (in=${response.usage?.input_tokens}, out=${response.usage?.output_tokens})`);

    const uso = tokensDeAnthropic(response, modelo);
    const costUsd = opts.consumo
      ? await registrarConsumo({ tipo: opts.consumo.tipo, proveedor: "anthropic", modelo: uso.modelo, tokens: uso.tokens, userId: opts.consumo.userId, ref: opts.consumo.ref })
      : 0;
    return { text, tokensUsed, model: uso.modelo, tokens: uso.tokens, costUsd };
  } catch (error: unknown) {
    // Translate common API errors to user-friendly Spanish messages
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("credit balance is too low") || msg.includes("billing")) {
      throw new Error("El servicio de IA no tiene creditos disponibles. Contacta al administrador de la plataforma.");
    }
    if (msg.includes("authentication") || msg.includes("api_key") || msg.includes("401")) {
      throw new Error("La clave de API de IA no es valida. Contacta al administrador de la plataforma.");
    }
    if (msg.includes("rate_limit") || msg.includes("429")) {
      throw new Error("El servicio de IA esta temporalmente saturado. Intenta de nuevo en unos minutos.");
    }
    if (msg.includes("not_found") || msg.includes("model:") || msg.includes("404")) {
      throw new Error("El modelo de IA configurado no esta disponible. Contacta al administrador de la plataforma.");
    }
    throw error;
  }
}

// Keep backward-compatible name for existing imports
export const generateWithAssistant = generateWithClaude;

export async function transcribeAudio(file: File): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[transcribeAudio] OPENAI_API_KEY not set — audio transcription unavailable");
    return "[Transcripcion de audio no disponible — configura OPENAI_API_KEY en las variables de entorno para habilitar transcripcion con Whisper]";
  }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  // Convert Web File to the format OpenAI SDK expects
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // OpenAI SDK accepts File-like objects with name property
  const uploadFile = new File([buffer], file.name, { type: file.type });

  // `verbose_json` trae la duración del audio: con ella se registra lo que costó (Whisper se cobra por minuto).
  const response = (await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: uploadFile,
    language: "es", // Spanish — primary language for this app
    response_format: "verbose_json",
  })) as unknown as { text?: string; duration?: number } | string;

  const text = typeof response === "string" ? response : response.text ?? "";
  const segundos = typeof response === "object" && typeof response.duration === "number" ? response.duration : 0;
  if (segundos > 0) {
    await registrarConsumo({
      tipo: tipoDeLectura("audio", TIPOS.audioEnGeneracion),
      proveedor: "openai",
      modelo: "whisper-1",
      audioSegundos: segundos,
      tokensDelRegistro: Math.round(segundos),
    });
  }
  return text;
}
