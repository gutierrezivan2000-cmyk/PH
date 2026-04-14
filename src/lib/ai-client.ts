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

// Model selection: Use env var to override, default to Haiku for speed on Hobby plan
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export async function generateWithClaude(
  systemPrompt: string,
  userContent: string,
  model: string = DEFAULT_MODEL
): Promise<{ text: string; tokensUsed: number }> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.7,
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

export async function transcribeAudio(_file: File): Promise<string> {
  // Claude doesn't have a Whisper equivalent — for now, return a placeholder.
  // In production, you can use a separate Whisper API or another service.
  return "[Transcripcion de audio no disponible — se requiere servicio de transcripcion]";
}
