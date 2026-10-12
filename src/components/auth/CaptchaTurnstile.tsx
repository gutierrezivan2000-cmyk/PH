"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { cargarTurnstile, temaDelDocumento, type ApiTurnstile } from "@/lib/turnstile-cliente";

/** Alto del widget de Turnstile: se reserva desde el primer pintado para que al cargar no se mueva nada. */
const ALTO_WIDGET = 65;

export type ManejadorCaptcha = {
  /**
   * Pide un token nuevo. Hay que llamarlo después de cada intento que llegó al servidor y falló: el token de Turnstile sirve
   * UNA sola vez, y el que ya se mandó no vale para el siguiente intento.
   */
  reiniciar: () => void;
};

type Props = {
  /** NEXT_PUBLIC_TURNSTILE_SITE_KEY. El que lo usa solo lo monta si existe: sin llave no hay captcha. */
  siteKey: string;
  /** Recibe el token cuando la persona pasa la verificación, y null cuando se vence, falla o se reinicia. */
  onToken: (token: string | null) => void;
  ref?: Ref<ManejadorCaptcha>;
};

/**
 * Widget de Cloudflare Turnstile (modo explícito). El script se carga una sola vez (src/lib/turnstile-cliente.ts), el tema
 * sigue al de la aplicación y el alto va reservado. Si el script no se puede cargar (bloqueador de contenido, sin red) lo
 * dice y deja reintentar, en vez de dejar el botón de enviar bloqueado sin explicación.
 */
export function CaptchaTurnstile({ siteKey, onToken, ref }: Props) {
  const idEtiqueta = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const api = useRef<ApiTurnstile | null>(null);
  const idWidget = useRef<string | undefined>(undefined);
  // El padre puede pasar una función nueva en cada render: se lee desde aquí para no recrear el widget por eso.
  const alToken = useRef(onToken);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const [verificado, setVerificado] = useState(false);

  useEffect(() => {
    alToken.current = onToken;
  }, [onToken]);

  const entregar = (token: string | null) => {
    setVerificado(token !== null);
    alToken.current(token);
  };

  // Dibuja el widget (y lo quita al desmontar o al cambiar de llave / reintentar).
  useEffect(() => {
    let vivo = true;
    cargarTurnstile()
      .then((turnstile) => {
        if (!vivo || !contenedor.current) return;
        api.current = turnstile;
        idWidget.current = turnstile.render(contenedor.current, {
          sitekey: siteKey,
          theme: temaDelDocumento(document),
          size: "flexible",
          language: "es",
          callback: (token) => entregar(token),
          "expired-callback": () => entregar(null),
          "timeout-callback": () => entregar(null),
          "error-callback": () => entregar(null),
        });
      })
      .catch(() => {
        if (vivo) setFallo(true);
      });
    return () => {
      vivo = false;
      if (idWidget.current !== undefined) api.current?.remove(idWidget.current);
      idWidget.current = undefined;
      // Un token de un widget que ya no existe no vale para nada: que el botón vuelva a esperar uno nuevo.
      entregar(null);
    };
  }, [siteKey, intento]);

  useImperativeHandle(ref, () => ({
    reiniciar: () => {
      if (idWidget.current !== undefined) api.current?.reset(idWidget.current);
      entregar(null);
    },
  }));

  return (
    <div role="group" aria-labelledby={idEtiqueta}>
      <p id={idEtiqueta} className="mb-1.5" style={{ fontSize: 12, color: "var(--ink-3)" }}>
        Verificación de seguridad
      </p>
      <div ref={contenedor} style={{ minHeight: ALTO_WIDGET }} />
      {fallo ? (
        <p role="alert" className="mt-1.5" style={{ fontSize: 12, color: "var(--danger-text)", lineHeight: 1.5 }}>
          No pudimos cargar la verificación de seguridad. Revisa tu conexión o desactiva el bloqueador de contenido para este sitio y{" "}
          <button
            type="button"
            onClick={() => {
              setFallo(false);
              setIntento((n) => n + 1);
            }}
            className="cursor-pointer"
            style={{ color: "var(--accent-text)", textDecoration: "underline", background: "none", border: 0, padding: 0, font: "inherit" }}
          >
            vuelve a intentarlo
          </button>
          .
        </p>
      ) : (
        // Alto fijo: el texto cambia sin mover nada. aria-live avisa a quien usa lector de pantalla.
        <p
          aria-live="polite"
          className="mt-1.5"
          style={{ fontSize: 12, minHeight: 18, lineHeight: "18px", color: verificado ? "var(--ok-text)" : "var(--ink-3)" }}
        >
          {verificado ? "Verificación completada." : "Completa la verificación para continuar."}
        </p>
      )}
    </div>
  );
}
