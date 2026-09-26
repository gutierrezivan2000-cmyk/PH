"use client";

import { useId, useState, type DragEvent, type ReactNode } from "react";
import { TipoArchivo } from "./Estado";
import { Cruz } from "./Iconos";
import { BarraProgreso } from "./Progreso";
import { tipoDeArchivo, unir } from "./util";

/**
 * Zona de subida (SPEC §f.11): hoja --surface-1 con MARCAS DE CORTE en las
 * cuatro esquinas, frase grande, línea de ayuda, formatos y flecha. Es un
 * <label> de un <input type="file"> visualmente oculto pero enfocable: se
 * usa con teclado (Tab + Enter/Espacio) y acepta arrastrar y soltar.
 * `compacta` = versión pequeña (documentos de Propiedades, logo en Configuración).
 *
 *   <ZonaSubida titulo="Suelta aquí los archivos del mes"
 *     texto="o haz clic para elegirlos. Solo alimentan el informe de gestión."
 *     formatos="PDF, Word, Excel e imágenes · hasta 20 archivos · audios de hasta 200 MB"
 *     multiple accept=".pdf,.docx,.xlsx,image/*,audio/*" alElegir={files => subir(files)} />
 */
export function ZonaSubida({
  titulo, texto, formatos, accept, multiple, alElegir, deshabilitado, compacta, className, etiquetaAccesible,
}: {
  titulo: ReactNode; texto?: ReactNode; formatos?: ReactNode;
  accept?: string; multiple?: boolean; alElegir: (archivos: File[]) => void;
  deshabilitado?: boolean; compacta?: boolean; className?: string;
  /** Nombre del control para lectores de pantalla si `titulo` no es texto plano. */
  etiquetaAccesible?: string;
}) {
  const id = useId();
  const [arrastrando, setArrastrando] = useState(false);
  const soltar = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setArrastrando(false);
    if (deshabilitado) return;
    const lista = Array.from(e.dataTransfer.files ?? []);
    if (lista.length) alElegir(multiple ? lista : lista.slice(0, 1));
  };
  return (
    <label
      htmlFor={id}
      className={unir("k-zona", compacta && "k-compacta", className)}
      data-arrastrando={arrastrando || undefined}
      aria-disabled={deshabilitado || undefined}
      onDragOver={(e) => { e.preventDefault(); if (!deshabilitado) setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
    >
      <i /><i /><i /><i />
      <b>{titulo}</b>
      {texto && <span>{texto}</span>}
      {formatos && <small>{formatos}</small>}
      <svg className="flecha" viewBox="0 0 48 60" aria-hidden="true" focusable="false"><path d="M24 56V8M6 26L24 8l18 18" /></svg>
      <input
        id={id}
        type="file"
        className="k-sr"
        accept={accept}
        multiple={multiple}
        disabled={deshabilitado}
        aria-label={etiquetaAccesible}
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          if (lista.length) alElegir(lista);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Lista de archivos bajo la zona (filete de 2 px arriba). Pasa <FilaArchivo> como hijos. */
export function ListaArchivos({ children, etiqueta = "Archivos subidos" }: { children: ReactNode; etiqueta?: string }) {
  return <ul className="k-archivos" aria-label={etiqueta}>{children}</ul>;
}

/**
 * Fila de archivo: tipo (mono con borde) · nombre (se parte, no se trunca) +
 * peso · barra de 8 px · estado · botón «×» de 44 px.
 * estado "error": fondo --danger-pale que sangra medio medianil, raya
 * discontinua en vez de barra, y `mensaje` concreto en lugar del peso.
 *
 *   <FilaArchivo nombre="Estados financieros agosto 2026.xlsx" detalle={pesoLegible(f.size)} estado="listo" alQuitar={…} />
 *   <FilaArchivo nombre="Nota de voz.m4a" detalle="18,4 MB" estado="subiendo" progreso={64} alQuitar={cancelar} etiquetaQuitar="Cancelar la subida de Nota de voz" />
 *   <FilaArchivo nombre="Foto.heic" estado="error" mensaje="Formato no admitido: expórtala como JPG y súbela de nuevo." alQuitar={…} />
 */
export function FilaArchivo({
  nombre, tipo, detalle, estado, progreso, mensaje, alQuitar, etiquetaQuitar,
}: {
  nombre: string; tipo?: string; detalle?: ReactNode;
  estado: "listo" | "subiendo" | "espera" | "error";
  /** 0–100, solo con estado "subiendo". */
  progreso?: number;
  mensaje?: ReactNode;
  alQuitar?: () => void;
  etiquetaQuitar?: string;
}) {
  const pct = estado === "listo" ? 100 : Math.max(0, Math.min(100, Math.round(progreso ?? 0)));
  const est =
    estado === "listo" ? <><i className="k-cuadro ok" aria-hidden="true" />Listo</>
    : estado === "error" ? <><i className="k-cuadro venc" aria-hidden="true" />Error</>
    : estado === "espera" ? <><i className="k-cuadro pend" aria-hidden="true" />En espera</>
    : <>Subiendo · {pct}&nbsp;%</>;
  return (
    <li className={unir("k-arch", estado === "error" && "error")}>
      <TipoArchivo>{tipo ?? tipoDeArchivo(nombre)}</TipoArchivo>
      <span className="nom">
        <b>{nombre}</b>
        {estado === "error" && mensaje ? <span>{mensaje}</span> : detalle && <span>{detalle}</span>}
      </span>
      <BarraProgreso valor={estado === "error" ? 0 : pct} etiqueta={`Progreso de ${nombre}`} decorativa={estado !== "subiendo"} />
      <span className={unir("est", estado === "listo" && "ok")} aria-live={estado === "subiendo" ? "polite" : undefined}>{est}</span>
      {alQuitar ? (
        <button type="button" className="x" onClick={alQuitar} aria-label={etiquetaQuitar ?? `Quitar ${nombre}`} title={etiquetaQuitar ?? `Quitar ${nombre}`}>
          <Cruz />
        </button>
      ) : <span />}
    </li>
  );
}
