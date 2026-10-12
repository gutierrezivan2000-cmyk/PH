/**
 * Lado del navegador de Cloudflare Turnstile: lee la llave pública, carga el script UNA sola vez y da acceso a su API.
 * El widget es opcional: sin NEXT_PUBLIC_TURNSTILE_SITE_KEY las pantallas no lo muestran y se comportan como siempre.
 * (El servidor lo verifica en src/lib/captcha.ts, que a su vez solo actúa si hay TURNSTILE_SECRET_KEY.)
 */

/** `render=explicit`: el widget se dibuja a mano con turnstile.render() en el contenedor que se le indique. */
export const URL_API_TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const ID_SCRIPT = "cf-turnstile-api";
/** Si el script no carga ni falla en este tiempo se da por perdido (p. ej. una red que lo deja colgado). */
const ESPERA_CARGA_MS = 15_000;

export type OpcionesTurnstile = {
  sitekey: string;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "flexible" | "compact";
  language?: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "error-callback"?: () => void;
};

export type ApiTurnstile = {
  render: (contenedor: HTMLElement, opciones: OpcionesTurnstile) => string | undefined;
  reset: (idWidget?: string) => void;
  remove: (idWidget?: string) => void;
};

declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

/** La llave pública del sitio, o "" si no está configurada (el captcha queda apagado). */
export function siteKeyTurnstile(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
}

/** El tema que ya resolvió la aplicación (data-theme en <html>); sin él, el widget sigue al del sistema. */
export function temaDelDocumento(doc: Pick<Document, "documentElement">): "light" | "dark" | "auto" {
  const tema = doc.documentElement?.dataset?.theme;
  return tema === "light" || tema === "dark" ? tema : "auto";
}

let pendiente: Promise<ApiTurnstile> | null = null;

/**
 * Carga api.js una sola vez (aunque varias pantallas o montajes lo pidan a la vez) y devuelve la API. Si falla, rechaza y el
 * siguiente llamado vuelve a intentarlo desde cero.
 */
export function cargarTurnstile(doc: Document = document, win: Window = window): Promise<ApiTurnstile> {
  if (win.turnstile) return Promise.resolve(win.turnstile);
  if (pendiente) return pendiente;

  pendiente = new Promise<ApiTurnstile>((resolver, rechazar) => {
    let script = doc.getElementById(ID_SCRIPT) as HTMLScriptElement | null;
    const temporizador = win.setTimeout(() => fallar("tardó demasiado en cargar"), ESPERA_CARGA_MS);

    function fallar(motivo: string) {
      win.clearTimeout(temporizador);
      pendiente = null;
      script?.remove();
      rechazar(new Error(`No se pudo cargar Turnstile: ${motivo}`));
    }

    if (!script) {
      script = doc.createElement("script");
      script.id = ID_SCRIPT;
      script.src = URL_API_TURNSTILE;
      script.async = true;
      script.defer = true;
      doc.head.appendChild(script);
    }
    script.addEventListener("load", () => {
      win.clearTimeout(temporizador);
      if (win.turnstile) resolver(win.turnstile);
      else fallar("cargó pero no expuso la API");
    }, { once: true });
    script.addEventListener("error", () => fallar("el navegador no pudo descargarlo"), { once: true });
  });
  return pendiente;
}

/** Solo para las pruebas: olvida una carga en curso. */
export function olvidarCargaTurnstile(): void {
  pendiente = null;
}
