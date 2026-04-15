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

// Model selection: Sonnet for quality, Haiku for speed
// With Vercel Pro (300s timeout), Sonnet is viable and produces much better documents
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export async function generateWithClaude(
  systemPrompt: string,
  userContent: string,
  model: string = DEFAULT_MODEL
): Promise<{ text: string; tokensUsed: number }> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.4, // Lower temperature for formal/legal documents
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    const tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

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
