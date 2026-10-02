"use client";

import { ChevronsDown, Download, Flag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Boton, ErrorCarga, Esqueleto, Vacio } from "@/components/kit";
import { ErrorApi, listarIntervenciones, urlDeTranscripcion } from "@/lib/meetings/cliente";
import type { IntervencionDTO, MarcadorDTO, RangoMs } from "@/lib/meetings/dto";
import { formatearReloj } from "@/lib/meetings/tipos";
import {
  construirLinea, nombreDeHablante, textoDeMarca, textoDeSilencio,
} from "@/lib/meetings/transcripcion/presentacion";

const CSS = `
.re-visor { display: grid; gap: 4px; }
.re-visor-barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; margin: 0 0 4px; }
.re-visor-nota { margin: 0; font-size: 14.5px; color: var(--ink-3); }
.re-hora { margin-top: 18px; }
.re-hora-t { display: flex; align-items: baseline; gap: 10px; margin: 0 0 4px; padding: 0 0 8px; border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 600; color: var(--ink); }
.re-hora-t span { font-size: 13px; font-weight: 500; color: var(--ink-3); font-feature-settings: "tnum" 1; }
.re-lista { list-style: none; margin: 0; padding: 0; }
.re-int { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 2px 14px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.re-int:last-child { border-bottom: 0; }
.re-reloj { padding-top: 1px; font-size: 13px; color: var(--ink-3); font-feature-settings: "tnum" 1; }
.re-quien { margin: 0 0 2px; font-size: 14.5px; font-weight: 600; color: var(--ink); }
.re-sin-nombre { font-weight: 500; color: var(--ink-2); }
.re-texto { margin: 0; max-width: 72ch; font-size: 15.5px; line-height: 1.55; color: var(--ink-2); overflow-wrap: anywhere; }
.re-aparte { display: flex; align-items: center; gap: 10px; margin: 8px 0; font-size: 14px; color: var(--ink-3); }
.re-silencio { gap: 14px; justify-content: center; }
.re-silencio::before, .re-silencio::after { content: ""; flex: 1 1 24px; max-width: 120px; border-top: 1px dashed var(--line); }
.re-marca { padding: 8px 12px; border-radius: 10px; background: var(--surface-2); color: var(--ink-2); }
.re-marca svg { flex: none; width: 16px; height: 16px; color: var(--ink-3); }
.re-mas { display: flex; justify-content: center; padding: 20px 0 4px; }
.re-fin { margin: 18px 0 0; text-align: center; font-size: 14px; color: var(--ink-3); }
@media (max-width: 560px) {
  .re-int { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .re-reloj { padding: 0 0 2px; }
}
`;

/** «PT1H23M45S»: lo que espera el atributo `dateTime` de <time>. */
const duracionIso = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `PT${Math.floor(total / 3600)}H${Math.floor((total % 3600) / 60)}M${total % 60}S`;
};

const mensajeDe = (e: unknown) => (e instanceof ErrorApi ? e.message : "Revisa tu conexión e inténtalo de nuevo.");

/**
 * La transcripción completa de una reunión lista: las intervenciones por hora, con el nombre de quien habla, las marcas
 * de la grabación y los silencios largos en su minuto. Se carga por bloques de 30 minutos para que una reunión de 8 horas
 * abra al instante. (El reproductor, la búsqueda y los saltos al minuto llegan en el hito siguiente.)
 */
export function VisorTranscripcion({ meetingId, marcas, silencios }: { meetingId: string; marcas: MarcadorDTO[]; silencios: RangoMs[] }) {
  const [items, setItems] = useState<IntervencionDTO[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [siguiente, setSiguiente] = useState<number | null>(null);
  const [fase, setFase] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState("");
  const [cargandoMas, setCargandoMas] = useState(false);
  const [errorMas, setErrorMas] = useState("");
  const [intento, setIntento] = useState(0);
  /** Cambia cada vez que se vuelve a empezar (otra reunión, «Reintentar»): así se ignora lo que responda una petición vieja. */
  const generacion = useRef(0);

  useEffect(() => {
    const mia = ++generacion.current;
    let vivo = true;
    listarIntervenciones(meetingId, { desdeMs: 0 })
      .then((p) => {
        if (!vivo || generacion.current !== mia) return;
        setItems(p.items);
        setNombres(p.nombres);
        setSiguiente(p.siguienteMs);
        setError("");
        setFase("listo");
      })
      .catch((e) => {
        if (!vivo || generacion.current !== mia) return;
        setError(mensajeDe(e));
        setFase("error");
      });
    return () => {
      vivo = false;
    };
  }, [meetingId, intento]);

  const cargarMas = useCallback(async () => {
    if (siguiente === null || cargandoMas) return;
    const mia = generacion.current;
    setCargandoMas(true);
    setErrorMas("");
    try {
      const p = await listarIntervenciones(meetingId, { desdeMs: siguiente });
      if (generacion.current !== mia) return;
      setItems((previas) => [...previas, ...p.items]);
      setNombres(p.nombres);
      setSiguiente(p.siguienteMs);
    } catch (e) {
      if (generacion.current === mia) setErrorMas(mensajeDe(e));
    } finally {
      if (generacion.current === mia) setCargandoMas(false);
    }
  }, [meetingId, siguiente, cargandoMas]);

  const grupos = useMemo(
    () => construirLinea({ intervenciones: items, silencios, marcas, cargadoHastaMs: siguiente }),
    [items, silencios, marcas, siguiente],
  );

  return (
    <div className="re-visor">
      <style href="k-reuniones-visor-local" precedence="default">
        {CSS}
      </style>

      {fase === "cargando" && <Esqueleto variante="bloque" etiquetaAccesible="Cargando la transcripción…" />}

      {fase === "error" && (
        <ErrorCarga
          titulo="No pudimos cargar la transcripción."
          texto={error}
          acciones={
            <Boton
              variante="secundario"
              onClick={() => {
                setFase("cargando");
                setIntento((n) => n + 1);
              }}
            >
              Reintentar
            </Boton>
          }
        />
      )}

      {fase === "listo" && (
        <>
          <div className="re-visor-barra">
            <p className="re-visor-nota">Con quién habla y en qué minuto, de principio a fin.</p>
            <Boton variante="secundario" icono={Download} href={urlDeTranscripcion(meetingId)} descargar>
              Descargar transcripción
            </Boton>
          </div>

          {grupos.length === 0 ? (
            <Vacio titulo="No se detectó voz en esta grabación." texto="Si esperabas escuchar a alguien, revisa que el micrófono estuviera encendido y vuelve a subir el audio." />
          ) : (
            grupos.map((g) => (
              <section key={g.hora} className="re-hora" aria-labelledby={`re-hora-${g.hora}`}>
                <h3 id={`re-hora-${g.hora}`} className="re-hora-t">
                  Hora {g.hora + 1}
                  <span>{g.rango} h</span>
                </h3>
                <ol className="re-lista">
                  {g.entradas.map((e) => {
                    if (e.tipo === "silencio") {
                      return (
                        <li key={e.clave} className="re-aparte re-silencio">
                          {textoDeSilencio(e.rango)}
                        </li>
                      );
                    }
                    if (e.tipo === "marca") {
                      return (
                        <li key={e.clave} className="re-aparte re-marca">
                          <Flag aria-hidden="true" focusable="false" />
                          <span>
                            <span className="k-sr">Marca de la grabación: </span>
                            {textoDeMarca(e.marca)}
                          </span>
                        </li>
                      );
                    }
                    const i = e.intervencion;
                    const nombre = nombreDeHablante(i.speaker, nombres);
                    return (
                      <li key={e.clave} className="re-int">
                        <time className="re-reloj" dateTime={duracionIso(i.startMs)}>
                          {formatearReloj(i.startMs)}
                        </time>
                        <div>
                          <p className={nombres[i.speaker]?.trim() ? "re-quien" : "re-quien re-sin-nombre"}>{nombre}</p>
                          <p className="re-texto">{i.text}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}

          {errorMas && <Aviso enLinea tipo="error" titulo="No pudimos cargar el siguiente bloque." texto={errorMas} />}

          {siguiente !== null ? (
            <div className="re-mas">
              <Boton variante="secundario" icono={ChevronsDown} tono="slate" cargando={cargandoMas} textoCargando="Cargando…" onClick={() => void cargarMas()}>
                Cargar los siguientes 30 min
              </Boton>
            </div>
          ) : (
            grupos.length > 0 && <p className="re-fin">Aquí termina la transcripción.</p>
          )}
        </>
      )}
    </div>
  );
}
