"use client";

import { CheckCircle2, Sparkles, Square, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useEstadoDeAudio } from "@/components/reuniones/useMotorDeAudio";
import { Aviso, Boton, Campo, Entrada, Esqueleto, Etiqueta, Selector, Vacio, avisar } from "@/components/kit";
import { ErrorApi, crearPersona, guardarHablantes, listarPersonas } from "@/lib/meetings/cliente";
import type { HablanteDTO, PersonaDTO } from "@/lib/meetings/dto";
import type { Motor } from "@/lib/meetings/motor-audio";
import { claveDeNombre } from "@/lib/meetings/nombres";
import {
  OTRA, alElegirPersona, aPedidos, aplicarSugerencia, eleccionInicial, hayCambios, nombreElegido, personasPorCrear, vocesQueSeUniran,
  type EleccionDeVoz,
} from "@/lib/meetings/nombres-pantalla";
import { ROLES_PERSONA, formatearDuracion, nombreRolPersona, type RolPersona } from "@/lib/meetings/tipos";
import { nombreDeHablante } from "@/lib/meetings/transcripcion/presentacion";

const CSS = `
.re-voces { display: grid; gap: 14px; }
.re-voces-nota { margin: 0 0 2px; max-width: 64ch; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.re-voz { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-1); }
.re-voz-cab { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.re-voz-nombre { margin: 0; font-size: 16px; font-weight: 600; color: var(--ink); }
.re-voz-habla { margin: 0; font-size: 14px; color: var(--ink-3); font-feature-settings: "tnum" 1; }
.re-voz-escuchar { margin-left: auto; }
.re-voz-campos { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 12px; }
.re-voz-campos > * { margin: 0; }
.re-voz-libre { grid-column: 1 / -1; }
.re-voz-sug { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; background: var(--surface-2); justify-items: start; }
.re-voz-sug p { margin: 0; font-size: 14.5px; line-height: 1.5; color: var(--ink-2); }
.re-voz-sug strong { font-weight: 600; color: var(--ink); }
.re-voz-sug .ev { font-size: 14px; color: var(--ink-3); }
.re-voz-acc { display: flex; flex-wrap: wrap; gap: 8px; }
.re-voces-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 4px; }
.re-voces-pie p { margin: 0; font-size: 14px; color: var(--ink-3); }
@media (max-width: 640px) { .re-voz-campos { grid-template-columns: minmax(0, 1fr); } }
`;

const mensajeDe = (e: unknown, porDefecto: string) => (e instanceof ErrorApi ? e.message : porDefecto);
const ROLES = Object.entries(ROLES_PERSONA) as Array<[RolPersona, string]>;

/** «Escuchar»: reproduce la muestra de la voz (unos 6 s) con el reproductor de la página; «Detener» mientras suena. */
function BotonEscuchar({ motor, etiqueta, nombre, desdeMs, hastaMs }: { motor: Motor; etiqueta: string; nombre: string; desdeMs: number; hastaMs: number }) {
  const suena = useEstadoDeAudio(motor, (e) => e.tramo?.clave === etiqueta && e.reproduciendo);
  return (
    <span className="re-voz-escuchar">
      <Boton
        variante="secundario"
        tam={40}
        icono={suena ? Square : Volume2}
        tono="slate"
        aria-label={`${suena ? "Detener la muestra de" : "Escuchar una muestra de"} ${nombre}`}
        onClick={() => (suena ? motor.detener() : motor.reproducirTramo(etiqueta, desdeMs, hastaMs))}
      >
        {suena ? "Detener" : "Escuchar"}
      </Boton>
    </span>
  );
}

/** Si el audio no carga al darle «Escuchar», se dice aquí (el reproductor de la transcripción no está a la vista). */
function AvisoDeAudio({ motor }: { motor: Motor }) {
  const error = useEstadoDeAudio(motor, (e) => e.error);
  if (!error) return null;
  return <Aviso enLinea tipo="error" titulo={error} accion={{ etiqueta: "Reintentar", alElegir: () => motor.reintentar() }} />;
}

/**
 * La pestaña «Hablantes»: a cada voz de la reunión se le pone nombre (de las personas de la copropiedad, o una nueva) y rol.
 * La IA solo sugiere —con la evidencia a la vista— y la persona decide. Dos voces con el mismo nombre son la misma persona:
 * al guardar se unen en una sola.
 */
export function TabHablantes({
  meetingId, propertyId, hablantes, alGuardar, motor,
}: {
  meetingId: string;
  propertyId: string;
  hablantes: HablanteDTO[];
  alGuardar: (hablantes: HablanteDTO[]) => void;
  /** El reproductor de la página; null si la reunión ya no tiene audio (no hay «Escuchar»). */
  motor: Motor | null;
}) {
  const [personas, setPersonas] = useState<PersonaDTO[] | null>(null);
  const [errorPersonas, setErrorPersonas] = useState("");
  const [elecciones, setElecciones] = useState<Record<string, EleccionDeVoz>>({});
  const [inicial, setInicial] = useState<Record<string, EleccionDeVoz>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    listarPersonas(propertyId)
      .then((p) => vivo && setPersonas(p))
      .catch((e) => {
        if (!vivo) return;
        setErrorPersonas(mensajeDe(e, "No pudimos cargar las personas de la copropiedad."));
        setPersonas([]); // se puede seguir poniendo nombres escritos a mano
      });
    return () => {
      vivo = false;
    };
  }, [propertyId]);

  // Cada vez que llegan voces nuevas (al abrir o tras guardar), el formulario parte de lo guardado.
  useEffect(() => {
    if (!personas) return;
    const nuevas = Object.fromEntries(hablantes.map((h) => [h.label, eleccionInicial(h, personas)]));
    setElecciones(nuevas);
    setInicial(nuevas);
  }, [hablantes, personas]);

  const lista = useMemo(() => personas ?? [], [personas]);
  const total = useMemo(() => hablantes.reduce((s, h) => s + h.talkMs, 0), [hablantes]);
  const unidas = useMemo(() => vocesQueSeUniran(elecciones, lista), [elecciones, lista]);
  const sucio = hayCambios(inicial, elecciones);
  const cambiar = (label: string, cambio: (e: EleccionDeVoz) => EleccionDeVoz) => setElecciones((s) => ({ ...s, [label]: cambio(s[label]) }));

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      // Las personas nuevas («Otra persona…») se crean primero, para guardar la voz ya con su persona.
      const creadas = new Map<string, string>();
      for (const p of personasPorCrear(elecciones, lista)) {
        const nueva = await crearPersona(propertyId, p);
        creadas.set(claveDeNombre(nueva.name), nueva.id);
      }
      const previas = hablantes.length;
      const nuevas = await guardarHablantes(meetingId, aPedidos(elecciones, lista, creadas));
      alGuardar(nuevas);
      if (creadas.size > 0) void listarPersonas(propertyId).then(setPersonas).catch(() => {});
      const unidasN = previas - nuevas.length;
      avisar({ tipo: "ok", titulo: unidasN > 0 ? `Nombres guardados. Unimos ${unidasN} ${unidasN === 1 ? "voz" : "voces"} con el mismo nombre.` : "Nombres guardados." });
    } catch (e) {
      setError(mensajeDe(e, "No pudimos guardar los nombres. Inténtalo de nuevo."));
    } finally {
      setGuardando(false);
    }
  };

  if (personas === null) return <Esqueleto variante="bloque" etiquetaAccesible="Cargando las voces…" />;
  if (hablantes.length === 0) return <Vacio titulo="No se detectaron voces en esta reunión." texto="Cuando la transcripción tenga intervenciones, aquí podrás ponerle nombre a cada voz." />;

  return (
    <div className="re-voces">
      <style href="k-reuniones-hablantes-local" precedence="default">
        {CSS}
      </style>
      <p className="re-voces-nota">
        La transcripción separa las voces pero no sabe cómo se llama cada una. Ponles nombre: se usa en la transcripción, el resumen y el acta. Si dos voces son la misma persona, dales el mismo nombre y se unen.
      </p>

      {errorPersonas && <Aviso enLinea rol={null} tipo="aviso" titulo={errorPersonas} texto="Puedes escribir los nombres a mano con «Otra persona…»." />}
      {motor && <AvisoDeAudio motor={motor} />}

      {hablantes.map((h) => {
        const el = elecciones[h.label];
        if (!el) return null;
        const nombre = nombreDeHablante(h.label, {});
        const porcentaje = total > 0 ? Math.round((h.talkMs / total) * 100) : 0;
        const sug = h.suggestion;
        const sugerida = sug?.nombre ? aplicarSugerencia(h, lista) : null;
        const yaAplicada = sugerida ? nombreElegido(sugerida, lista) === nombreElegido(el, lista) : false;
        const otra = sug?.igualA ? elecciones[sug.igualA] : undefined;
        const nombreDeLaOtra = otra ? nombreElegido(otra, lista) : "";
        return (
          <section key={h.label} className="re-voz" aria-labelledby={`re-voz-${h.label}`}>
            <div className="re-voz-cab">
              <h3 id={`re-voz-${h.label}`} className="re-voz-nombre">
                {nombre}
              </h3>
              <p className="re-voz-habla">
                {porcentaje} % de la palabra · {formatearDuracion(h.talkMs)}
              </p>
              {h.confirmed && (
                <Etiqueta icono={CheckCircle2} tono="green">
                  Con nombre
                </Etiqueta>
              )}
              {motor && h.sampleStartMs !== null && h.sampleEndMs !== null && h.sampleEndMs > h.sampleStartMs && (
                <BotonEscuchar motor={motor} etiqueta={h.label} nombre={nombre} desdeMs={h.sampleStartMs} hastaMs={h.sampleEndMs} />
              )}
            </div>

            <div className="re-voz-campos">
              <Campo id={`re-n-${h.label}`} etiqueta={`Nombre de ${nombre}`}>
                <Selector id={`re-n-${h.label}`} value={el.persona} onChange={(e) => cambiar(h.label, (x) => alElegirPersona(e.target.value, x, lista))}>
                  <option value="">Sin nombre</option>
                  {lista.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.role ? ` · ${nombreRolPersona(p.role)}` : ""}
                    </option>
                  ))}
                  <option value={OTRA}>Otra persona…</option>
                </Selector>
              </Campo>
              <Campo id={`re-r-${h.label}`} etiqueta="Rol" opcional>
                <Selector id={`re-r-${h.label}`} value={el.rol} disabled={el.persona === ""} onChange={(e) => cambiar(h.label, (x) => ({ ...x, rol: e.target.value as EleccionDeVoz["rol"] }))}>
                  <option value="">Sin rol</option>
                  {ROLES.map(([clave, texto]) => (
                    <option key={clave} value={clave}>
                      {texto}
                    </option>
                  ))}
                </Selector>
              </Campo>
              {el.persona === OTRA && (
                <Campo id={`re-l-${h.label}`} etiqueta="Nombre de la persona" className="re-voz-libre">
                  <Entrada id={`re-l-${h.label}`} value={el.libre} maxLength={100} placeholder="Nombre y apellido" onChange={(e) => cambiar(h.label, (x) => ({ ...x, libre: e.target.value }))} />
                </Campo>
              )}
            </div>

            {sug && sug.nombre && sugerida && !yaAplicada && (
              <div className="re-voz-sug">
                <Etiqueta icono={Sparkles} tono="ai">
                  Sugerencia de la IA
                </Etiqueta>
                <p>
                  Puede ser <strong>{sug.nombre}</strong>
                  {sug.rol ? ` (${sug.rol})` : ""}
                  {sug.confianza ? ` · confianza ${sug.confianza}` : ""}.
                </p>
                <p className="ev">{sug.evidencia}</p>
                <div className="re-voz-acc">
                  <Boton variante="secundario" tam={40} icono={CheckCircle2} tono="green" onClick={() => cambiar(h.label, () => sugerida)}>
                    Usar este nombre
                  </Boton>
                </div>
              </div>
            )}

            {sug?.igualA && nombreDeLaOtra && nombreElegido(el, lista) !== nombreDeLaOtra && (
              <div className="re-voz-sug">
                <Etiqueta icono={Sparkles} tono="ai">
                  Sugerencia de la IA
                </Etiqueta>
                <p>
                  Puede ser la misma persona que <strong>{nombreDeHablante(sug.igualA, {})}</strong> ({nombreDeLaOtra}).
                </p>
                {!sug.nombre && <p className="ev">{sug.evidencia}</p>}
                <div className="re-voz-acc">
                  <Boton variante="secundario" tam={40} onClick={() => cambiar(h.label, () => ({ ...(otra as EleccionDeVoz) }))}>
                    Unir con {nombreDeHablante(sug.igualA, {})}
                  </Boton>
                </div>
              </div>
            )}
          </section>
        );
      })}

      {unidas.length > 0 && (
        <Aviso
          enLinea
          rol={null}
          tipo="info"
          titulo={unidas.length === 1 ? "Se unirán dos o más voces." : "Se unirán varias voces."}
          texto={`${unidas.map((g) => g.map((l) => nombreDeHablante(l, {})).join(" y ")).join("; ")} tienen el mismo nombre: al guardar quedan como una sola voz, con todas sus intervenciones.`}
        />
      )}
      {error && <Aviso enLinea tipo="error" titulo={error} />}

      <div className="re-voces-pie">
        <Boton cargando={guardando} textoCargando="Guardando…" disabled={!sucio || guardando} onClick={() => void guardar()}>
          Guardar nombres
        </Boton>
        {!sucio && <p>No hay cambios por guardar.</p>}
      </div>
    </div>
  );
}
