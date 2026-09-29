"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { upload as blobUpload } from "@vercel/blob/client";
import { Header } from "@/components/dashboard/Header";
import { iniciales } from "@/components/dashboard/Sidebar";
import { abrirSoporte, useSoporteDisponible } from "@/components/dashboard/soporte";
import {
  Aviso,
  AreaTexto,
  Boton,
  BotonFila,
  CabeceraPieza,
  Campo,
  Categoria,
  Entrada,
  Esqueleto,
  Estado,
  GrupoCampos,
  Pagina,
  Panel,
  Pieza,
  Seccion,
  Segmentos,
  Selector,
  SelectorTema,
  Tabla,
  Vacio,
  ZonaSubida,
  avisar,
  type TipoEstado,
} from "@/components/kit";

// Solo si está configurado: sin la variable no hay un número real al que escribir
// (antes caía a «wa.me/message/PLACEHOLDER»). Mismo criterio que el colofón de Inicio.
const WHATSAPP_LINK = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_URL;

interface Profile {
  name: string;
  email: string;
  image: string;
  cargo: string;
  phone: string;
  company: string;
  city: string;
  logoUrl?: string;
  brandColor?: string;
  /** GET /api/profile responde { error: true, … } con 500 si falla la base de datos. */
  error?: boolean;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  category: string;
  priority: string;
  updatedAt: string;
  _count?: { messages: number };
}

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  pending: "Pendiente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

/*
 * Estado = forma + palabra (SPEC §f.8). Significado real, de las rutas de la API:
 * «open» espera al equipo (ticket nuevo o el usuario respondió), «pending» = el
 * equipo respondió y espera al usuario (api/admin/tickets/[id]/messages),
 * «resolved» y «closed» ya no admiten respuestas (api/tickets/[id]/messages).
 */
const STATUS_TIPO: Record<string, TipoEstado> = {
  open: "pendiente",
  pending: "falta",
  resolved: "ok",
  closed: "sin",
};

const STATUS_AYUDA: Array<[string, string]> = [
  ["open", "Lo recibimos y espera respuesta del equipo."],
  ["pending", "El equipo respondió: te toca contestar."],
  ["resolved", "Solucionado. Ya no admite respuestas."],
  ["closed", "Cerrado. Ya no admite respuestas."],
];

// Valores que admite POST /api/tickets (validCategories / validPriorities).
const CATEGORIAS: Array<{ id: string; etiqueta: string }> = [
  { id: "general", etiqueta: "General" },
  { id: "billing", etiqueta: "Facturación" },
  { id: "technical", etiqueta: "Técnico" },
  { id: "feature", etiqueta: "Función" },
  { id: "bug", etiqueta: "Error" },
];
const PRIORIDADES: Array<{ id: string; etiqueta: string }> = [
  { id: "low", etiqueta: "Baja" },
  { id: "normal", etiqueta: "Normal" },
  { id: "high", etiqueta: "Alta" },
];
const NOMBRE_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.etiqueta]));
const NOMBRE_PRIORIDAD = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.etiqueta.toLowerCase()]));

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NB = " ";

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}${NB}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}${NB}h`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? `Hace 1${NB}día` : `Hace ${days}${NB}días`;
}

/** «18 sep» (con el año si no es el actual). */
function fechaCorta(date: string): string {
  const d = new Date(date);
  const base = `${d.getDate()}${NB}${MESES[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"];

/* Estilos locales de la pantalla (prefijo cfg-). Solo tokens; los tamaños siguen el SPEC. */
const CSS_CONFIGURACION = `
.cfg-aviso { margin: 0 0 32px; }
.cfg-dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--g); }
.cfg-cuenta { display: flex; gap: 16px; align-items: center; min-width: 0; }
.cfg-cuenta > .a { width: 56px; height: 56px; flex: none; display: grid; place-items: center; background: var(--surface-3);
  font: 700 20px/1 var(--f-sans); }
.cfg-cuenta > div { min-width: 0; }
.cfg-cuenta b { display: block; font-size: 18px; font-weight: 650; line-height: 1.2; overflow-wrap: anywhere; }
.cfg-cuenta .k-mono { display: block; margin-top: 4px; font-size: 14px; line-height: 1.3; color: var(--ink-2); overflow-wrap: anywhere; }
.cfg-nota { margin: 14px 0 0; font-size: 14px; line-height: 1.4; color: var(--ink-3); max-width: 46ch; }
.cfg-lista { list-style: none; margin: 0; padding: 0; }
.cfg-lista > li { display: grid; gap: 4px; padding: 11px 0; border-top: 1px solid var(--line); }
.cfg-lista > li:first-child { border-top: 0; padding-top: 0; }
.cfg-lista .k-apoyo { margin: 0; }

.cfg-logo-acc { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: 12px; }
.cfg-logo-acc .k-err, .cfg-logo-acc .k-estado { margin: 0; }
.cfg-color { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.cfg-color input[type="color"] { width: 48px; height: 48px; flex: none; padding: 4px; border: 1.5px solid var(--rule);
  border-radius: 0; background: var(--surface-0); cursor: pointer; }
.cfg-color input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
.cfg-color input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 0; }
.cfg-color input[type="color"]::-moz-color-swatch { border: 0; border-radius: 0; }
.cfg-color .k-in { flex: none; width: 10em; font-family: var(--f-mono); }
/* Sin color válido la muestra va achurada: no aparenta un color ya elegido. */
.cfg-muestra { position: relative; display: inline-flex; flex: none; }
.cfg-muestra.vacia::after { content: ""; position: absolute; inset: 4px; pointer-events: none;
  background: repeating-linear-gradient(45deg, var(--ink-4) 0 1.5px, var(--surface-1) 1.5px 7px); }

.cfg-prev { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cfg-lam { margin: 0; min-width: 0; }
.cfg-lam > div { position: relative; display: grid; place-items: center; min-height: 128px; padding: 24px 14px 18px;
  border: 2px solid var(--rule); overflow: hidden; }
/* Superficies reales, fijas en ambos temas: el PDF es papel blanco y el portal
   pinta la cabecera con el color de marca y texto blanco. */
.cfg-lam.papel > div { background: #fff; color: #4b5563; }
.cfg-lam.portal > div { color: #fff; }
.cfg-lam .emp.pdf { font-size: 13px; font-weight: 600; letter-spacing: .04em; }
.cfg-lam > div > i { position: absolute; left: 0; right: 0; top: 0; height: 6px; }
.cfg-lam img { display: block; max-width: 80%; max-height: 56px; object-fit: contain; }
.cfg-lam .emp { font-size: 16px; font-weight: 700; line-height: 1.2; text-align: center; text-wrap: balance; overflow-wrap: break-word; hyphens: auto; }
.cfg-lam .nada { width: 64%; height: 32px; border: 1.5px dashed currentColor; }
.cfg-lam figcaption { margin-top: 8px; font-size: 14px; line-height: 1.3; color: var(--ink-3); }

.cfg-guardar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 8px; padding-top: 16px;
  border-top: 1px solid var(--line-strong); }
.cfg-guardar > p { margin: 0; }
.cfg-guardar > .k-err { flex-basis: 100%; }

.cfg-tema { max-width: 480px; }
.cfg-ticket { margin-bottom: 32px; }
.cfg-ticket .k-btns { margin-top: 4px; }
.cfg-ticket .k-aviso { margin-bottom: 16px; }
.cfg-tickets .cfg-fecha > span { display: block; }
.cfg-canales { margin-top: 32px; }
.cfg-canales .k-btns { margin-top: 12px; }

@media (max-width: 860px) {
  .cfg-dos { grid-template-columns: minmax(0, 1fr); }
  .cfg-aside { margin-top: 16px; }
  /* Fichas de tickets sin columna de identificador: el asunto ocupa todo el ancho. */
  .cfg-tickets .k-tr { grid-template-columns: 0 minmax(0, 1fr); column-gap: 0; }
  .cfg-tickets .cfg-fecha > span { display: inline; }
  .cfg-tickets .cfg-fecha > span + span::before { content: " · "; }
  .cfg-color .k-in { flex: 1 1 8em; width: auto; }
}
`;

export default function ConfiguracionPage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [cargo, setCargo] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  // Document branding
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Tickets section
  const [tickets, setTickets] = useState<Ticket[]>([]);
  // Empieza en true: la carga arranca al montar, y hasta que responde no se
  // puede afirmar que no hay tickets.
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketCategory, setTicketCategory] = useState("general");
  const [ticketPriority, setTicketPriority] = useState("normal");
  const [ticketContent, setTicketContent] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSuccess, setTicketSuccess] = useState(false);

  // Solo presentación: dónde mostrar `saveError` (lo activan tanto guardar como subir
  // el logo), nombre del logo que se está subiendo, formato rechazado al soltar y
  // si el campo de color ya perdió el foco (para no marcar error mientras se escribe).
  // Dónde se pinta el error de guardado: junto al botón que se pulsó (perfil o marca) o al logo.
  const [errorEn, setErrorEn] = useState<"guardar" | "guardar-perfil" | "logo">("guardar");
  const [logoNombre, setLogoNombre] = useState("");
  const [logoFormato, setLogoFormato] = useState(false);
  const [colorTocado, setColorTocado] = useState(false);
  const soporteDisponible = useSoporteDisponible();

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setName(data.name || "");
        setCargo(data.cargo || "");
        setCompany(data.company || "");
        setPhone(data.phone || "");
        setCity(data.city || "");
        setLogoUrl(data.logoUrl || "");
        setBrandColor(data.brandColor || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadTickets = useCallback(() => {
    setTicketsLoading(true);
    fetch("/api/tickets")
      .then((r) => r.json())
      .then((data) => setTickets(data.tickets || []))
      .catch(console.error)
      .finally(() => setTicketsLoading(false));
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cargo, company, phone, city, logoUrl, brandColor }),
      });
      if (!res.ok) {
        // Don't show a green "Saved!" when the server rejected the change.
        setSaveError(true);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const result = await blobUpload(`branding/logo-${Date.now()}-${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload/token",
        contentType: file.type || "image/png",
      });
      setLogoUrl(result.url);
    } catch {
      setSaveError(true);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleTicketSubmit = async () => {
    if (!ticketSubject.trim() || !ticketContent.trim()) return;
    setTicketSubmitting(true);
    setTicketError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: ticketSubject.trim(),
          category: ticketCategory,
          priority: ticketPriority,
          content: ticketContent.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al crear el ticket");
      }
      setTicketSubject("");
      setTicketCategory("general");
      setTicketPriority("normal");
      setTicketContent("");
      setShowTicketForm(false);
      volverFocoANuevoTicket();
      setTicketSuccess(true);
      setTimeout(() => setTicketSuccess(false), 4000);
      loadTickets();
    } catch (e) {
      setTicketError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setTicketSubmitting(false);
    }
  };

  // Resultado de una acción → aviso (KIT §5.4). Los estados `saved` y `ticketSuccess`
  // siguen siendo los de siempre; aquí solo se anuncian.
  useEffect(() => {
    if (saved) avisar({ tipo: "ok", titulo: "Cambios guardados." });
  }, [saved]);
  useEffect(() => {
    if (ticketSuccess) avisar({ tipo: "ok", titulo: "Ticket creado.", texto: "Nuestro equipo te responderá pronto." });
  }, [ticketSuccess]);

  const guardar = (origen: "guardar" | "guardar-perfil" = "guardar") => {
    // PUT /api/profile descarta en silencio un color inválido: si se enviara,
    // la pantalla diría «Cambios guardados» sin haberlo guardado.
    if (brandColor.trim() && !HEX.test(brandColor.trim())) {
      setColorTocado(true);
      document.getElementById("cfg-color")?.focus();
      return;
    }
    setErrorEn(origen);
    void handleSave();
  };

  // La zona acepta arrastrar y soltar: se filtra por los mismos tipos que el `accept`
  // del selector de archivos (el servidor admite más, p. ej. PDF, que no sirven de logo).
  const elegirLogo = (archivos: File[]) => {
    const f = archivos[0];
    if (!f) return;
    if (!TIPOS_LOGO.includes(f.type)) {
      setLogoFormato(true);
      return;
    }
    setLogoFormato(false);
    setErrorEn("logo");
    setSaveError(false);
    setLogoNombre(f.name);
    void handleLogoUpload(f);
  };

  // Al desmontarse el formulario el foco caía en <body>: se devuelve a «Nuevo ticket».
  const volverFocoANuevoTicket = () =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-nuevo-ticket]")?.focus());
  const cerrarFormulario = () => {
    setShowTicketForm(false);
    setTicketError(null);
    volverFocoANuevoTicket();
  };

  // Valores guardados con el texto de antes (sin tildes) se conservan: solo cambia la etiqueta.
  const cargos: Array<[string, string]> = [
    ["Administrador(a) de P.H.", "Administrador(a) de P.H."],
    ["Gerente de Administracion", "Gerente de administración"],
    ["Contador(a)", "Contador(a)"],
    ["Revisor(a) Fiscal", "Revisor(a) fiscal"],
    ["Asistente Administrativo", "Asistente administrativo"],
    ["Otro", "Otro"],
  ];
  // Un cargo guardado que no está en la lista (p. ej. el del demo) se muestra tal cual.
  const cargoFuera = cargo && !cargos.some(([v]) => v === cargo) ? cargo : null;

  const nombreVisible = profile?.name || session?.user?.name || "";
  const correoVisible = profile?.email || session?.user?.email || "";
  const errorPerfil = !loading && (profile === null || profile.error === true);

  const colorValido = HEX.test(brandColor.trim());
  const colorInvalido = colorTocado && brandColor.trim() !== "" && !colorValido;
  const empresa = company.trim();

  const ticketValido = Boolean(ticketSubject.trim() && ticketContent.trim());
  const hayTickets = tickets.length > 0;

  // Vista previa de las DOS superficies reales donde sale la marca. Sus colores
  // por defecto son los de esas superficies, no tokens del tema: el encabezado
  // del PDF (src/lib/documents/pdf-generator.ts: #4338ca en informes, verde en
  // actas) y la cabecera del portal del residente (src/app/u/[token]/page.tsx: #7c3aed).
  const colorPdf = colorValido ? brandColor.trim() : "#4338ca";
  const colorPortal = colorValido ? brandColor.trim() : "#7c3aed";
  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={empresa ? `Logo de ${empresa}` : "Tu logo"} />
  ) : null;
  const laminaPapel = (
    <figure className="cfg-lam papel">
      <div style={{ borderBottom: `3px solid ${colorPdf}` }}>
        {logo}
        {empresa ? (
          <span className="emp pdf" style={{ color: colorPdf }}>{empresa}</span>
        ) : (
          !logo && <span className="nada" aria-hidden="true" />
        )}
      </div>
      <figcaption>{colorValido ? "Informes y actas (PDF)" : "Informes en PDF (las actas usan verde)"}</figcaption>
    </figure>
  );
  const laminaPortal = (
    <figure className="cfg-lam portal">
      <div style={{ background: colorPortal }}>
        {/* Mismo respaldo que el portal: empresa, si no el nombre, si no «Administración». */}
        {logo ?? <span className="emp">{empresa || nombreVisible || "Administración"}</span>}
      </div>
      <figcaption>Portal de residentes</figcaption>
    </figure>
  );

  return (
    <div>
      <style href="k-configuracion-local" precedence="default">
        {CSS_CONFIGURACION}
      </style>
      <Header title="Configuración" />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="15"
            titulo="Configuración"
            subtitulo="Tu perfil, la marca de tus documentos, el tema de la interfaz y el soporte."
          />

          {errorPerfil && (
            <Aviso
              className="cfg-aviso"
              enLinea
              tipo="error"
              titulo="No pudimos cargar todos tus datos."
              texto="Si guardas ahora, los campos que aparecen vacíos reemplazarán lo que tenías. Recarga la página antes de hacer cambios."
              accion={{ etiqueta: "Recargar", alElegir: () => window.location.reload() }}
            />
          )}

          {/* ── 15.1 PERFIL ─────────────────────────────────────────── */}
          <Seccion id="cfg-perfil" titulo="Perfil" nota="tus datos de contacto">
            {loading ? (
              <Esqueleto variante="bloque" etiquetaAccesible="Cargando tu perfil…" />
            ) : (
              <>
              <div className="k-r12">
                <div style={{ gridColumn: "1 / 8" }}>
                  <GrupoCampos titulo="Tus datos">
                    <Campo id="cfg-nombre" etiqueta="Nombre completo">
                      <Entrada id="cfg-nombre" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    </Campo>
                    <Campo id="cfg-cargo" etiqueta="Cargo">
                      <Selector id="cfg-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)}>
                        <option value="">Selecciona tu cargo</option>
                        {cargoFuera && <option value={cargoFuera}>{cargoFuera}</option>}
                        {cargos.map(([valor, etiqueta]) => (
                          <option key={valor} value={valor}>{etiqueta}</option>
                        ))}
                      </Selector>
                    </Campo>
                    <Campo
                      id="cfg-empresa"
                      etiqueta="Empresa o razón social"
                      ayuda="Aparece en el encabezado de tus informes y actas, y en el portal de tus residentes."
                    >
                      <Entrada
                        id="cfg-empresa"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Nombre de tu empresa"
                        autoComplete="organization"
                      />
                    </Campo>
                    <div className="cfg-dos">
                      <Campo id="cfg-telefono" etiqueta="Teléfono">
                        <Entrada
                          id="cfg-telefono"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+57 300 123 4567"
                          autoComplete="tel"
                        />
                      </Campo>
                      <Campo id="cfg-ciudad" etiqueta="Ciudad">
                        <Entrada
                          id="cfg-ciudad"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Bogotá"
                          autoComplete="address-level2"
                        />
                      </Campo>
                    </div>
                  </GrupoCampos>
                </div>

                <aside className="cfg-aside" style={{ gridColumn: "9 / 13" }}>
                  <Panel titulo="Tu cuenta">
                    <div className="cfg-cuenta">
                      <div className="a" aria-hidden="true">{iniciales(nombreVisible)}</div>
                      <div>
                        <b>{nombreVisible}</b>
                        <span className="k-mono">{correoVisible}</span>
                      </div>
                    </div>
                    <p className="cfg-nota">Es tu correo de acceso a SOPH.IA.</p>
                  </Panel>
                  {/* Flujo real de cambio de clave: /forgot-password envía el enlace. */}
                  <Panel titulo="Seguridad">
                    <p className="cfg-nota">Si entras con correo y clave, te enviamos un enlace para cambiarla.</p>
                    <Boton variante="secundario" tam={40} flecha="avanza" href="/forgot-password">
                      Cambiar mi clave
                    </Boton>
                  </Panel>
                </aside>
              </div>
              <div className="cfg-guardar cfg-guardar-perfil">
                <Boton variante="secundario" onClick={() => guardar("guardar-perfil")} cargando={saving} textoCargando="Guardando…" ancho="movil">
                  Guardar cambios
                </Boton>
                <p className="k-apoyo">Guarda tu perfil y la marca de tus documentos a la vez.</p>
                {saveError && errorEn === "guardar-perfil" && (
                  <p className="k-err" role="alert">
                    No pudimos guardar tus cambios. Revisa tu conexión e inténtalo de nuevo.
                  </p>
                )}
              </div>
              </>
            )}
          </Seccion>

          {/* ── 15.2 MARCA DE TUS DOCUMENTOS (se guarda junto con el perfil) ── */}
          <Seccion id="cfg-marca" titulo="Marca de tus documentos" nota="informes, actas y portal de residentes">
            {loading ? (
              <Esqueleto variante="bloque" etiquetaAccesible="Cargando la marca de tus documentos…" />
            ) : (
              <>
                <div className="k-r12">
                  <div style={{ gridColumn: "1 / 8" }}>
                    <GrupoCampos titulo="Logo" nota="Encabeza tus informes y actas, y aparece en el portal de tus residentes.">
                      <ZonaSubida
                        compacta
                        titulo={uploadingLogo ? "Subiendo el logo…" : logoUrl ? "Cambiar logo" : "Sube tu logo"}
                        texto="Suéltalo aquí o haz clic para elegirlo."
                        formatos="PNG, JPG o WebP"
                        accept="image/png,image/jpeg,image/webp"
                        etiquetaAccesible={logoUrl ? "Cambiar logo" : "Subir logo"}
                        deshabilitado={uploadingLogo}
                        alElegir={elegirLogo}
                      />
                      {(uploadingLogo || logoFormato || (saveError && errorEn === "logo") || logoUrl) && (
                        <div className="cfg-logo-acc">
                          {uploadingLogo ? (
                            <span role="status">
                              <Estado tipo="enCurso" tamLetra={14}>Subiendo {logoNombre || "el logo"}…</Estado>
                            </span>
                          ) : logoFormato ? (
                            <p className="k-err" role="alert">Formato no admitido: sube el logo en PNG, JPG o WebP.</p>
                          ) : saveError && errorEn === "logo" ? (
                            <p className="k-err" role="alert">
                              No pudimos subir el logo. Revisa tu conexión e inténtalo de nuevo.
                            </p>
                          ) : null}
                          {logoUrl && !uploadingLogo && (
                            <Boton variante="fantasma" tam={40} onClick={() => setLogoUrl("")}>Quitar logo</Boton>
                          )}
                        </div>
                      )}
                    </GrupoCampos>

                    <GrupoCampos titulo="Color de marca">
                      <Campo
                        id="cfg-color"
                        etiqueta="Color en formato hexadecimal"
                        ayuda="Seis cifras después de #. Sin color propio, cada documento usa su color predeterminado."
                        error={colorInvalido ? "Escribe el color con seis cifras después de #, por ejemplo #4338CA." : undefined}
                      >
                        <div className="cfg-color">
                          <span className={colorValido ? "cfg-muestra" : "cfg-muestra vacia"}>
                            <input
                              type="color"
                              value={colorValido ? brandColor.trim() : "#4338ca"}
                              onChange={(e) => setBrandColor(e.target.value)}
                              aria-label="Elegir el color de marca en la paleta"
                            />
                          </span>
                          <Entrada
                            id="cfg-color"
                            value={brandColor}
                            onChange={(e) => setBrandColor(e.target.value)}
                            onBlur={() => setColorTocado(true)}
                            placeholder="Por ejemplo, #1F6F4A"
                            spellCheck={false}
                            invalido={colorInvalido}
                            aria-describedby={colorInvalido ? "cfg-color-ayuda cfg-color-err" : "cfg-color-ayuda"}
                          />
                          {brandColor && (
                            <Boton variante="fantasma" tam={40} onClick={() => setBrandColor("")}>
                              Usar el predeterminado
                            </Boton>
                          )}
                        </div>
                      </Campo>
                    </GrupoCampos>
                  </div>

                  <aside className="cfg-aside" style={{ gridColumn: "9 / 13" }}>
                    <Panel titulo="Vista previa" nota="así se ve tu marca">
                      <div className="cfg-prev">
                        {laminaPapel}
                        {laminaPortal}
                      </div>
                      <p className="cfg-nota">
                        {logoUrl
                          ? "Revisa que tu logo se lea bien sobre el papel y sobre el color del portal."
                          : empresa
                            ? `Sin logo: tus documentos llevarán el nombre de la empresa, «${empresa}».`
                            : "Sin logo: escribe el nombre de tu empresa en «Perfil» para que tus documentos lo lleven."}
                      </p>
                    </Panel>
                  </aside>
                </div>

                <div className="cfg-guardar">
                  <Boton onClick={() => guardar()} cargando={saving} textoCargando="Guardando…" ancho="movil">
                    Guardar cambios
                  </Boton>
                  <p className="k-apoyo">Guarda tu perfil y la marca de tus documentos.</p>
                  {saveError && errorEn === "guardar" && (
                    <p className="k-err" role="alert">
                      No pudimos guardar tus cambios. Revisa tu conexión e inténtalo de nuevo.
                    </p>
                  )}
                </div>
              </>
            )}
          </Seccion>

          {/* ── 15.3 APARIENCIA ─────────────────────────────────────── */}
          <Seccion id="cfg-apariencia" titulo="Apariencia" nota="tema de la interfaz">
            <div className="k-r12">
              <div className="k-fld" style={{ gridColumn: "1 / 8" }}>
                <span className="lb" id="cfg-tema-lb">Tema</span>
                <SelectorTema grande className="cfg-tema" />
                <span className="k-ayuda">
                  Auto sigue a tu dispositivo: claro si lo pide, oscuro en cualquier otro caso. El cambio se aplica al
                  momento, este navegador lo recuerda y también puedes hacerlo al pie del menú.
                </span>
              </div>
            </div>
          </Seccion>

          {/* ── 15.4 SOPORTE ────────────────────────────────────────── */}
          <Seccion
            id="cfg-soporte"
            titulo="Soporte"
            nota="tus tickets"
            acciones={
              !showTicketForm && (ticketsLoading || hayTickets) ? (
                <Boton tam={40} flecha="crea" onClick={() => setShowTicketForm(true)} data-nuevo-ticket="">Nuevo ticket</Boton>
              ) : undefined
            }
          >
            <div className="k-r12">
              <div style={{ gridColumn: "1 / 9" }}>
                {showTicketForm && (
                  <GrupoCampos className="cfg-ticket" titulo="Nuevo ticket" nota="Te respondemos dentro del mismo ticket.">
                    <Campo id="cfg-tk-asunto" etiqueta="Asunto">
                      <Entrada
                        id="cfg-tk-asunto"
                        autoFocus
                        value={ticketSubject}
                        onChange={(e) => setTicketSubject(e.target.value)}
                        placeholder="Describe brevemente tu problema"
                      />
                    </Campo>
                    <Campo id="cfg-tk-cat" etiqueta="Categoría" sinEtiqueta>
                      <Segmentos
                        etiquetaAccesible="Categoría"
                        valor={ticketCategory}
                        alCambiar={setTicketCategory}
                        items={CATEGORIAS}
                      />
                    </Campo>
                    <Campo id="cfg-tk-pri" etiqueta="Prioridad" sinEtiqueta>
                      <Segmentos
                        etiquetaAccesible="Prioridad"
                        valor={ticketPriority}
                        alCambiar={setTicketPriority}
                        items={PRIORIDADES}
                      />
                    </Campo>
                    <Campo
                      id="cfg-tk-desc"
                      etiqueta="Descripción"
                      ayuda="Describe tu problema con el mayor detalle posible: qué hacías, qué esperabas y qué pasó."
                    >
                      <AreaTexto
                        id="cfg-tk-desc"
                        value={ticketContent}
                        onChange={(e) => setTicketContent(e.target.value)}
                        rows={4}
                      />
                    </Campo>

                    {ticketError && (
                      <Aviso enLinea tipo="error" titulo="No se pudo crear el ticket." texto={ticketError} />
                    )}

                    <div className="k-btns">
                      <Boton
                        onClick={handleTicketSubmit}
                        disabled={!ticketValido}
                        cargando={ticketSubmitting}
                        textoCargando="Enviando…"
                        flecha="avanza"
                        ancho="movil"
                      >
                        Enviar ticket
                      </Boton>
                      <Boton variante="secundario" onClick={cerrarFormulario} ancho="movil">Cancelar</Boton>
                    </div>
                    {!ticketValido && (
                      <p className="k-ayuda" style={{ margin: "10px 0 0" }}>
                        Escribe el asunto y la descripción para enviarlo.
                      </p>
                    )}
                  </GrupoCampos>
                )}

                {ticketsLoading ? (
                  <Esqueleto variante="tabla" filas={2} etiquetaAccesible="Cargando tus tickets…" />
                ) : !hayTickets && showTicketForm ? null : (
                  <Tabla
                    className="cfg-tickets"
                    alta
                    etiquetaAccesible="Tus tickets de soporte"
                    filas={tickets}
                    claveFila={(t) => t.id}
                    columnas={[
                      {
                        id: "asunto",
                        titulo: "Asunto",
                        ancho: "minmax(0, 3fr)",
                        claseCelda: "k-c-nom",
                        celda: (t) => {
                          const n = t._count?.messages;
                          const prioridad = NOMBRE_PRIORIDAD[t.priority];
                          const detalle = [
                            prioridad ? `Prioridad ${prioridad}` : null,
                            n !== undefined ? (n === 1 ? "1 mensaje" : `${n} mensajes`) : null,
                          ].filter(Boolean).join(" · ");
                          return (
                            <>
                              {t.subject}
                              {detalle && <span>{detalle}</span>}
                            </>
                          );
                        },
                      },
                      {
                        id: "categoria",
                        titulo: "Categoría",
                        ancho: "minmax(0, 1.2fr)",
                        celda: (t) => <Categoria>{NOMBRE_CATEGORIA[t.category] ?? t.category}</Categoria>,
                      },
                      {
                        id: "estado",
                        titulo: "Estado",
                        ancho: "minmax(0, 1.3fr)",
                        celda: (t) => (
                          <Estado tipo={STATUS_TIPO[t.status] ?? "sin"} tamLetra={14}>
                            {STATUS_LABELS[t.status] ?? t.status}
                          </Estado>
                        ),
                      },
                      {
                        id: "fecha",
                        titulo: "Actualizado",
                        ancho: "minmax(0, 1.3fr)",
                        claseCelda: "cfg-fecha",
                        celda: (t) => (
                          <>
                            <span className="k-fecha">{relativeTime(t.updatedAt)}</span>
                            <span className="k-meta">{fechaCorta(t.updatedAt)}</span>
                          </>
                        ),
                      },
                      {
                        id: "accion",
                        titulo: "Acción",
                        tituloOculto: true,
                        alinear: "fin",
                        ancho: "auto",
                        claseCelda: "k-td-acc",
                        celda: (t) => (
                          <BotonFila href={`/dashboard/soporte/${t.id}`} aria-label={`Abrir el ticket: ${t.subject}`}>
                            Abrir
                          </BotonFila>
                        ),
                      },
                    ]}
                    vacio={
                      <Vacio
                        nivel={3}
                        titulo="Aún no tienes tickets de soporte."
                        texto="Si algo no funciona o tienes una duda, crea un ticket y te respondemos dentro de él."
                        acciones={
                          <Boton flecha="crea" onClick={() => setShowTicketForm(true)}>Nuevo ticket</Boton>
                        }
                      />
                    }
                  />
                )}
              </div>

              <aside className="cfg-aside" style={{ gridColumn: "9 / 13" }}>
                <Panel titulo="Estados de un ticket">
                  <ul className="cfg-lista">
                    {STATUS_AYUDA.map(([clave, texto]) => (
                      <li key={clave}>
                        <Estado tipo={STATUS_TIPO[clave]} tamLetra={14}>{STATUS_LABELS[clave]}</Estado>
                        <p className="k-apoyo">{texto}</p>
                      </li>
                    ))}
                  </ul>
                </Panel>

                {(WHATSAPP_LINK || soporteDisponible) && (
                  <Panel className="cfg-canales" titulo="Otros canales">
                    <p className="k-apoyo" style={{ margin: 0 }}>
                      ¿Necesitas ayuda ya? Escríbele a nuestro equipo de soporte.
                    </p>
                    <div className="k-btns">
                      {WHATSAPP_LINK && (
                        <Boton variante="secundario" tam={40} href={WHATSAPP_LINK} nuevaPestana flecha="avanza">
                          Soporte por WhatsApp
                        </Boton>
                      )}
                      {soporteDisponible && (
                        <Boton variante="secundario" tam={40} onClick={abrirSoporte} aria-controls="soporte-sophia">
                          Chat de soporte
                        </Boton>
                      )}
                    </div>
                  </Panel>
                )}
              </aside>
            </div>
          </Seccion>
        </Pieza>
      </Pagina>
    </div>
  );
}
