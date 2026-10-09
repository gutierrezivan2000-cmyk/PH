"use client";

import { useState } from "react";
import { Check, X, CircleAlert, ClipboardCheck } from "lucide-react";

export type AccionUI = {
  id: string;
  tipo: string;
  etiqueta: string;
  resumen: string;
  propiedad: string;
  estado: "pendiente" | "aprobada" | "rechazada" | "fallida";
  mensaje?: string | null;
};

const CSS = `
.acc-lista { display: grid; gap: 10px; margin: 12px 0 4px; }
.acc-tarjeta { border: 1px solid var(--line, rgba(128,128,128,.28)); border-radius: 14px; padding: 14px 16px; background: var(--surface-2, transparent); }
.acc-tarjeta[data-estado="pendiente"] { border-color: var(--accent, #7c3aed); }
.acc-cab { display: flex; align-items: center; gap: 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-3, #888); }
.acc-cab svg { width: 15px; height: 15px; flex: none; }
.acc-res { margin: 8px 0 0; font-size: 15px; line-height: 1.4; color: var(--ink, inherit); }
.acc-prop { margin: 4px 0 0; font-size: 12.5px; color: var(--ink-3, #888); }
.acc-pie { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.acc-btn { min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line, rgba(128,128,128,.4)); background: transparent; color: inherit; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.acc-btn svg { width: 15px; height: 15px; }
.acc-btn[data-p="1"] { background: var(--accent, #7c3aed); border-color: var(--accent, #7c3aed); color: #fff; }
.acc-btn:disabled { opacity: .55; cursor: default; }
.acc-btn:focus-visible { outline: 2px solid var(--accent, #7c3aed); outline-offset: 2px; }
.acc-estado { font-size: 13.5px; line-height: 1.4; }
.acc-estado[data-e="aprobada"] { color: var(--ok-text, #15803d); }
.acc-estado[data-e="fallida"] { color: var(--danger, #b91c1c); }
.acc-estado[data-e="rechazada"] { color: var(--ink-3, #888); }
@media (max-width: 520px) { .acc-btn { flex: 1 1 100%; justify-content: center; } }
`;

/**
 * Las tarjetas de lo que un agente PROPUSO hacer: la persona ve qué ocurriría y lo aprueba o lo rechaza. Aprobar ejecuta la acción en
 * el servidor (con las mismas reglas que el módulo); mientras tanto no ha pasado nada.
 */
export function TarjetasDeAcciones({ acciones, alCambiar }: { acciones: AccionUI[]; alCambiar: (id: string, parche: Partial<AccionUI>) => void }) {
  const [ocupada, setOcupada] = useState<string | null>(null);
  if (acciones.length === 0) return null;

  async function decidir(a: AccionUI, decision: "aprobar" | "rechazar") {
    setOcupada(a.id);
    try {
      const r = await fetch("/api/agents/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, decision }) });
      const d = await r.json().catch(() => ({}));
      const estado = (d.estado === "aprobada" || d.estado === "rechazada" || d.estado === "fallida" ? d.estado : d.estado === "ya_decidida" ? a.estado : "fallida") as AccionUI["estado"];
      alCambiar(a.id, { estado, mensaje: d.mensaje ?? (r.ok ? null : "No se pudo completar. Intenta de nuevo.") });
    } catch {
      alCambiar(a.id, { mensaje: "Error de red. Intenta de nuevo." });
    } finally {
      setOcupada(null);
    }
  }

  return (
    <section className="acc-lista" aria-label="Acciones propuestas por el agente">
      <style>{CSS}</style>
      {acciones.map((a) => (
        <article key={a.id} className="acc-tarjeta" data-estado={a.estado}>
          <p className="acc-cab">
            <ClipboardCheck aria-hidden="true" focusable="false" />
            {a.etiqueta}
          </p>
          <p className="acc-res">{a.resumen}</p>
          {a.propiedad && <p className="acc-prop">{a.propiedad}</p>}
          <div className="acc-pie">
            {a.estado === "pendiente" ? (
              <>
                <button type="button" className="acc-btn" data-p="1" disabled={ocupada === a.id} onClick={() => decidir(a, "aprobar")}>
                  <Check aria-hidden="true" focusable="false" />
                  {ocupada === a.id ? "Haciéndolo…" : "Aprobar y hacerlo"}
                </button>
                <button type="button" className="acc-btn" disabled={ocupada === a.id} onClick={() => decidir(a, "rechazar")}>
                  <X aria-hidden="true" focusable="false" />
                  Rechazar
                </button>
                {a.mensaje && <span className="acc-estado" data-e="fallida" role="alert">{a.mensaje}</span>}
              </>
            ) : (
              <span className="acc-estado" data-e={a.estado} role="status">
                {a.estado === "fallida" && <CircleAlert aria-hidden="true" focusable="false" style={{ width: 15, height: 15, verticalAlign: "-2px", marginRight: 4 }} />}
                {a.estado === "aprobada" ? `Hecho. ${a.mensaje ?? ""}` : a.estado === "rechazada" ? "Rechazada: no se hizo nada." : `No se pudo hacer. ${a.mensaje ?? ""}`}
              </span>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
