import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const MIME_MAP: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

export async function parseImageFile(file: File): Promise<string> {
  const mediaType = MIME_MAP[file.type];
  if (!mediaType) {
    return `[Imagen: ${file.name} — formato no soportado para analisis visual (${file.type})]`;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("placeholder") || apiKey.length < 10) {
    return `[Imagen: ${file.name} — analisis visual no disponible (configura ANTHROPIC_API_KEY)]`;
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const client = getClient();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 2048,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Analiza esta imagen en el contexto de un informe de gestión de propiedad horizontal (conjunto residencial/edificio en Colombia). Describe en detalle:
- Qué muestra la imagen (mantenimiento, daños, reparaciones, obras, eventos, documentos, etc.)
- Cualquier texto visible (letreros, documentos, facturas, recibos)
- Estado de lo que se muestra (bueno, regular, malo, en proceso)
- Cualquier dato numérico o fecha visible

Responde en español. Sé preciso y descriptivo. Si es un documento o factura, transcribe los datos relevantes.`,
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    console.log(`[parseImageFile] Analyzed ${file.name}: ${text.length} chars, ${tokensUsed} tokens`);

    return `[Análisis de imagen: ${file.name}]\n${text}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[parseImageFile] Error analyzing ${file.name}:`, msg);
    return `[Imagen: ${file.name} — error al analizar: ${msg}]`;
  }
}
