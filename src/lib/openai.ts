import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(file: File): Promise<string> {
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "es",
  });
  return transcription.text;
}

export async function generateWithAssistant(
  systemPrompt: string,
  userContent: string,
  model: string = "gpt-4o"
): Promise<{ text: string; tokensUsed: number }> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.7,
    max_tokens: 8000,
  });

  return {
    text: response.choices[0]?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}
