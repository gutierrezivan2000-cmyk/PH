import { transcribeAudio } from "@/lib/ai-client";

export async function parseAudioFile(file: File): Promise<string> {
  const text = await transcribeAudio(file);
  return `[Transcripción de audio: ${file.name}]\n${text}`;
}
