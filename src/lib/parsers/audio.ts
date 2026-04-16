import { transcribeAudio } from "@/lib/ai-client";

const WHISPER_MAX_SIZE = 24 * 1024 * 1024; // 24MB safe limit (API allows 25MB)

export async function parseAudioFile(file: File): Promise<string> {
  if (file.size <= WHISPER_MAX_SIZE) {
    const text = await transcribeAudio(file);
    return `[Transcripción de audio: ${file.name}]\n${text}`;
  }

  // Large file: split into chunks < 25MB and transcribe each one
  console.log(`[parseAudioFile] File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — splitting into chunks`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const chunks = splitAudioBuffer(buffer, file.name, file.type);
  console.log(`[parseAudioFile] Split into ${chunks.length} chunks`);

  const transcriptions: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[parseAudioFile] Transcribing chunk ${i + 1}/${chunks.length} (${(chunks[i].size / 1024 / 1024).toFixed(1)}MB)`);
    try {
      const text = await transcribeAudio(chunks[i]);
      if (text.trim()) transcriptions.push(text.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[parseAudioFile] Chunk ${i + 1} failed:`, msg);
      transcriptions.push(`[Segmento ${i + 1}: error de transcripción]`);
    }
  }

  return `[Transcripción de audio: ${file.name} (${chunks.length} segmentos)]\n${transcriptions.join("\n\n")}`;
}

function splitAudioBuffer(buffer: Buffer, filename: string, mimeType: string): File[] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp3";
  const chunks: File[] = [];
  const totalChunks = Math.ceil(buffer.length / WHISPER_MAX_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * WHISPER_MAX_SIZE;
    const end = Math.min(start + WHISPER_MAX_SIZE, buffer.length);
    const ab = new ArrayBuffer(end - start);
    new Uint8Array(ab).set(buffer.subarray(start, end));
    const chunkName = `chunk_${i + 1}.${ext}`;
    chunks.push(new File([ab], chunkName, { type: mimeType }));
  }

  return chunks;
}
