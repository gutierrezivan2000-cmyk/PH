"use client";

import { Check, Copy, CreditCard, Link2, Link2Off, MailWarning, MessageCircle, Power, RefreshCw, Send, Settings2, Users, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { UnitImport } from "@/components/dashboard/UnitImport";
import { waLink, portalLinkMessage } from "@/lib/whatsapp";
import { useModulos } from "@/components/dashboard/useModulos";
import {
  AccionesFila,
  AreaTexto,
  Aviso,
  avisar,
  BarraLote,
  Boton,
  BotonFila,
  BotonLote,
  Buscador,
  CabeceraPieza,
  Campo,
  Casilla,
  Entrada,
  ErrorCarga,
  Esqueleto,
  Estado,
  MenuMas,
  Modal,
  Pagina,
  Panel,
  PestanasUnidas,
  PieTabla,
  Pieza,
  Seccion,
  Segmentos,
  SinResultados,
  Tabla,
  Vacio,
  nombreCorto,
  type ColumnaTabla,
  type ItemMenu,
  type Tono,
} from "@/components/kit";

interface Property {
  id: string;
  name: string;
}

interface UnitRow {
  id: string;
  label: string;
  residentName: string | null;
  email: string | null;
  phone: string | null;
  portalToken: string | null;
}

type Filtro = "todas" | "con" | "sin" | "sinCorreo";

/** Cada filtro con su icono y color: 👥 todas · 🔗 con enlace · 🔗̸ sin enlace · ✉⚠ sin correo. */
const ICONO_FILTRO: Record<Filtro, { icono: LucideIcon; tono: Tono }> = {
  todas: { icono: Users, tono: "sky" },
  con: { icono: Link2, tono: "green" },
  sin: { icono: Link2Off, tono: "slate" },
  sinCorreo: { icono: MailWarning, tono: "amber" },
};

/** Confirmaciones que antes eran window.confirm: ahora un <Modal> del kit con el mismo texto. */
type Confirmacion =
  | { tipo: "rotar"; unidad: UnitRow }
  | { tipo: "desactivar"; unidad: UnitRow }
  | { tipo: "enviarTodos" }
  | { tipo: "enviarLote"; ids: string[] }
  | { tipo: "rotarLote"; ids: string[] };

/** «Apto 101», «101», «Apartamento 1203» → piso (1, 12). null si la etiqueta no sigue el patrón. */
function pisoDe(label: string): number | null {
  const m = label.trim().match(/^(?:apto\.?|apartamento|ap\.?)?\s*(\d{3,4})$/i);
  return m ? Math.floor(Number(m[1]) / 100) : null;
}

/**
 * Etiqueta de la unidad: «Apto 101» se pinta entera en escritorio; en la ficha móvil
 * (columna de 76 px) el prefijo pasa a una línea pequeña encima del número.
 */
function EtiquetaUnidad({ label }: { label: string }) {
  const m = label.trim().match(/^(apto\.?|apartamento|ap\.?|casa|local|oficina)\s+(\S+)$/i);
  if (!m) return <>{label}</>;
  return <><span className="res-pre">{m[1]}{"\u00a0"}</span>{m[2]}</>;
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Resultado de una acción como aviso del kit (SPEC §f.14): primera frase en negrita
 * y el resto como texto. «Número de WhatsApp guardado. Ya aparece en…» →
 * titulo «Número de WhatsApp guardado.» + texto «Ya aparece en…».
 */
function avisarResultado(m: { ok: boolean; text: string }) {
  const partes = m.text.match(/^(.+?[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«])([\s\S]+)$/);
  avisar({ tipo: m.ok ? "ok" : "error", titulo: partes ? partes[1] : m.text, texto: partes ? partes[2] : undefined });
}

export default function ResidentesPage() {
  const carteraAbierta = useModulos().visible("cartera");
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [waDirty, setWaDirty] = useState(false);
  const [waSaving, setWaSaving] = useState(false);

  // ePayco config (account-level, applies to all properties)
  // Alta de unidades. Vivía en Comunicados, que quedó pausado, y en Residentes
  // el importador solo aparecía con la lista vacía: tras importar la primera
  // unidad no quedaba NINGUNA forma de añadir más.
  // Distinguir "no hay unidades" de "no se pudieron cargar": el catch silencioso
  // dejaba la pantalla diciendo que la propiedad estaba vacía y empujaba a
  // re-importar un listado que en realidad ya estaba en la base.
  const [loadError, setLoadError] = useState(false);
  // Descarta respuestas obsoletas: al cambiar de propiedad con la red lenta, la
  // respuesta de la anterior llegaba después y pintaba SUS unidades bajo el
  // nombre de la nueva.
  const reqSeq = useRef(0);
  // Propiedad cuyas unidades ya llegaron: mientras no coincide con la elegida se
  // pinta el esqueleto (antes la lista vacía decía «aún no tiene unidades»).
  const [loadedFor, setLoadedFor] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  // Solo presentación: el mensaje del alta a mano se pinta como error (■ naranja) o como resultado.
  const [bulkErr, setBulkErr] = useState(false);

  const [showImport, setShowImport] = useState(false);

  const [showPay, setShowPay] = useState(false);
  const [payConfigured, setPayConfigured] = useState(false);
  const [payPublicKey, setPayPublicKey] = useState("");
  const [payCustId, setPayCustId] = useState("");
  const [payKey, setPayKey] = useState("");
  const [payTest, setPayTest] = useState(true);
  const [paySaving, setPaySaving] = useState(false);
  // Solo presentación: mientras no llega (o si falla) /api/pagos/config no se afirma «Sin configurar».
  const [payConsulta, setPayConsulta] = useState<"cargando" | "lista" | "error">("cargando");

  // Presentación de la tabla: filtro, búsqueda, selección y confirmaciones (estado local).
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [consulta, setConsulta] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<Confirmacion | null>(null);

  // El resultado de cada acción sale como aviso del kit (abajo a la derecha; errores hasta
  // cerrarlos). Un mensaje fijo encima de la tabla no se veía al actuar desde una fila
  // lejana ni al guardar en «Ajustes del portal», que está al final de la página.
  useEffect(() => {
    if (msg) avisarResultado(msg);
  }, [msg]);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/pagos/config")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setPayConfigured(!!d.configured);
          setPayPublicKey(d.publicKey || "");
          setPayCustId(d.pCustId || "");
          setPayKey(d.pKeyMasked || "");
          setPayTest(d.test !== false);
          setPayConsulta("lista");
        } else {
          setPayConsulta("error");
        }
      })
      .catch(() => setPayConsulta("error"));
  }, []);

  async function savePayConfig() {
    setPaySaving(true);
    try {
      const res = await fetch("/api/pagos/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: payPublicKey, pCustId: payCustId, pKey: payKey, test: payTest }),
      });
      if (res.ok) {
        setMsg({
          ok: true,
          text: !carteraAbierta
            ? "Pago en línea configurado. Se activará en el portal cuando Cartera esté disponible."
            : "Pago en línea configurado. Los residentes con saldo ya pueden pagar desde su portal.",
        });
        setPayConfigured(!!(payPublicKey && payCustId && (payKey && !payKey.includes("•") || payConfigured)));
        setShowPay(false);
      } else {
        setMsg({ ok: false, text: "No se pudo guardar la configuración de pago." });
      }
    } finally {
      setPaySaving(false);
    }
  }

  async function addUnitsFromText() {
    if (!bulkText.trim() || !propertyId) return;
    setBulkBusy(true);
    setBulkMsg("");
    try {
      const res = await fetch(`/api/properties/${propertyId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: bulkText }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setBulkErr(true);
        setBulkMsg(data?.error || "No se pudo agregar.");
        return;
      }
      setBulkErr(false);
      setBulkMsg(
        `${data.created} agregadas${data.skipped ? ` · ${data.skipped} omitidas (duplicadas)` : ""}`
      );
      setBulkText("");
      await load(propertyId);
    } catch {
      setBulkErr(true);
      setBulkMsg("Error de red.");
    } finally {
      setBulkBusy(false);
    }
  }

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    const seq = ++reqSeq.current;
    setLoadError(false);
    try {
      const res = await fetch(`/api/portal/tokens?propertyId=${pid}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== reqSeq.current) return; // llegó tarde: ya se cambió de propiedad
      if (res.status === 403 && data.code === "plan_upgrade") {
        setUpgrade(true);
        return;
      }
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      setUpgrade(false);
      setUnits(data.units || []);
      setLoadedFor(pid);
      setWhatsapp(data.whatsapp || "");
      setWaDirty(false);
    } catch {
      if (seq === reqSeq.current) setLoadError(true);
    }
  }, []);

  async function saveWhatsapp() {
    setWaSaving(true);
    try {
      const res = await fetch("/api/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: propertyId, whatsapp }),
      });
      if (res.ok) {
        setWaDirty(false);
        setMsg({ ok: true, text: "Número de WhatsApp guardado. Ya aparece en el portal de tus residentes." });
      } else {
        setMsg({ ok: false, text: "No se pudo guardar el número." });
      }
    } finally {
      setWaSaving(false);
    }
  }

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setProperties(data.map((p: Property) => ({ id: p.id, name: p.name })));
          setPropertyId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (propertyId) {
      setMsg(null);
      setUnits([]);
      setSel(new Set());
      load(propertyId);
    }
  }, [propertyId, load]);

  const withToken = units.filter((u) => u.portalToken).length;
  const withEmail = units.filter((u) => u.email).length;
  const missingToken = units.filter((u) => !u.portalToken).length;

  async function generateAll() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudieron generar." });
        return;
      }
      setMsg({ ok: true, text: `${data.created} ${data.created === 1 ? "enlace generado" : "enlaces generados"}.` });
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  // La confirmación («¿Generar un enlace nuevo? El enlace anterior dejará de
  // funcionar de inmediato.») la pide el <Modal> antes de llamar aquí.
  async function rotate(unitId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, action: "rotate" }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Enlace regenerado." });
        await load(propertyId);
      }
    } finally {
      setBusy(false);
    }
  }

  // Confirmado en el <Modal> («¿Desactivar el portal…? El residente perderá el acceso.»).
  async function revoke(unitId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId, action: "revoke" }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Portal desactivado." });
        await load(propertyId);
      }
    } finally {
      setBusy(false);
    }
  }

  // Confirmado en el <Modal> (cuota mensual de correos).
  async function sendAll() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || "No se pudo enviar." });
        return;
      }
      if (data.failed > 0) {
        // Nombrar las unidades que fallaron: el botón de correo de cada fila
        // permite reenviar solo a esas, sin duplicarle el correo al resto ni
        // volver a gastar cuota en los que sí lo recibieron.
        const fallidas = (data.failedUnits || []) as string[];
        setMsg({
          ok: false,
          text:
            `Enviado a ${data.sent}; fallaron ${data.failed}` +
            (fallidas.length
              ? `: ${fallidas.slice(0, 12).join(", ")}${fallidas.length > 12 ? `… y ${fallidas.length - 12} más` : ""}. ` +
                `Reenvíalos uno a uno con «Enviar enlace por correo» en el menú «Más» de cada fila.`
              : "."),
        });
      } else {
        setMsg({ ok: true, text: `Enlace enviado a ${data.sent} ${data.sent === 1 ? "residente" : "residentes"}.` });
      }
      await load(propertyId);
    } catch {
      setMsg({ ok: false, text: "Error de red." });
    } finally {
      setBusy(false);
    }
  }

  async function sendOne(unitId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, unitId }),
      });
      const data = await res.json();
      setMsg(res.ok ? { ok: true, text: "Enlace enviado por correo." } : { ok: false, text: data.error || "No se pudo enviar." });
      if (res.ok) await load(propertyId);
    } finally {
      setBusy(false);
    }
  }

  // Generar el enlace de UNA unidad sin enlace (mismo POST que ya hacía el botón «Generar» de la fila).
  async function generateOne(unitId: string) {
    setBusy(true);
    await fetch("/api/portal/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ propertyId, unitId }) }).catch(() => {});
    await load(propertyId);
    setBusy(false);
  }

  /**
   * Barra de lote: repite en bucle las MISMAS llamadas por unidad que ya usan las
   * filas (POST /api/portal/send con unitId, POST/PATCH /api/portal/tokens) y da un
   * solo resultado al final. La selección es estado local.
   * `efecto` lee cuántas unidades cambió DE VERDAD cada respuesta (`sent` / `created`):
   * una respuesta 200 puede no haber enviado ni generado nada (el demo responde 0).
   * Si alguna falla, se cita el primer motivo que da la API (p. ej. la cuota de correos).
   */
  async function enLote(
    ids: string[],
    llamada: (unitId: string) => Promise<Response>,
    textos: { hecho: (n: number) => string; fallo: string },
    efecto?: (data: { sent?: unknown; created?: unknown } | null) => number | undefined,
  ) {
    if (!ids.length) return;
    setBusy(true);
    setMsg(null);
    let hechas = 0;
    let fallos = 0;
    let motivo = "";
    for (const id of ids) {
      try {
        const res = await llamada(id);
        const data = await res.json().catch(() => null);
        if (res.ok) hechas += efecto?.(data) ?? 1;
        else {
          fallos++;
          if (!motivo && typeof data?.error === "string") motivo = data.error;
        }
      } catch {
        fallos++;
      }
    }
    // Con fallos, el aviso abre con el fallo (va en negrita) y sigue con el motivo y lo que sí se hizo.
    const causa = motivo && !/[.!?]$/.test(motivo.trim()) ? `${motivo.trim()}.` : motivo.trim();
    setMsg(
      fallos === 0
        ? { ok: true, text: textos.hecho(hechas) }
        : {
            ok: false,
            text: [`${textos.fallo} ${plural(fallos, "unidad", "unidades")}.`, causa, hechas > 0 ? textos.hecho(hechas) : ""]
              .filter(Boolean)
              .join(" "),
          },
    );
    setSel(new Set());
    await load(propertyId);
    setBusy(false);
  }

  const cifra = (v: unknown) => (typeof v === "number" ? v : undefined);

  const postJSON = (url: string, method: string, body: unknown) =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  function sendSelection(ids: string[]) {
    return enLote(ids, (unitId) => postJSON("/api/portal/send", "POST", { propertyId, unitId }), {
      hecho: (n) => `Enlace enviado por correo a ${plural(n, "unidad", "unidades")}.`,
      fallo: "No se pudo enviar a",
    }, (d) => cifra(d?.sent));
  }
  function generateSelection(ids: string[]) {
    return enLote(ids, (unitId) => postJSON("/api/portal/tokens", "POST", { propertyId, unitId }), {
      hecho: (n) => `Enlace generado para ${plural(n, "unidad", "unidades")}.`,
      fallo: "No se pudo generar para",
    }, (d) => cifra(d?.created));
  }
  function rotateSelection(ids: string[]) {
    return enLote(ids, (unitId) => postJSON("/api/portal/tokens", "PATCH", { unitId, action: "rotate" }), {
      hecho: (n) => `Enlace regenerado para ${plural(n, "unidad", "unidades")}.`,
      fallo: "No se pudo regenerar para",
    });
  }

  async function copyLink(u: UnitRow) {
    if (!u.portalToken) return;
    try {
      await navigator.clipboard.writeText(`${origin}/u/${u.portalToken}`);
      setCopied(u.id);
      setTimeout(() => setCopied(null), 2000);
      avisar({ tipo: "ok", titulo: "Enlace copiado.", texto: `Portal de ${u.label}` });
    } catch {
      // Portapapeles no disponible (permiso denegado, http): antes no pasaba nada al pulsar.
      avisar({ tipo: "error", titulo: "No se pudo copiar el enlace.", texto: `Cópialo a mano: ${origin}/u/${u.portalToken}` });
    }
  }

  function ejecutarConfirmacion() {
    const c = confirmar;
    setConfirmar(null);
    if (!c) return;
    if (c.tipo === "rotar") rotate(c.unidad.id);
    else if (c.tipo === "desactivar") revoke(c.unidad.id);
    else if (c.tipo === "enviarTodos") sendAll();
    else if (c.tipo === "enviarLote") sendSelection(c.ids);
    else if (c.tipo === "rotarLote") rotateSelection(c.ids);
  }

  function abrirAgregar(prefill?: string) {
    setShowAdd(true);
    setBulkMsg("");
    setBulkErr(false);
    if (prefill !== undefined) setBulkText(prefill);
  }
  function cerrarAgregar() {
    setShowAdd(false);
    setBulkMsg("");
    setBulkErr(false);
  }

  // ── Derivados de lo ya cargado ───────────────────────────────────────
  const propiedad = properties.find((p) => p.id === propertyId);
  const nombre = propiedad?.name ?? "";
  const corto = nombre ? nombreCorto(nombre) : "";
  const cargandoUnidades = !!propertyId && !loadError && loadedFor !== propertyId;
  const listas = !!propertyId && !loadError && loadedFor === propertyId;

  const conteoFiltro: Record<Filtro, number> = {
    todas: units.length,
    con: withToken,
    sin: missingToken,
    sinCorreo: units.length - withEmail,
  };
  const q = consulta.trim().toLowerCase();
  const filtradas = units.filter((u) => {
    if (filtro === "con" && !u.portalToken) return false;
    if (filtro === "sin" && u.portalToken) return false;
    if (filtro === "sinCorreo" && u.email) return false;
    if (!q) return true;
    return [u.label, u.residentName, u.email, u.phone].some((v) => v && v.toLowerCase().includes(q));
  });

  // Agrupar por piso solo si TODAS las etiquetas siguen «Apto NNN» / «NNN» y hay más de un piso (SPEC §g 07).
  const pisos = units.map((u) => pisoDe(u.label));
  const porPiso = units.length > 0 && pisos.every((p) => p !== null) && new Set(pisos).size > 1;

  const seleccionadas = units.filter((u) => sel.has(u.id));
  const selParaCorreo = seleccionadas.filter((u) => u.portalToken && u.email).map((u) => u.id);
  const selSinEnlace = seleccionadas.filter((u) => !u.portalToken).map((u) => u.id);
  const selConEnlace = seleccionadas.filter((u) => u.portalToken).map((u) => u.id);

  const etiquetaFiltro: Record<Filtro, string> = {
    todas: "Todas",
    con: "Con enlace",
    sin: "Sin enlace",
    sinCorreo: "Sin correo",
  };

  const columnas: ColumnaTabla<UnitRow>[] = [
    { id: "u", titulo: "Unidad", ancho: "minmax(0, 1.25fr)", principal: true, claseCelda: "k-c-id", celda: (u) => <EtiquetaUnidad label={u.label} /> },
    {
      id: "r", titulo: "Residente", ancho: "minmax(0, 2.3fr)", claseCelda: "k-c-nom",
      // Debajo del nombre, el teléfono (dato real); la API no trae el rol de la persona.
      celda: (u) => (
        <>
          {u.residentName || <span className="res-sin">Sin nombre</span>}
          {u.phone && <span>{u.phone}</span>}
        </>
      ),
    },
    {
      id: "c", titulo: "Correo", ancho: "minmax(0, 2.9fr)", claseCelda: "k-c-correo",
      celda: (u) => (u.email ? <span title={u.email}>{u.email}</span> : <Estado tipo="falta" tamLetra={14}>Sin correo</Estado>),
    },
    {
      id: "p", titulo: "Portal", ancho: "minmax(0, 1.3fr)",
      celda: (u) => (u.portalToken ? <Estado tipo="ok" tamLetra={14}>Activo</Estado> : <Estado tipo="sin" tamLetra={14}>Sin enlace</Estado>),
    },
    {
      id: "a", titulo: "Acciones", tituloOculto: true, alinear: "fin", ancho: "auto", claseCelda: "k-td-acc",
      celda: (u) => {
        if (!u.portalToken) {
          return (
            <AccionesFila>
              <BotonFila onClick={() => generateOne(u.id)} disabled={busy} aria-label={`Generar enlace: ${u.label}`}>
                Generar enlace
              </BotonFila>
            </AccionesFila>
          );
        }
        const wa = u.phone
          ? waLink(u.phone, portalLinkMessage({ propertyName: nombre || "la copropiedad", unitLabel: u.label, portalUrl: `${origin}/u/${u.portalToken}` }))
          : null;
        const items: ItemMenu[] = [
          { etiqueta: "Abrir el portal de la unidad", href: `/u/${u.portalToken}`, nuevaPestana: true },
          u.email
            ? { etiqueta: "Enviar enlace por correo", alElegir: () => sendOne(u.id), deshabilitado: busy }
            : { etiqueta: "Enviar enlace por correo", nota: "sin correo", deshabilitado: true },
          wa
            ? { etiqueta: "Enviar enlace por WhatsApp", href: wa, nuevaPestana: true }
            : { etiqueta: "Enviar enlace por WhatsApp", nota: "sin teléfono", deshabilitado: true },
          { etiqueta: "Generar un enlace nuevo…", deshabilitado: busy, alElegir: () => setConfirmar({ tipo: "rotar", unidad: u }) },
          { etiqueta: "Desactivar portal…", nota: "pide confirmación", peligro: true, deshabilitado: busy, alElegir: () => setConfirmar({ tipo: "desactivar", unidad: u }) },
        ];
        return (
          <AccionesFila>
            <BotonFila
              onClick={() => copyLink(u)}
              icono={copied === u.id ? Check : Copy}
              tono={copied === u.id ? "green" : "slate"}
              aria-label={`${copied === u.id ? "Copiado" : "Copiar enlace"}: ${u.label}`}
            >
              {copied === u.id ? "Copiado" : "Copiar enlace"}
            </BotonFila>
            <MenuMas etiquetaAccesible={`Más acciones · ${u.label}`} items={items} />
          </AccionesFila>
        );
      },
    },
  ];

  // ── Modal de confirmación ─────────────────────────────────────────────
  const modal = (() => {
    const c = confirmar;
    if (!c) return null;
    const cancelar = <Boton variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Boton>;
    if (c.tipo === "rotar")
      return {
        icono: RefreshCw as LucideIcon, tono: "amber" as Tono,
        titulo: `¿Generar un enlace nuevo para ${c.unidad.label}?`,
        texto: "El enlace anterior dejará de funcionar de inmediato. Tendrás que compartir el nuevo con el residente.",
        acciones: <>{cancelar}<Boton onClick={ejecutarConfirmacion}>Generar enlace nuevo</Boton></>,
      };
    if (c.tipo === "desactivar")
      return {
        icono: Power as LucideIcon, tono: "red" as Tono,
        titulo: `¿Desactivar el portal de ${c.unidad.label}?`,
        texto: `${c.unidad.residentName ? `${c.unidad.residentName} perderá` : "El residente perderá"} el acceso: su enlace dejará de funcionar de inmediato.`,
        acciones: <>{cancelar}<Boton variante="peligro" lleno onClick={ejecutarConfirmacion}>Desactivar portal</Boton></>,
      };
    if (c.tipo === "enviarTodos")
      return {
        icono: Send as LucideIcon, tono: "teal" as Tono,
        titulo: `¿Enviar el enlace del portal por correo a las ${withEmail} unidades con correo?`,
        texto: "Consumirá parte de tu cuota mensual de correos.",
        acciones: <>{cancelar}<Boton onClick={ejecutarConfirmacion}>Enviar a {plural(withEmail, "unidad", "unidades")}</Boton></>,
      };
    if (c.tipo === "enviarLote")
      return {
        icono: Send as LucideIcon, tono: "teal" as Tono,
        titulo: `¿Enviar el enlace del portal por correo a ${plural(c.ids.length, "unidad", "unidades")}?`,
        texto: `Se envía solo a las seleccionadas que tienen enlace y correo. Consumirá parte de tu cuota mensual de correos.`,
        acciones: <>{cancelar}<Boton onClick={ejecutarConfirmacion}>Enviar a {plural(c.ids.length, "unidad", "unidades")}</Boton></>,
      };
    return {
      icono: RefreshCw as LucideIcon, tono: "amber" as Tono,
      titulo: `¿Generar enlaces nuevos para ${plural(c.ids.length, "unidad", "unidades")}?`,
      texto: "Los enlaces anteriores dejarán de funcionar de inmediato. Tendrás que compartir los nuevos con los residentes.",
      acciones: <>{cancelar}<Boton onClick={ejecutarConfirmacion}>Generar enlaces nuevos</Boton></>,
    };
  })();

  const hayPropiedades = !loading && !upgrade && properties.length > 0;

  return (
    <div className="res">
      <style>{estilos}</style>
      <Header title="Residentes" />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            titulo="Residentes"
            subtitulo="Portal por unidad, sin usuarios ni contraseñas"
            acciones={
              hayPropiedades ? (
                <>
                  <Boton variante="secundario" aria-expanded={showImport} aria-controls="res-importar"
                    onClick={() => setShowImport((v) => !v)}>
                    {showImport ? "Cerrar importación" : "Importar Excel con IA"}
                  </Boton>
                  <Boton flecha="crea" onClick={() => abrirAgregar()}>Agregar unidades</Boton>
                </>
              ) : undefined
            }
          />

          {loading && <Esqueleto variante="completo" filas={6} etiquetaAccesible="Cargando las copropiedades…" />}

          {!loading && upgrade && (
            <Aviso
              enLinea
              rol={null}
              tipo="info"
              titulo="El portal de residentes es una función de los planes Business y Élite."
              texto="Cada unidad recibe un enlace privado para ver su estado de cuenta, los comunicados y los documentos, sin registro ni contraseñas."
              accion={{ etiqueta: "Ver planes", href: "/dashboard/suscripcion" }}
            />
          )}

          {!loading && !upgrade && properties.length === 0 && (
            <Vacio
              titulo="Aún no tienes copropiedades."
              texto="Crea una propiedad primero para activar el portal de residentes."
              acciones={<Boton href="/dashboard/propiedades" flecha="avanza">Agregar copropiedad</Boton>}
            />
          )}

          {hayPropiedades && (
            <>
              <PestanasUnidas
                etiquetaAccesible="Copropiedad"
                valor={propertyId}
                alCambiar={setPropertyId}
                items={properties.map((p) => ({
                  id: p.id,
                  etiqueta: p.name,
                  titulo: p.name,
                  // Solo la elegida tiene sus unidades cargadas: no se inventa el conteo de las demás.
                  conteo: p.id === propertyId && listas ? `${units.length} u.` : undefined,
                }))}
                fin={listas && units.length > 0 ? `${withToken} de ${units.length} con enlace · ${withEmail} con correo` : undefined}
              />

              {showImport && (
                <div id="res-importar" className="res-importar">
                  <Panel titulo="Importar Excel con IA" nota={`a ${nombre}`} titular nivel={2}>
                    <UnitImport
                      modo="zona"
                      propertyId={propertyId}
                      onImported={(n) => {
                        setMsg({ ok: true, text: `${n} ${n === 1 ? "unidad importada" : "unidades importadas"}.` });
                        setShowImport(false);
                        load(propertyId);
                      }}
                    />
                  </Panel>
                </div>
              )}

              {listas && units.length > 0 && (
                <div className="res-portal">
                  <span className="res-cifras">
                    {withToken} de {units.length} con enlace · {withEmail} con correo
                  </span>
                  {missingToken > 0 && (
                    <Boton variante="secundario" tam={40} flecha="crea" onClick={generateAll} disabled={busy}>
                      Generar {missingToken} {missingToken === 1 ? "enlace" : "enlaces"}
                    </Boton>
                  )}
                  {withToken > 0 && withEmail > 0 && (
                    <Boton variante="secundario" tam={40} onClick={() => setConfirmar({ tipo: "enviarTodos" })} disabled={busy}>
                      Enviar a todos por correo · {withEmail}
                    </Boton>
                  )}
                </div>
              )}

              {loadError ? (
                <ErrorCarga
                  titulo="No pudimos cargar las unidades."
                  texto="Es un problema de conexión, no que la propiedad esté vacía. No importes de nuevo el listado: podrías duplicar unidades."
                  acciones={<Boton variante="secundario" onClick={() => load(propertyId)}>Reintentar</Boton>}
                />
              ) : cargandoUnidades ? (
                <Esqueleto variante="tabla" filas={6} etiquetaAccesible="Cargando las unidades…" />
              ) : units.length === 0 ? (
                <Vacio
                  titulo={`${nombre} aún no tiene unidades.`}
                  texto="Sube el listado de copropietarios en Excel o PDF y la IA arma la tabla por ti. También puedes agregarlas a mano."
                  acciones={
                    <>
                      <Boton onClick={() => setShowImport(true)} aria-controls="res-importar">Importar Excel con IA</Boton>
                      <Boton variante="secundario" onClick={() => abrirAgregar()}>Agregar a mano</Boton>
                    </>
                  }
                />
              ) : (
                <>
                  <div className="res-filtros">
                    <Segmentos
                      etiquetaAccesible="Filtrar por estado"
                      valor={filtro}
                      alCambiar={(v) => setFiltro(v as Filtro)}
                      items={(Object.keys(etiquetaFiltro) as Filtro[]).map((f) => ({
                        id: f, etiqueta: etiquetaFiltro[f], conteo: conteoFiltro[f],
                        icono: ICONO_FILTRO[f].icono, tono: ICONO_FILTRO[f].tono,
                      }))}
                    />
                    <Buscador
                      etiquetaAccesible="Buscar unidad, residente o correo"
                      value={consulta}
                      onChange={(e) => setConsulta(e.target.value)}
                    />
                  </div>

                  {seleccionadas.length > 0 && (
                    <BarraLote n={seleccionadas.length} alQuitar={() => setSel(new Set())}>
                      {selParaCorreo.length > 0 && (
                        <BotonLote disabled={busy} onClick={() => setConfirmar({ tipo: "enviarLote", ids: selParaCorreo })}>
                          Enviar enlace por correo · {selParaCorreo.length}
                        </BotonLote>
                      )}
                      {selSinEnlace.length > 0 && (
                        <BotonLote disabled={busy} onClick={() => generateSelection(selSinEnlace)}>
                          Generar enlaces · {selSinEnlace.length}
                        </BotonLote>
                      )}
                      {selConEnlace.length > 0 && (
                        <BotonLote disabled={busy} onClick={() => setConfirmar({ tipo: "rotarLote", ids: selConEnlace })}>
                          Generar enlaces nuevos · {selConEnlace.length}
                        </BotonLote>
                      )}
                    </BarraLote>
                  )}

                  <Tabla
                    etiquetaAccesible={`Unidades de ${nombre}`}
                    filas={filtradas}
                    claveFila={(u) => u.id}
                    columnas={columnas}
                    seleccion={{
                      ids: sel,
                      alCambiar: setSel,
                      etiquetaFila: (u) => `Seleccionar ${u.label}`,
                      etiquetaTodas: "Seleccionar todas",
                    }}
                    agrupar={
                      porPiso
                        ? { clave: (u) => String(pisoDe(u.label)), titulo: (k) => k, nota: "Piso", cabecera: "Piso" }
                        : undefined
                    }
                    vacio={
                      q ? (
                        <SinResultados
                          consulta={consulta.trim()}
                          titulo={`No encontramos «${consulta.trim()}» en ${corto}${filtro !== "todas" ? ` (${etiquetaFiltro[filtro].toLowerCase()})` : ""}.`}
                          texto="Revisa el número o el nombre. Si la unidad es nueva, agrégala ahora."
                          acciones={
                            <>
                              <Boton flecha="crea" onClick={() => abrirAgregar(consulta.trim())}>
                                Agregar la unidad {consulta.trim()}
                              </Boton>
                              {filtro !== "todas" && (
                                <Boton variante="secundario" onClick={() => setFiltro("todas")}>Buscar en todas</Boton>
                              )}
                              <Boton variante="fantasma" onClick={() => setConsulta("")}>Limpiar búsqueda</Boton>
                            </>
                          }
                        />
                      ) : (
                        <SinResultados
                          consulta={etiquetaFiltro[filtro]}
                          titulo={`No hay unidades ${etiquetaFiltro[filtro].toLowerCase()} en ${corto}.`}
                          acciones={<Boton variante="secundario" onClick={() => setFiltro("todas")}>Ver todas</Boton>}
                        />
                      )
                    }
                  />
                  {filtradas.length > 0 && (
                    <PieTabla
                      texto={`Mostrando ${filtradas.length} de ${plural(units.length, "unidad", "unidades")}`}
                    />
                  )}
                </>
              )}

              <div className="res-ajustes">
                <Seccion id="res-ajustes-t" titulo="Ajustes del portal" icono={Settings2} tono="indigo">
                  <p className="k-lectura res-intro">
                    Cada unidad tiene un <b>enlace privado</b> (sin cuenta ni contraseña) donde el residente ve su
                    estado de cuenta, comunicados y documentos. Genera los enlaces, compártelos por correo o WhatsApp,
                    y rótalos si alguno se filtra.
                  </p>
                  <div className="res-dos">
                    <Panel titulo="WhatsApp de la administración" nota={corto ? `de ${corto}` : undefined} icono={MessageCircle} tono="green">
                      <p className="k-apoyo res-p">
                        Aparece en el portal como botón <b>«Escríbenos por WhatsApp»</b>. Cuando un residente lo usa,
                        el mensaje te llega <b>ya identificado con su unidad</b>: sabes de inmediato quién escribe.
                      </p>
                      <div className="res-wa">
                        <Campo id="res-wa" etiqueta="Número de WhatsApp">
                          <Entrada
                            id="res-wa"
                            value={whatsapp}
                            onChange={(e) => { setWhatsapp(e.target.value); setWaDirty(true); }}
                            placeholder="Ej.: 300 123 4567"
                            inputMode="tel"
                          />
                        </Campo>
                        <Boton variante="secundario" onClick={saveWhatsapp} disabled={!waDirty}
                          cargando={waSaving} textoCargando="Guardando…">
                          Guardar número
                        </Boton>
                      </div>
                    </Panel>

                    <Panel titulo="Pago en línea (ePayco)" icono={CreditCard} tono="teal">
                      <div className="res-pago">
                        {!payConfigured && payConsulta === "cargando" ? (
                          <p className="k-meta res-p">Consultando la configuración…</p>
                        ) : (
                          <>
                            {payConfigured ? (
                              <Estado tipo="ok">Configurado</Estado>
                            ) : payConsulta === "error" ? (
                              <Estado tipo="falta">Sin dato</Estado>
                            ) : (
                              <Estado tipo="sin">Sin configurar</Estado>
                            )}
                            <p className="k-apoyo res-p">
                              {payConfigured
                                ? !carteraAbierta
                                  // El botón de pago del portal vive en la sección de
                                  // estado de cuenta, hoy pausada con Cartera: decir que
                                  // "ya pueden pagar" sería falso.
                                  ? "Se activará cuando Cartera esté disponible."
                                  : "Los residentes con saldo pueden pagar desde su portal."
                                : payConsulta === "error"
                                  ? "No pudimos consultar la configuración de pago."
                                  : "Conéctalo para recibir pagos en línea."}
                            </p>
                          </>
                        )}
                        <Boton variante="secundario" tam={40} aria-expanded={showPay} aria-controls="res-pago-form"
                          onClick={() => setShowPay((v) => !v)}>
                          {showPay ? "Ocultar las llaves" : payConfigured ? "Cambiar las llaves" : "Configurar las llaves"}
                        </Boton>
                      </div>
                      {showPay && (
                        <div id="res-pago-form" className="res-pago-form">
                          <p className="k-apoyo res-p">
                            Ingresa las llaves de <b>tu propia cuenta ePayco</b>. Los pagos de los residentes llegan{" "}
                            <b>directo a tu cuenta</b>: SOPH.IA solo concilia contra la cartera y nunca retiene el dinero.
                            Encuentra estas llaves en tu panel de ePayco, en Configuración › Llaves.
                          </p>
                          {[
                            { id: "res-pk", label: "Public Key", val: payPublicKey, set: setPayPublicKey, ph: "pub_test_..." },
                            { id: "res-cust", label: "P_CUST_ID_CLIENTE", val: payCustId, set: setPayCustId, ph: "123456" },
                            { id: "res-pkey", label: "P_KEY", val: payKey, set: setPayKey, ph: "••••" },
                          ].map((f) => (
                            <Campo key={f.id} id={f.id} etiqueta={f.label}>
                              <Entrada
                                id={f.id}
                                value={f.val}
                                onChange={(e) => f.set(e.target.value)}
                                placeholder={f.ph}
                                className="res-mono"
                                autoComplete="off"
                                spellCheck={false}
                              />
                            </Campo>
                          ))}
                          <Casilla
                            etiqueta="Modo de pruebas"
                            detalle="Desactívalo cuando estés listo para cobrar de verdad."
                            checked={payTest}
                            onChange={(e) => setPayTest(e.target.checked)}
                          />
                          <div className="res-pago-acc">
                            <Boton onClick={savePayConfig} disabled={paySaving} cargando={paySaving} textoCargando="Guardando…">
                              Guardar configuración de pago
                            </Boton>
                          </div>
                        </div>
                      )}
                    </Panel>
                  </div>
                </Seccion>
              </div>
            </>
          )}
        </Pieza>
      </Pagina>

      {/* Alta a mano: el mismo formulario de antes («Una unidad por línea»), ahora en un modal. */}
      <Modal
        abierto={showAdd}
        alCerrar={cerrarAgregar}
        ancho={560}
        cerrarConVelo={!bulkText.trim()}
        titulo={`¿Qué unidades quieres agregar${corto ? ` a ${corto}` : ""}?`}
        acciones={
          <>
            {/* Tras agregar, el modal sigue abierto para seguir cargando: «Cancelar» ya no deshace nada. */}
            <Boton variante="secundario" onClick={cerrarAgregar}>{bulkMsg && !bulkErr ? "Cerrar" : "Cancelar"}</Boton>
            <Boton flecha="crea" onClick={addUnitsFromText} disabled={!bulkText.trim()}
              cargando={bulkBusy} textoCargando="Agregando…">
              Agregar
            </Boton>
          </>
        }
      >
        <Campo id="res-lineas" etiqueta="Una unidad por línea"
          ayuda="Unidad, nombre, correo y teléfono separados por comas; puedes dejar fuera lo que no tengas.">
          <AreaTexto
            id="res-lineas"
            data-autofocus
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            placeholder={"Apto 101, María Pérez, maria@correo.com, 3001112233\nApto 102, juan@correo.com\ncarlos@correo.com"}
          />
        </Campo>
        {bulkMsg &&
          (bulkErr ? (
            <p className="k-err res-bulk-err" role="alert">{bulkMsg}</p>
          ) : (
            <p className="res-bulk" role="status">{bulkMsg}</p>
          ))}
      </Modal>

      <Modal
        abierto={!!modal}
        alCerrar={() => setConfirmar(null)}
        titulo={modal?.titulo ?? ""}
        icono={modal?.icono}
        tono={modal?.tono}
        acciones={modal?.acciones}
      >
        {modal && <p>{modal.texto}</p>}
      </Modal>
    </div>
  );
}

const estilos = `
  .res .k-pest { margin-bottom: 18px; }
  .res .res-importar { margin: 6px 0 32px; }
  .res .res-portal { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: flex-end; margin: 0 0 14px; }
  .res .res-cifras { display: none; font-size: 14px; color: var(--ink-2); margin-right: auto; }
  .res .res-filtros { display: flex; gap: 12px 16px; align-items: stretch; margin: 0 0 18px; flex-wrap: wrap; }
  .res .res-filtros > .k-seg { flex: none; }
  .res .res-filtros > .k-campo { flex: 1 1 280px; }
  .res .res-sin { color: var(--ink-3); font-weight: 400; }
  .res .res-ajustes { margin-top: 64px; }
  .res .res-intro { margin: 0 0 28px; }
  .res .res-dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px var(--g); align-items: start; }
  .res .res-p { margin: 0 0 16px; max-width: 60ch; }
  .res .res-wa { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .res .res-wa > .k-fld { flex: 1 1 220px; margin-bottom: 0; }
  .res .res-pago { display: grid; justify-items: start; gap: 10px; }
  .res .res-pago .res-p { margin: 0 0 6px; }
  .res .res-pago-form { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line); }
  .res .res-pago-acc { margin-top: 16px; }
  .res-mono { font-family: var(--f-mono); font-size: 15px; }
  .res-bulk { margin: 0; font-size: 15px; font-weight: 600; color: var(--ink); }
  .res-bulk-err { margin: 0; font-size: 15px; align-items: flex-start; }
  .res-bulk-err::before { margin-top: 5px; }
  @media (max-width: 860px) {
    .res .res-cifras { display: block; flex-basis: 100%; }
    .res .res-pre { display: block; margin-bottom: 4px; font: 700 12px/1 var(--f-sans); color: var(--ink-3); }
    .res .res-portal { justify-content: flex-start; }
    .res .res-dos { grid-template-columns: minmax(0, 1fr); }
    .res .res-ajustes { margin-top: 48px; }
  }
`;
