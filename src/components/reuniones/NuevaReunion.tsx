"use client";

import { Mic, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Header } from "@/components/dashboard/Header";
import {
  Aviso, Boton, CabeceraPieza, Campo, Entrada, Esqueleto, Pagina, Panel, Pieza, Segmentos, Selector, Vacio,
} from "@/components/kit";
import { ErrorApi, crearReunion } from "@/lib/meetings/cliente";
import { aValorLocal, deValorLocal } from "@/lib/meetings/formato";
import { CLAVES_TIPO_REUNION, TIPOS_DE_REUNION, esTipoReunion, tituloSugerido, type TipoReunion } from "@/lib/meetings/tipos";

export type ModoRegistro = "grabar" | "subir";

type Propiedad = { id: string; name: string };

const CSS = `
.re-campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 18px; align-items: start; }
.re-campos .k-fld { margin-bottom: 16px; }
.re-campos .todo { grid-column: 1 / -1; }
.re-modo { margin: 0 0 18px; }
.re-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 4px; }
.re-nota { margin: 0 0 18px; max-width: 64ch; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.re-aviso { margin: 0 0 16px; }
@media (max-width: 720px) { .re-campos { grid-template-columns: minmax(0, 1fr); } }
`;

/** Zona horaria de quien mira: el título dice «12 de octubre» según SU reloj, como el campo de fecha. */
const zonaLocal = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function NuevaReunion({ modoInicial, propiedadInicial }: { modoInicial: ModoRegistro; propiedadInicial?: string }) {
  const router = useRouter();
  const [propiedades, setPropiedades] = useState<Propiedad[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);

  const [modo, setModo] = useState<ModoRegistro>(modoInicial);
  const [propertyId, setPropertyId] = useState(propiedadInicial ?? "");
  const [tipo, setTipo] = useState<TipoReunion>("consejo");
  const [fecha, setFecha] = useState(() => aValorLocal(new Date()));
  const [titulo, setTitulo] = useState("");
  // Mientras la persona no escriba su propio título, sigue al tipo y a la fecha.
  const [tituloEditado, setTituloEditado] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [errorFecha, setErrorFecha] = useState("");
  const [errorEnvio, setErrorEnvio] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/properties")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("propiedades"))))
      .then((data) => {
        if (!vivo) return;
        const lista: Propiedad[] = Array.isArray(data) ? data.map((p: Propiedad) => ({ id: p.id, name: p.name })) : [];
        setPropiedades(lista);
        setPropertyId((actual) => (lista.some((p) => p.id === actual) ? actual : (lista[0]?.id ?? "")));
      })
      .catch(() => {
        if (vivo) setErrorCarga(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const fechaElegida = deValorLocal(fecha);
  const sugerido = tituloSugerido(tipo, fechaElegida ?? new Date(), zonaLocal());
  const tituloMostrado = tituloEditado ? titulo : sugerido;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorEnvio("");
    if (!fechaElegida) {
      setErrorFecha("Escribe una fecha y una hora válidas.");
      return;
    }
    setErrorFecha("");
    setEnviando(true);
    try {
      const reunion = await crearReunion({
        propertyId,
        type: tipo,
        title: tituloMostrado.trim() || undefined,
        date: fechaElegida.toISOString(),
      });
      router.push(`/dashboard/reuniones/${reunion.id}?modo=${modo}`);
    } catch (err) {
      setErrorEnvio(err instanceof ErrorApi ? err.message : "No pudimos crear la reunión. Inténtalo de nuevo.");
      setEnviando(false);
    }
  };

  const cargando = propiedades === null && !errorCarga;

  return (
    <div className="re">
      <style href="k-reuniones-nueva-local" precedence="default">
        {CSS}
      </style>
      <Header title="Nueva reunión" breadcrumbs={[{ label: "Reuniones", href: "/dashboard/reuniones" }]} />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            titulo={modo === "grabar" ? "Grabar una reunión" : "Subir una grabación"}
            subtitulo={
              modo === "grabar"
                ? "Primero los datos de la reunión; en el siguiente paso empiezas a grabar."
                : "Primero los datos de la reunión; en el siguiente paso subes el audio o el video, de cualquier duración."
            }
          />

          {cargando && <Esqueleto variante="bloque" etiquetaAccesible="Cargando tus copropiedades…" />}

          {errorCarga && (
            <Vacio
              titulo="No pudimos cargar tus copropiedades."
              texto="Revisa tu conexión e inténtalo de nuevo."
              acciones={
                <Boton variante="secundario" onClick={() => router.refresh()}>
                  Reintentar
                </Boton>
              }
            />
          )}

          {propiedades !== null && propiedades.length === 0 && (
            <Vacio
              titulo="Aún no tienes copropiedades."
              texto="Las reuniones se guardan por copropiedad. Crea la primera para empezar."
              acciones={
                <Boton href="/dashboard/propiedades" flecha="crea">
                  Agregar copropiedad
                </Boton>
              }
            />
          )}

          {propiedades !== null && propiedades.length > 0 && (
            <form onSubmit={enviar} noValidate>
              <div className="re-modo">
                <Segmentos
                  etiquetaAccesible="Cómo quieres registrar la reunión"
                  valor={modo}
                  alCambiar={(v) => setModo(v as ModoRegistro)}
                  items={[
                    { id: "grabar", etiqueta: "Grabar ahora", icono: Mic, tono: "red" },
                    { id: "subir", etiqueta: "Subir una grabación", icono: Upload, tono: "sky" },
                  ]}
                />
              </div>

              <Panel titulo="Datos de la reunión" nota="podrás cambiarlos después" nivel={2}>
                <div className="re-campos">
                  <Campo id="re-prop" etiqueta="Copropiedad">
                    <Selector id="re-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                      {propiedades.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Selector>
                  </Campo>

                  <Campo id="re-tipo" etiqueta="Tipo de reunión">
                    <Selector
                      id="re-tipo"
                      value={tipo}
                      onChange={(e) => {
                        if (esTipoReunion(e.target.value)) setTipo(e.target.value);
                      }}
                    >
                      {CLAVES_TIPO_REUNION.map((t) => (
                        <option key={t} value={t}>
                          {TIPOS_DE_REUNION[t].nombre}
                        </option>
                      ))}
                    </Selector>
                  </Campo>

                  <Campo
                    id="re-titulo"
                    etiqueta="Título"
                    className="todo"
                    ayuda="Lo proponemos con el tipo y la fecha. Escríbelo si prefieres otro."
                  >
                    <Entrada
                      id="re-titulo"
                      value={tituloMostrado}
                      maxLength={140}
                      onChange={(e) => {
                        setTitulo(e.target.value);
                        setTituloEditado(true);
                      }}
                    />
                  </Campo>

                  <Campo id="re-fecha" etiqueta="Fecha y hora" error={errorFecha || undefined}>
                    <Entrada
                      id="re-fecha"
                      type="datetime-local"
                      value={fecha}
                      onChange={(e) => {
                        setFecha(e.target.value);
                        setErrorFecha("");
                      }}
                    />
                  </Campo>
                </div>

                {errorEnvio && <Aviso enLinea tipo="error" titulo={errorEnvio} className="re-aviso" />}

                <div className="re-pie">
                  <Boton variante="secundario" href="/dashboard/reuniones">
                    Cancelar
                  </Boton>
                  <Boton type="submit" flecha="avanza" cargando={enviando} textoCargando="Creando…" disabled={!propertyId}>
                    Continuar
                  </Boton>
                </div>
              </Panel>
            </form>
          )}
        </Pieza>
      </Pagina>
    </div>
  );
}
