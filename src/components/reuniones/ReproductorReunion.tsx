"use client";

import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Aviso, Boton, BotonIcono, Interruptor, Selector } from "@/components/kit";
import { useEstadoDeAudio } from "@/components/reuniones/useMotorDeAudio";
import { SALTO_MS, VELOCIDADES, esVelocidad, textoDeVelocidad, type Motor } from "@/lib/meetings/motor-audio";
import { formatearReloj, formatearRelojCorto } from "@/lib/meetings/tipos";

const CSS = `
.re-rep { position: sticky; top: calc(var(--cab-h, 56px) + 8px); z-index: 5; display: grid; gap: 8px; margin: 0 0 18px; padding: 10px 14px 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-1); box-shadow: 0 6px 20px rgb(0 0 0 / .07); }
.re-rep-fila { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.re-rep-mando { display: flex; align-items: center; gap: 6px; }
.re-rep-salto { position: relative; }
.re-rep-salto > b { position: absolute; inset: 0; display: grid; place-items: center; padding-top: 1px; font-size: 9.5px; font-weight: 700; letter-spacing: -.02em; color: var(--ink-2); pointer-events: none; }
.re-rep-tiempo { margin-left: auto; font-size: 14px; color: var(--ink-2); font-feature-settings: "tnum" 1; white-space: nowrap; }
.re-rep-tiempo > span { color: var(--ink-3); }
.re-rep-barra { display: block; width: 100%; height: 28px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.re-rep-vel { width: 92px; }
.re-rep-vel .k-in { min-height: 40px; padding-right: 30px; }
.re-rep-seguir { margin-left: auto; }
.re-rep-seguir .k-ctl { min-height: 40px; }
.re-rep-estado { margin: 0; min-height: 0; font-size: 13.5px; color: var(--ink-3); }
.re-rep-estado:empty { display: none; }
.re-rep-corto, .re-rep-corto-sr { display: none; }
@media (max-width: 560px) {
  .re-rep { gap: 4px; padding: 8px 10px 4px; }
  .re-rep-fila { gap: 4px 8px; }
  /* En el teléfono: una fila de mandos (el botón de reproducir solo con su icono) y otra con la hora y «Seguir». */
  .re-rep-mando > .k-btn:not(.k-ic) { min-width: 48px; padding: 0 14px; }
  .re-rep-mando > .k-btn:not(.k-ic) > span { position: absolute !important; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .re-rep-vel { width: 88px; margin-left: auto; }
  .re-rep-tiempo { order: 3; margin-left: 0; flex: 1 1 auto; }
  .re-rep-seguir { order: 4; margin-left: auto; }
  .re-rep-largo { display: none; }
  .re-rep-corto, .re-rep-corto-sr { display: inline; }
  .re-rep-barra { height: 24px; }
}
`;

/**
 * El reproductor de la transcripción: reproducir o pausar, ±15 s, la posición en toda la reunión, la velocidad y si la
 * lectura sigue al audio. Todo es un control nativo (botones, un deslizador y un selector): se usa con Tab y Espacio, y
 * el deslizador dice «0:12:30 de 8:12:00» a los lectores de pantalla.
 */
export function ReproductorReunion({
  motor, duracionMs, seguir, alCambiarSeguir,
}: {
  motor: Motor;
  duracionMs: number;
  seguir: boolean;
  alCambiarSeguir: (v: boolean) => void;
}) {
  const reproduciendo = useEstadoDeAudio(motor, (e) => e.reproduciendo);
  const cargando = useEstadoDeAudio(motor, (e) => e.cargando);
  const tiempoMs = useEstadoDeAudio(motor, (e) => e.tiempoMs);
  const velocidad = useEstadoDeAudio(motor, (e) => e.velocidad);
  const error = useEstadoDeAudio(motor, (e) => e.error);

  // Mientras se arrastra el deslizador se muestra lo arrastrado y se salta UNA vez al soltar (cada salto pide un trozo
  // de audio al servidor: no se pide uno por cada pixel).
  const [arrastre, setArrastre] = useState<number | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const maxSeg = Math.max(1, Math.floor(duracionMs / 1000));
  const posicionSeg = Math.min(maxSeg, Math.floor((arrastre ?? tiempoMs) / 1000));
  const mostradoMs = posicionSeg * 1000;

  const alMover = (segundos: number) => {
    setArrastre(segundos * 1000);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      motor.buscar(segundos * 1000);
      setArrastre(null);
    }, 220);
  };

  return (
    <div className="re-rep" role="group" aria-label="Reproductor de la reunión">
      <style href="k-reuniones-reproductor-local" precedence="default">
        {CSS}
      </style>

      <div className="re-rep-fila">
        <div className="re-rep-mando">
          <BotonIcono etiquetaAccesible="Retroceder 15 segundos" tam={40} className="re-rep-salto" onClick={() => motor.saltar(-SALTO_MS)}>
            <RotateCcw aria-hidden="true" focusable="false" />
            <b aria-hidden="true">15</b>
          </BotonIcono>
          <Boton icono={reproduciendo ? Pause : Play} onClick={() => motor.alternar()}>
            {reproduciendo ? "Pausar" : "Reproducir"}
          </Boton>
          <BotonIcono etiquetaAccesible="Adelantar 15 segundos" tam={40} className="re-rep-salto" onClick={() => motor.saltar(SALTO_MS)}>
            <RotateCw aria-hidden="true" focusable="false" />
            <b aria-hidden="true">15</b>
          </BotonIcono>
        </div>

        <div className="re-rep-vel">
          <Selector
            aria-label="Velocidad de reproducción"
            value={velocidad}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (esVelocidad(v)) motor.fijarVelocidad(v);
            }}
          >
            {VELOCIDADES.map((v) => (
              <option key={v} value={v}>
                {textoDeVelocidad(v)}
              </option>
            ))}
          </Selector>
        </div>

        <div className="re-rep-seguir">
          <Interruptor
            etiqueta={
              <>
                <span className="re-rep-largo">Seguir la lectura</span>
                <span className="re-rep-corto" aria-hidden="true">
                  Seguir
                </span>
                <span className="k-sr re-rep-corto-sr">Seguir la lectura</span>
              </>
            }
            activo={seguir}
            alCambiar={alCambiarSeguir}
          />
        </div>

        <p className="re-rep-tiempo">
          <span className="k-sr">Posición: </span>
          {formatearReloj(mostradoMs)} <span aria-hidden="true">/</span> <span className="k-sr">de </span>
          <span>{formatearReloj(duracionMs)}</span>
        </p>
      </div>

      <input
        className="re-rep-barra"
        type="range"
        min={0}
        max={maxSeg}
        step={1}
        value={posicionSeg}
        aria-label="Posición en la reunión"
        aria-valuetext={`${formatearRelojCorto(mostradoMs)} de ${formatearRelojCorto(duracionMs)}`}
        onChange={(e) => alMover(Number(e.target.value))}
      />

      <p className="re-rep-estado" role="status">
        {cargando && !error ? "Cargando el audio…" : ""}
      </p>
      {error && (
        <Aviso enLinea rol={null} tipo="error" titulo={error} accion={{ etiqueta: "Reintentar", alElegir: () => motor.reintentar() }} />
      )}
    </div>
  );
}
