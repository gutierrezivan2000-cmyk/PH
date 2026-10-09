"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Aviso } from "@/components/kit";

/**
 * Aviso para quienes ya tenían cuenta antes de los documentos legales actuales (o cuando cambian):
 * muestra los enlaces y un botón «Entiendo y acepto» que guarda la fecha y la versión en su cuenta.
 * No bloquea el trabajo; desaparece al aceptar.
 */
export function AvisoLegal() {
  const [pendiente, setPendiente] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    fetch("/api/legal/aceptacion")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => activo && d && setPendiente(Boolean(d.debeAceptar)))
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, []);

  if (!pendiente) return null;

  async function aceptar() {
    setError("");
    setGuardando(true);
    try {
      const r = await fetch("/api/legal/aceptacion", { method: "POST" });
      if (!r.ok) throw new Error();
      setPendiente(false);
    } catch {
      setError("No pudimos guardar tu aceptación. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ padding: "12px var(--pad) 0" }}>
      <Aviso
        enLinea
        rol={null}
        tipo="info"
        titulo="Actualizamos nuestros documentos legales."
        texto={
          <>
            Revisa los{" "}
            <Link href="/legal/terminos" target="_blank" style={{ textDecoration: "underline" }}>Términos</Link>, la{" "}
            <Link href="/legal/privacidad" target="_blank" style={{ textDecoration: "underline" }}>Privacidad</Link> y el{" "}
            <Link href="/legal/habeas-data" target="_blank" style={{ textDecoration: "underline" }}>Habeas Data</Link>; ahora
            incluyen Reuniones, el uso de IA y cookies. {error}
          </>
        }
        accion={{ etiqueta: guardando ? "Guardando…" : "Entiendo y acepto", alElegir: guardando ? undefined : aceptar }}
      />
    </div>
  );
}
