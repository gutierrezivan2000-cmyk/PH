"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Chevron } from "./Iconos";
import { unir } from "./util";

export type ItemMenu = {
  etiqueta: ReactNode;
  /** Acción. Se llama después de cerrar el menú. */
  alElegir?: () => void;
  /** O navegación a una ruta existente. */
  href?: string;
  /** Destructivo: va al final, tras filete de 2 px, en --danger-text. Debe abrir un modal de confirmación. */
  peligro?: boolean;
  /** Nota de 13 px a la derecha («pide confirmación»). */
  nota?: ReactNode;
  deshabilitado?: boolean;
};

/**
 * Menú «Más ▾» (SPEC §f.19, §f.7): acompaña a la acción principal de una fila.
 * role="menu", flechas ↑ ↓, Inicio/Fin, Escape devuelve el foco al disparador,
 * clic fuera cierra. En móvil se despliega en el flujo, a ancho completo
 * (el contenedor de acciones debe permitir salto de línea: <AccionesFila>).
 *
 *   <MenuMas etiquetaAccesible="Más acciones · unidad 102" items={[
 *     { etiqueta: "Abrir el portal de la unidad", href: `/u/${token}` },
 *     { etiqueta: "Enviar enlace por correo", alElegir: enviar },
 *     { etiqueta: "Desactivar portal…", nota: "pide confirmación", peligro: true, alElegir: () => setConfirmar(u) },
 *   ]} />
 */
export function MenuMas({ items, etiqueta = "Más", etiquetaAccesible, className }: {
  items: ItemMenu[]; etiqueta?: ReactNode; etiquetaAccesible?: string; className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const envoltura = useRef<HTMLSpanElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);

  // Lo destructivo siempre al final.
  const ordenados = [...items.filter((i) => !i.peligro), ...items.filter((i) => i.peligro)];

  const elementos = () =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!abierto) return;
    elementos()[0]?.focus();
    const fuera = (e: PointerEvent) => {
      if (envoltura.current && !envoltura.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) disparador.current?.focus();
  };

  const teclado = (e: KeyboardEvent) => {
    const lista = elementos();
    const i = lista.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); lista[(i + 1) % lista.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); lista[(i - 1 + lista.length) % lista.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); lista[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); lista[lista.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); cerrar(); }
    else if (e.key === "Tab") { cerrar(false); }
  };

  return (
    <span className={unir("k-mas", className)} ref={envoltura}>
      <button
        ref={disparador}
        type="button"
        className="k-bt"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label={etiquetaAccesible}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !abierto) { e.preventDefault(); setAbierto(true); } }}
      >
        {etiqueta}<Chevron />
      </button>
      {abierto && (
        <span className="k-menu" id={id} role="menu" ref={menu} onKeyDown={teclado} aria-label={etiquetaAccesible}>
          {ordenados.map((it, n) => {
            const cls = it.peligro ? "peligro" : undefined;
            const cont = <>{it.etiqueta}{it.nota && <small>{it.nota}</small>}</>;
            if (it.href && !it.deshabilitado) {
              return (
                <Link key={n} href={it.href} role="menuitem" tabIndex={-1} className={cls} onClick={() => setAbierto(false)}>
                  {cont}
                </Link>
              );
            }
            return (
              <button key={n} type="button" role="menuitem" tabIndex={-1} className={cls}
                aria-disabled={it.deshabilitado || undefined}
                onClick={() => { if (it.deshabilitado) return; cerrar(false); it.alElegir?.(); }}>
                {cont}
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}
