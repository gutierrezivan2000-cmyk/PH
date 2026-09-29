"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/kit";

/* Estilos locales («Índice»): la grabadora vive en la fila de herramientas del
   redactor del chat (`.k-redactor .herr`), cuyos botones ya son de texto a 40 px
   (44 en móvil). Aquí solo el estado «grabando»: cuadro de tinta + tiempo con
   cifras tabulares + onda en --ink. Nada de rojo: el naranja del sistema solo
   significa vencido, error u hoy. */
const CSS_GRABADORA = `
.grab { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.grab-vivo { display: inline-flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 12px;
  border: 1.5px solid var(--rule); font-size: 14px; font-weight: 700; color: var(--ink); }
.grab-vivo > i { width: 10px; height: 10px; flex: none; background: var(--ink); }
.grab-vivo canvas { width: 88px; height: 20px; color: var(--ink); }
.grab-vivo time { font: 600 14px/1 var(--f-mono); font-feature-settings: "tnum" 1; }
.grab-btn { display: inline-flex; align-items: center; min-height: 40px; padding: 0; font-size: 14px; font-weight: 700;
  color: var(--ink); background: transparent; cursor: pointer; }
.grab-btn:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.grab-btn:disabled { color: var(--ink-3); cursor: not-allowed; text-decoration: none; }
@media (prefers-reduced-motion: no-preference) {
  .grab-vivo > i { animation: grab-pulso 1.2s ease-in-out infinite alternate; }
}
@keyframes grab-pulso { to { opacity: .35; } }
@media (max-width: 860px) { .grab-vivo, .grab-btn { min-height: 44px; } }
`;

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

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopWaveform = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
  };

  const cleanupStream = () => {
    stopWaveform();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => cleanupStream(), []);

  const startWaveform = (stream: MediaStream) => {
    type WindowWithWebkitAC = Window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowWithWebkitAC;
    const ACtor: typeof AudioContext | undefined = window.AudioContext ?? w.webkitAudioContext;
    if (!ACtor) return;
    const ctx = new ACtor();
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    analyserRef.current = analyser;
    source.connect(analyser);

    const draw = () => {
      const canvas = canvasRef.current;
      const a = analyserRef.current;
      if (!canvas || !a) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
        canvas.width = cssWidth * dpr;
        canvas.height = cssHeight * dpr;
      }
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, cssWidth, cssHeight);

      const buf = new Uint8Array(a.frequencyBinCount);
      a.getByteTimeDomainData(buf);

      const bars = 24;
      const samplesPerBar = Math.max(1, Math.floor(buf.length / bars));
      const gap = 2;
      const barWidth = Math.max(1, (cssWidth - gap * (bars - 1)) / bars);
      const mid = cssHeight / 2;

      // La onda toma la tinta del tema (color del lienzo = var(--ink)).
      ctx2d.fillStyle = getComputedStyle(canvas).color;
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < samplesPerBar; j++) {
          const v = (buf[i * samplesPerBar + j] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / samplesPerBar);
        const h = Math.max(2, Math.min(cssHeight, rms * cssHeight * 4));
        const x = i * (barWidth + gap);
        ctx2d.fillRect(x, mid - h / 2, barWidth, h);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
  };

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
        setError("Tu navegador no soporta grabación de audio.");
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
      try { startWaveform(stream); } catch (waveErr) { console.warn("waveform start failed:", waveErr); }

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
        setError("Permiso de micrófono denegado.");
      } else {
        setError("No se pudo acceder al micrófono.");
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

  const estilos = (
    <style href="grabadora-audio" precedence="default">
      {CSS_GRABADORA}
    </style>
  );

  if (isRecording) {
    return (
      <span className="grab" role="group" aria-label="Grabación de audio">
        {estilos}
        <span className="grab-vivo">
          <i aria-hidden="true" />
          Grabando
          <canvas ref={canvasRef} aria-hidden="true" />
          <time>{formatTime(seconds)}</time>
        </span>
        <Boton variante="fantasma" tam={40} onClick={cancelRecording}>
          Cancelar
        </Boton>
        <Boton variante="secundario" tam={40} onClick={stopRecording} aria-label="Terminar la grabación y adjuntarla">
          Terminar
        </Boton>
      </span>
    );
  }

  return (
    <span className="grab">
      {estilos}
      <button
        onClick={startRecording}
        disabled={disabled}
        className="grab-btn"
        title="Grabar una nota de voz"
        type="button"
      >
        Grabar audio
      </button>
      {error && (
        <span className="k-err" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
