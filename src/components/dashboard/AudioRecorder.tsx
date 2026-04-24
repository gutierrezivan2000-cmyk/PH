"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";

interface AudioRecorderProps {
  onRecorded: (file: File) => void;
  disabled?: boolean;
  maxSeconds?: number;
}

export function AudioRecorder({ onRecorded, disabled, maxSeconds = 300 }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => cleanupStream(), []);

  const pickMimeType = (): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
        return m;
      }
    }
    return "audio/webm";
  };

  const extFor = (mime: string): string => {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4")) return "m4a";
    return "webm";
  };

  const startRecording = async () => {
    setError(null);
    cancelledRef.current = false;
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("Tu navegador no soporta grabacion de audio.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const wasCancelled = cancelledRef.current;
        cleanupStream();
        setIsRecording(false);
        setSeconds(0);
        if (wasCancelled) {
          chunksRef.current = [];
          return;
        }
        if (chunksRef.current.length === 0) return;
        // Strip codec suffix (e.g. "audio/webm;codecs=opus" -> "audio/webm") so
        // Vercel Blob allowed-content-types check matches exactly.
        const cleanType = mimeType.split(";")[0];
        const blob = new Blob(chunksRef.current, { type: cleanType });
        const file = new File([blob], `audio-${Date.now()}.${extFor(cleanType)}`, {
          type: cleanType,
        });
        chunksRef.current = [];
        if (file.size > 0) onRecorded(file);
      };

      mr.start();
      setIsRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= maxSeconds) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
        setError("Permiso de microfono denegado.");
      } else {
        setError("No se pudo acceder al microfono.");
      }
      cleanupStream();
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    stopRecording();
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={cancelRecording}
          className="p-2.5 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex-shrink-0"
          title="Cancelar"
          type="button"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </button>
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-xs font-medium text-red-700 dark:text-red-300 tabular-nums">
            Grabando {formatTime(seconds)}
          </span>
        </div>
        <button
          onClick={stopRecording}
          className="p-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors flex-shrink-0 shadow-md"
          title="Enviar"
          type="button"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={startRecording}
        disabled={disabled}
        className="p-2.5 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Grabar audio"
        type="button"
      >
        <Mic className="h-4 w-4 text-gray-500" />
      </button>
      {error && (
        <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-red-500 text-white text-[10px] rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
