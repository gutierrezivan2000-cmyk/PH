import { transcribeAudio } from "@/lib/ai-client";
import { writeFile, readFile, readdir, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const WHISPER_MAX_SIZE = 24 * 1024 * 1024; // 24MB safe limit (API allows 25MB)
const SEGMENT_DURATION_SECS = 600; // 10-minute segments — well under 25MB for any codec

/**
 * Segmentos que se transcriben A LA VEZ.
 *
 * En serie no da el tiempo: la grabación de una asamblea de dos horas son 12
 * segmentos y, aun suponiendo que Whisper vaya a 20x tiempo real, son 360 s —
 * por encima del maxDuration de 300 s de la ruta que llama aquí. La función
 * moría sin entregar nada. Con 4 en paralelo el mismo audio baja a ~180 s y
 * queda margen para generar el documento.
 */
const CONCURRENCIA = 4;

/**
 * Presupuesto de tiempo para transcribir. Cuando se agota se deja de arrancar
 * segmentos nuevos y se devuelve lo que haya, diciéndolo: media transcripción
 * con un aviso es infinitamente más útil que una función muerta a los 300 s.
 */
const PRESUPUESTO_MS = 200_000;

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

    // El troceado corta por TIEMPO, así que el peso del segmento depende del
    // códec de origen: 10 minutos de WAV son ~103 MB y de FLAC ~51 MB, muy por
    // encima del máximo de Whisper. Copiar el flujo es lo más rápido, pero con
    // esos formatos hay que recodificar a algo compacto o TODOS los segmentos
    // se rechazan uno por uno.
    const SIN_COMPRIMIR = ["wav", "flac", "aiff", "aif", "caf", "pcm"];
    let recodificar = SIN_COMPRIMIR.includes(ext);

    const trocear = async (conRecodificacion: boolean) => {
      for (const f of await readdir(workDir)) {
        if (f.startsWith("chunk_")) await unlink(join(workDir, f)).catch(() => {});
      }
      // Al recodificar se usa m4a mono a 16 kHz, que es justo lo que Whisper
      // quiere y pesa ~0,36 MB por minuto.
      const salida = conRecodificacion ? "m4a" : ext;
      await splitWithFfmpeg(
        inputPath,
        join(workDir, `chunk_%03d.${salida}`),
        SEGMENT_DURATION_SECS,
        conRecodificacion
      );
      const dir = await readdir(workDir);
      return dir.filter((f) => f.startsWith("chunk_")).sort();
    };

    let chunkFiles = await trocear(recodificar);

    // Red de seguridad: si algún segmento salió por encima del máximo (un códec
    // que no estaba en la lista), se rehace recodificando.
    if (!recodificar) {
      const tamanos = await Promise.all(
        chunkFiles.map(async (f) => (await readFile(join(workDir, f))).length)
      );
      if (tamanos.some((t) => t > WHISPER_MAX_SIZE)) {
        console.warn("[parseAudioFile] segmentos por encima del máximo de Whisper — se recodifica");
        recodificar = true;
        chunkFiles = await trocear(true);
      }
    }
    console.log(`[parseAudioFile] ffmpeg produced ${chunkFiles.length} segments${recodificar ? " (recodificados)" : ""}`);

    if (chunkFiles.length === 0) {
      throw new Error("ffmpeg no produjo segmentos — el archivo puede estar corrupto");
    }

    // Transcripción por tandas, conservando el ORDEN de los segmentos: el acta
    // se redacta siguiendo el hilo de la asamblea, y un orden alterado la
    // vuelve incoherente.
    const arranque = Date.now();
    const partes: (string | null)[] = new Array(chunkFiles.length).fill(null);
    let sinTiempo = 0;

    for (let inicio = 0; inicio < chunkFiles.length; inicio += CONCURRENCIA) {
      if (Date.now() - arranque > PRESUPUESTO_MS) {
        sinTiempo = chunkFiles.length - inicio;
        console.warn(`[parseAudioFile] presupuesto agotado: quedan ${sinTiempo} segmentos sin transcribir`);
        break;
      }
      const tanda = chunkFiles.slice(inicio, inicio + CONCURRENCIA);
      await Promise.all(
        tanda.map(async (nombre, j) => {
          const idx = inicio + j;
          try {
            const chunkBuffer = await readFile(join(workDir, nombre));
            const chunkFile = new File([chunkBuffer], nombre, { type: file.type || "audio/mp4" });
            console.log(`[parseAudioFile] Transcribing segment ${idx + 1}/${chunkFiles.length} (${(chunkBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
            const text = await transcribeAudio(chunkFile);
            if (text.trim()) partes[idx] = text.trim();
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[parseAudioFile] Segment ${idx + 1} transcription failed:`, msg);
            partes[idx] = `[Segmento ${idx + 1}: error de transcripción — ${msg}]`;
          }
        })
      );
    }

    const transcriptions = partes.filter((t): t is string => t !== null);
    if (sinTiempo > 0) {
      const minutos = Math.round((sinTiempo * SEGMENT_DURATION_SECS) / 60);
      transcriptions.push(
        `[La transcripción se detuvo por falta de tiempo: quedaron ${sinTiempo} segmentos ` +
          `(~${minutos} minutos finales) sin transcribir. Sube la grabación partida en dos ` +
          `archivos para cubrirla completa.]`
      );
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

function splitWithFfmpeg(
  inputPath: string,
  outputPattern: string,
  segmentDuration: number,
  recodificar = false
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
    const ffmpeg = require("fluent-ffmpeg") as typeof import("fluent-ffmpeg");
    ffmpeg.setFfmpegPath(ffmpegPath);

    // Copiar el flujo es instantáneo pero conserva el peso del original;
    // recodificar cuesta CPU y deja segmentos de ~0,36 MB por minuto.
    const codec = recodificar
      ? ["-c:a", "aac", "-b:a", "48k", "-ac", "1", "-ar", "16000"]
      : ["-c", "copy"];

    ffmpeg(inputPath)
      .outputOptions([
        "-f", "segment",
        "-segment_time", String(segmentDuration),
        ...codec,
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
