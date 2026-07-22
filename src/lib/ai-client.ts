import Anthropic from "@anthropic-ai/sdk";

// Lazy-init: only create client when actually called
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _client;
}

// Model selection: Sonnet for quality, Haiku for speed.
// Sonnet 5 is the current generation model (the older claude-sonnet-4-20250514
// has been retired and now returns not_found). Override with ANTHROPIC_MODEL.
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export async function generateWithClaude(
  systemPrompt: string,
  userContent: string,
  model: string = DEFAULT_MODEL
): Promise<{ text: string; tokensUsed: number }> {
  const client = getClient();

  try {
    console.log(`[AI] Sending request: system=${systemPrompt.length} chars, user=${userContent.length} chars, model=${model}`);

    const response = await client.messages.create({
      model,
      max_tokens: 16384,
      // Cache the (stable, ~3.4k-token) system prompt so repeat generations —
      // including across users within the cache window — don't re-pay input
      // cost for it. The per-request user content stays uncached.
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userContent }],
      // NOTE: no `temperature` — the Claude 5 family (default claude-sonnet-5)
      // rejects it ("temperature is deprecated for this model").
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    console.log(`[AI] Response: ${text.length} chars, ${tokensUsed} tokens (in=${response.usage?.input_tokens}, out=${response.usage?.output_tokens})`);

    return { text, tokensUsed };
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

  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file: uploadFile,
    language: "es", // Spanish — primary language for this app
    response_format: "text",
  });

  return typeof response === "string" ? response : (response as { text: string }).text;
}
