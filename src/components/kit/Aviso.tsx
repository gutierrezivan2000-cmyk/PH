"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Boton } from "./Boton";
import { unir } from "./util";

export type TipoAviso = "ok" | "error" | "info";
export type AccionAviso = { etiqueta: string; href?: string; alElegir?: () => void };

/**
 * Aviso (toast) presentacional (SPEC §f.14): caja --surface-0, borde 2 px,
 * BORDE IZQUIERDO DE 8 px (--ok éxito · --danger error · --ink informativo),
 * --shadow-pop. Primera frase en negrita + una acción de 40 px y/o «Cerrar».
 * Un error no se va solo: con `alCerrar` siempre lleva «Cerrar» (fantasma),
 * también cuando trae acción. Éxito/informativo con acción caducan a los 6 s.
 * Para mostrarlos de verdad usa `avisar()` + <RegionAvisos />.
 * `enLinea` = aviso dentro del flujo (banner de renovación, límite alcanzado,
 * «Demo activo»): sin sombra.
 */
export function Aviso({ tipo = "info", titulo, texto, accion, alCerrar, enLinea, className, rol }: {
  tipo?: TipoAviso; titulo: ReactNode; texto?: ReactNode; accion?: AccionAviso;
  alCerrar?: () => void; enLinea?: boolean; className?: string;
  /** Por defecto: error → alert, resto → status. En línea y estático: pasa rol={null}. */
  rol?: "status" | "alert" | null;
}) {
  const role = rol === null ? undefined : rol ?? (tipo === "error" ? "alert" : "status");
  return (
    <div role={role} className={unir("k-aviso", tipo === "ok" && "ok", tipo === "error" && "err", enLinea && "k-linea", className)}>
      <span><b>{titulo}</b>{texto && <> {texto}</>}</span>
      {(accion || alCerrar) && (
        <span className="acc">
          {accion && (accion.href
            ? <Boton variante="secundario" tam={40} href={accion.href}>{accion.etiqueta}</Boton>
            : <Boton variante="secundario" tam={40} onClick={accion.alElegir}>{accion.etiqueta}</Boton>)}
          {alCerrar && (!accion || tipo === "error") && <Boton variante="fantasma" tam={40} onClick={alCerrar}>Cerrar</Boton>}
        </span>
      )}
    </div>
  );
}

/* ── almacén de avisos: avisar() se puede llamar desde cualquier sitio ── */
type AvisoVivo = { id: number; tipo: TipoAviso; titulo: string; texto?: string; accion?: AccionAviso };
let avisos: AvisoVivo[] = [];
let siguiente = 1;
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
const VACIO: AvisoVivo[] = [];
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const leer = () => avisos;
const leerServidor = () => VACIO;

/**
 * Muestra un aviso abajo a la derecha (arriba del dock en móvil).
 * Éxito/informativo se van a los 6 s (pausa con cursor o foco); error no se va solo.
 *
 *   avisar({ tipo: "ok", titulo: "Informe generado.", texto: "Los Pinos · septiembre 2026",
 *            accion: { etiqueta: "Abrir", href: `/dashboard/generar/${id}` } });
 *   avisar({ tipo: "error", titulo: "No se pudo enviar el correo.", texto: "La unidad 202 no tiene correo registrado." });
 *
 * Requiere <RegionAvisos /> montado una vez (lo monta el armazón).
 */
export function avisar(a: Omit<AvisoVivo, "id">): number {
  const id = siguiente++;
  avisos = [...avisos, { ...a, id }].slice(-4);
  emitir();
  return id;
}
export function quitarAviso(id: number) {
  avisos = avisos.filter((a) => a.id !== id);
  emitir();
}

function AvisoTemporizado({ a }: { a: AvisoVivo }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (a.tipo === "error") return;
    let restante = 6000, inicio = Date.now();
    let t: ReturnType<typeof setTimeout> = setTimeout(() => quitarAviso(a.id), restante);
    const el = ref.current;
    const pausar = () => { clearTimeout(t); restante -= Date.now() - inicio; };
    const seguir = () => {
      if (el && (el.matches(":hover") || el.contains(document.activeElement))) return;
      inicio = Date.now(); clearTimeout(t); t = setTimeout(() => quitarAviso(a.id), Math.max(restante, 1500));
    };
    el?.addEventListener("mouseenter", pausar); el?.addEventListener("focusin", pausar);
    el?.addEventListener("mouseleave", seguir); el?.addEventListener("focusout", seguir);
    return () => {
      clearTimeout(t);
      el?.removeEventListener("mouseenter", pausar); el?.removeEventListener("focusin", pausar);
      el?.removeEventListener("mouseleave", seguir); el?.removeEventListener("focusout", seguir);
    };
  }, [a.id, a.tipo]);
  const accion = a.accion && {
    ...a.accion,
    alElegir: () => { a.accion?.alElegir?.(); quitarAviso(a.id); },
  };
  return (
    <div ref={ref}>
      <Aviso tipo={a.tipo} titulo={a.titulo} texto={a.texto} accion={accion} alCerrar={() => quitarAviso(a.id)}
        className="entra" rol={a.tipo === "error" ? "alert" : null} />
    </div>
  );
}

/* ── una sola región: si se monta dos veces (armazón + una página), pinta solo la primera ── */
let regiones: string[] = [];
const oyentesRegion = new Set<() => void>();
const suscribirRegion = (f: () => void) => { oyentesRegion.add(f); return () => { oyentesRegion.delete(f); }; };
const avisarRegiones = () => oyentesRegion.forEach((f) => f());

/**
 * Región donde aparecen los avisos de `avisar()`. La monta el armazón (dashboard y
 * /empresa); si otra pantalla la monta también, solo se pinta la primera (así cada
 * `avisar()` sale una vez). Va en un portal en <body> con `data-k-avisos`: el
 * <Modal> no la vuelve inerte. La región es aria-live="polite"; los errores
 * llevan role="alert".
 */
export function RegionAvisos() {
  const yo = useId();
  useEffect(() => {
    regiones = [...regiones, yo];
    avisarRegiones();
    return () => {
      regiones = regiones.filter((r) => r !== yo);
      avisarRegiones();
    };
  }, [yo]);
  const primera = useSyncExternalStore(suscribirRegion, () => regiones[0] === yo, () => false);
  const lista = useSyncExternalStore(suscribir, leer, leerServidor);
  if (!primera) return null;
  return createPortal(
    <div className="k-avisos" data-k-avisos="" aria-live="polite" aria-relevant="additions">
      {lista.map((a) => <AvisoTemporizado key={a.id} a={a} />)}
    </div>,
    document.body,
  );
}

/** Enlace de texto dentro de un aviso en línea («Ver planes»). */
export function EnlaceAviso({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="k-enlace">{children}</Link>;
}
