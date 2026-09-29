"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { unir } from "./util";

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const suscribirNada = () => () => {};

/**
 * Modal (SPEC §f.13): velo --scrim, caja --surface-0 con borde 2 px y
 * --shadow-pop, ancho máx. 440 px (560 con `ancho={560}` para formularios).
 * Título de 28 px = una PREGUNTA concreta; párrafo con la consecuencia;
 * acciones a la derecha: «Cancelar» (secundario) + la acción (primario, o
 * peligro lleno si destruye). Sin «×» suelto: se cierra con «Cancelar»,
 * Escape o clic en el velo.
 *
 * Accesible: role="dialog" aria-modal, foco inicial al primer control (o al
 * elemento con data-autofocus), foco atrapado (el resto de <body> queda
 * `inert`, salvo la región de avisos), Escape y clic en el velo cancelan, el
 * foco vuelve al disparador (desde un <MenuMas>, al botón «Más»).
 * Se monta en <body> con un portal: los tokens viven en :root, así que se ve
 * con el tema del dashboard.
 *
 *   <Modal abierto={!!confirmar} alCerrar={() => setConfirmar(null)}
 *     titulo="¿Desactivar el portal de la unidad 102?"
 *     acciones={<><Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
 *                 <Boton variante="peligro" lleno onClick={desactivar}>Desactivar portal</Boton></>}>
 *     <p>Juan Cárdenas dejará de ver sus documentos…</p>
 *   </Modal>
 */
export function Modal({ abierto, alCerrar, titulo, children, acciones, ancho = 440, cerrarConVelo = true, className }: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: ReactNode;
  children?: ReactNode;
  acciones?: ReactNode;
  ancho?: 440 | 560;
  /** false en formularios con datos a medio escribir. */
  cerrarConVelo?: boolean;
  className?: string;
}) {
  const enCliente = useSyncExternalStore(suscribirNada, () => true, () => false);
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const alCerrarRef = useRef(alCerrar);
  useEffect(() => { alCerrarRef.current = alCerrar; }, [alCerrar]);

  useEffect(() => {
    if (!abierto || !enCliente) return;
    const previo = document.activeElement as HTMLElement | null;
    // Fondo inerte: todo lo que cuelga de <body> salvo el propio modal y la región
    // de avisos (un aviso que llegue con el modal abierto se tiene que poder leer y pulsar).
    const inertes: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === raiz.current || el.hasAttribute("inert") || el.hasAttribute("data-k-avisos")) continue;
      el.setAttribute("inert", "");
      inertes.push(el);
    }
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const inicial = caja.current?.querySelector<HTMLElement>("[data-autofocus]")
      ?? caja.current?.querySelector<HTMLElement>(FOCUSABLES);
    (inicial ?? caja.current)?.focus();

    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); alCerrarRef.current(); return; }
      if (e.key !== "Tab" || !caja.current) return;
      const lista = Array.from(caja.current.querySelectorAll<HTMLElement>(FOCUSABLES));
      if (!lista.length) { e.preventDefault(); return; }
      const primero = lista[0], ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      inertes.forEach((el) => el.removeAttribute("inert"));
      document.documentElement.style.overflow = overflow;
      previo?.focus?.();
    };
  }, [abierto, enCliente]);

  if (!abierto || !enCliente) return null;
  return createPortal(
    <div ref={raiz} className="k-scrim" onMouseDown={(e) => { if (cerrarConVelo && e.target === e.currentTarget) alCerrar(); }}>
      <div ref={caja} role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}
        className={unir("k-modal", ancho === 560 && "k-560", className)}>
        <h2 id={idTitulo}>{titulo}</h2>
        {children && <div className="cuerpo">{children}</div>}
        {acciones && <div className="acc">{acciones}</div>}
      </div>
    </div>,
    document.body,
  );
}
