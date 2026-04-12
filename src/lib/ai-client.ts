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

export async function generateWithClaude(
  systemPrompt: string,
  userContent: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<{ text: string; tokensUsed: number }> {
  const client = getClient();

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
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
}

// Keep backward-compatible name for existing imports
export const generateWithAssistant = generateWithClaude;

export async function transcribeAudio(_file: File): Promise<string> {
  // Claude doesn't have a Whisper equivalent — for now, return a placeholder.
  // In production, you can use a separate Whisper API or another service.
  return "[Transcripcion de audio no disponible — se requiere servicio de transcripcion]";
}
