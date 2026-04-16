import { transcribeAudio } from "@/lib/ai-client";
import { writeFile, readFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const WHISPER_MAX_SIZE = 24 * 1024 * 1024; // 24MB safe limit (API allows 25MB)
const SEGMENT_DURATION_SECS = 600; // 10-minute segments — well under 25MB for any codec

export async function parseAudioFile(file: File): Promise<string> {
  if (file.size <= WHISPER_MAX_SIZE) {
    console.log(`[parseAudioFile] ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) — sending directly to Whisper`);
    const text = await transcribeAudio(file);
    return `[Transcripción de audio: ${file.name}]\n${text}`;
  }

  // Large file — use ffmpeg to properly split into audio segments
  console.log(`[parseAudioFile] ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB — splitting with ffmpeg`);

  const workDir = join(tmpdir(), `whisper-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "m4a";
  const inputPath = join(workDir, `input.${ext}`);

  try {
    // Write input file to temp
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, buffer);

    // Split with ffmpeg preserving codec (fast, no re-encoding)
    const chunkPattern = join(workDir, `chunk_%03d.${ext}`);
    await splitWithFfmpeg(inputPath, chunkPattern, SEGMENT_DURATION_SECS);

    // Read chunk files
    const dirFiles = await readdir(workDir);
    const chunkFiles = dirFiles.filter((f) => f.startsWith("chunk_")).sort();
    console.log(`[parseAudioFile] ffmpeg produced ${chunkFiles.length} segments`);

    if (chunkFiles.length === 0) {
      throw new Error("ffmpeg no produjo segmentos — el archivo puede estar corrupto");
    }

    // Transcribe each segment (sequentially to avoid API rate limits)
    const transcriptions: string[] = [];
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkPath = join(workDir, chunkFiles[i]);
      const chunkBuffer = await readFile(chunkPath);
      const chunkFile = new File([chunkBuffer], chunkFiles[i], { type: file.type || "audio/mp4" });

      console.log(`[parseAudioFile] Transcribing segment ${i + 1}/${chunkFiles.length} (${(chunkBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      try {
        const text = await transcribeAudio(chunkFile);
        if (text.trim()) transcriptions.push(text.trim());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[parseAudioFile] Segment ${i + 1} transcription failed:`, msg);
        transcriptions.push(`[Segmento ${i + 1}: error de transcripción — ${msg}]`);
      }
    }

    const fullText = transcriptions.join("\n\n");
    console.log(`[parseAudioFile] Complete transcription: ${fullText.length} chars from ${chunkFiles.length} segments`);
    return `[Transcripción de audio: ${file.name} (${chunkFiles.length} segmentos)]\n${fullText}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[parseAudioFile] ffmpeg splitting failed for ${file.name}:`, msg);
    return `[Audio: ${file.name} — Error al procesar: ${msg}. El archivo de ${(file.size / 1024 / 1024).toFixed(0)}MB no se pudo dividir para transcripción. Alternativa: transcríbelo con TurboScribe u otro servicio y sube el texto como archivo .txt]`;
  } finally {
    // Cleanup temp files
    try {
      const files = await readdir(workDir);
      await Promise.all(files.map((f) => unlink(join(workDir, f)).catch(() => {})));
      const { rmdir } = await import("node:fs/promises");
      await rmdir(workDir).catch(() => {});
    } catch { /* best-effort cleanup */ }
  }
}

function splitWithFfmpeg(inputPath: string, outputPattern: string, segmentDuration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
    const ffmpeg = require("fluent-ffmpeg") as typeof import("fluent-ffmpeg");
    ffmpeg.setFfmpegPath(ffmpegPath);

    ffmpeg(inputPath)
      .outputOptions([
        "-f", "segment",
        "-segment_time", String(segmentDuration),
        "-c", "copy",       // stream-copy, no re-encoding — very fast
        "-reset_timestamps", "1",
      ])
      .output(outputPattern)
      .on("start", (cmd: string) => console.log(`[ffmpeg] ${cmd}`))
      .on("error", (err: Error) => {
        console.error("[ffmpeg] Error:", err.message);
        reject(err);
      })
      .on("end", () => {
        console.log("[ffmpeg] Splitting done");
        resolve();
      })
      .run();
  });
}
