"use client";

import { CircleAlert, CircleCheck, Clock, CloudUpload, LoaderCircle, Upload, X, type LucideIcon } from "lucide-react";
import { useId, useState, type DragEvent, type ReactNode } from "react";
import { TipoArchivo } from "./Estado";
import { Loseta } from "./Loseta";
import type { Tono } from "./modulos";
import { BarraProgreso } from "./Progreso";
import { tipoDeArchivo, unir } from "./util";

/**
 * Zona de subida: recuadro de borde discontinuo violeta con una ficha de icono ↑,
 * frase grande, línea de ayuda y formatos. Es un <label> de un <input type="file">
 * visualmente oculto pero enfocable: se usa con teclado (Tab + Enter/Espacio) y
 * acepta arrastrar y soltar. `compacta` = versión pequeña (documentos de
 * Propiedades, logo en Configuración). `icono` y `tono` cambian la ficha.
 *
 *   <ZonaSubida titulo="Suelta aquí los archivos del mes"
 *     texto="o haz clic para elegirlos. Solo alimentan el informe de gestión."
 *     formatos="PDF, Word, Excel e imágenes · hasta 20 archivos · audios de hasta 200 MB"
 *     multiple accept=".pdf,.docx,.xlsx,image/*,audio/*" alElegir={files => subir(files)} />
 */
export function ZonaSubida({
  titulo, texto, formatos, accept, multiple, alElegir, deshabilitado, compacta, className, etiquetaAccesible, icono, tono,
}: {
  titulo: ReactNode; texto?: ReactNode; formatos?: ReactNode; icono?: LucideIcon; tono?: Tono;
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
      <Loseta icono={icono ?? Upload} tono={tono ?? "violet"} />
      <b>{titulo}</b>
      {texto && <span>{texto}</span>}
      {formatos && <small>{formatos}</small>}
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

/** Lista de archivos bajo la zona. Pasa <FilaArchivo> como hijos. */
export function ListaArchivos({ children, etiquetaAccesible = "Archivos subidos" }: { children: ReactNode; etiquetaAccesible?: string }) {
  return <ul className="k-archivos" aria-label={etiquetaAccesible}>{children}</ul>;
}

const ESTADOS_ARCHIVO: Record<"anadido" | "listo" | "subiendo" | "espera" | "error", { est: string; Icono: LucideIcon; tono: Tono }> = {
  listo: { est: "Listo", Icono: CircleCheck, tono: "green" },
  error: { est: "Error", Icono: CircleAlert, tono: "red" },
  espera: { est: "En espera", Icono: Clock, tono: "slate" },
  anadido: { est: "Por subir", Icono: CloudUpload, tono: "sky" },
  subiendo: { est: "Subiendo", Icono: LoaderCircle, tono: "blue" },
};

/**
 * Fila de archivo: tipo (etiqueta de su color) · nombre (se parte, no se trunca) +
 * peso · barra de progreso · estado con icono y color · botón «×».
 * estado "error": fondo rojo suave, raya discontinua en vez de barra, y `mensaje`
 * concreto en lugar del peso.
 *
 *   <FilaArchivo nombre="Estados financieros agosto 2026.xlsx" detalle={pesoLegible(f.size)} estado="listo" alQuitar={…} />
 *   <FilaArchivo nombre="Nota de voz.m4a" detalle="18,4 MB" estado="subiendo" progreso={64} alQuitar={cancelar} etiquetaQuitar="Cancelar la subida de Nota de voz" />
 *   <FilaArchivo nombre="Foto.heic" estado="error" mensaje="Formato no admitido: expórtala como JPG y súbela de nuevo." alQuitar={…} />
 */
export function FilaArchivo({
  nombre, tipo, detalle, estado, progreso, mensaje, alQuitar, etiquetaQuitar,
}: {
  nombre: string; tipo?: string; detalle?: ReactNode;
  /**
   * "anadido": el archivo está elegido pero todavía NO se ha subido (se sube al
   * enviar el formulario). No usar "listo" para eso: «Listo» con la barra llena
   * afirmaría una subida que aún no ocurrió.
   */
  estado: "anadido" | "listo" | "subiendo" | "espera" | "error";
  /** 0–100, solo con estado "subiendo". */
  progreso?: number;
  mensaje?: ReactNode;
  alQuitar?: () => void;
  etiquetaQuitar?: string;
}) {
  const pct = estado === "listo" ? 100 : Math.max(0, Math.min(100, Math.round(progreso ?? 0)));
  const { est, Icono, tono } = ESTADOS_ARCHIVO[estado];
  const rotulo = estado === "subiendo" ? <>Subiendo · {pct}&nbsp;%</> : est;
  return (
    <li className={unir("k-arch", estado === "error" && "error")}>
      <TipoArchivo>{tipo ?? tipoDeArchivo(nombre)}</TipoArchivo>
      <span className="nom">
        <b>{nombre}</b>
        {estado === "error" && mensaje ? <span>{mensaje}</span> : detalle && <span>{detalle}</span>}
      </span>
      <BarraProgreso valor={estado === "error" || estado === "anadido" ? 0 : pct} etiquetaAccesible={`Progreso de ${nombre}`} decorativa={estado !== "subiendo"} />
      <span className={unir("est", estado === "listo" && "ok")} data-h={tono} aria-live={estado === "subiendo" ? "polite" : undefined}>
        <Icono aria-hidden="true" focusable="false" className={estado === "subiendo" ? "k-spin" : undefined} />{rotulo}
      </span>
      {alQuitar ? (
        <button type="button" className="x" onClick={alQuitar} aria-label={etiquetaQuitar ?? `Quitar ${nombre}`} title={etiquetaQuitar ?? `Quitar ${nombre}`}>
          <X aria-hidden="true" focusable="false" />
        </button>
      ) : <span />}
    </li>
  );
}
