/**
 * Verificación opcional con Cloudflare Turnstile para los endpoints públicos que mandan correos (registro y recuperación de
 * contraseña). Sin TURNSTILE_SECRET_KEY la función queda APAGADA y todo se comporta como antes.
 *
 * Qué pasa cuando Cloudflare falla: se deja pasar (ok: true, con `motivo`) y se deja una línea en el log. Es a propósito: el
 * captcha es una capa extra; los límites por IP y por correo siguen aplicando, y una caída de Cloudflare no debe impedir que la
 * gente cree su cuenta o recupere su acceso. En cambio, si Cloudflare responde `success: false` el intento se rechaza.
 *
 * Nunca se escribe en el log ni la llave secreta ni el token (ni lo que devuelva Cloudflare más allá de los códigos de error).
 */
import { isIP } from "node:net";

export const URL_VERIFICACION_TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Lo que se le responde a quien no pasa la verificación. Lo comparten el registro y la recuperación de contraseña. */
export const MENSAJE_CAPTCHA_FALLIDO = "No pudimos verificar que eres una persona. Intenta de nuevo.";

/** Cuánto se espera a Cloudflare antes de darlo por caído. */
const ESPERA_MS = 4_000;
/** Turnstile documenta tokens de hasta 2048 caracteres: uno más largo no puede ser válido y no se manda. */
const LARGO_MAXIMO_TOKEN = 2048;

export type ResultadoCaptcha = {
  ok: boolean;
  /** true si no se verificó nada porque el captcha está apagado (sin TURNSTILE_SECRET_KEY). */
  omitido?: boolean;
  /** Por qué falló, o por qué se dejó pasar aun sin verificar. Es texto para el log: no se le muestra a la persona. */
  motivo?: string;
};

type RespuestaTurnstile = { success?: unknown; "error-codes"?: unknown };

/** Códigos que indican que la llave secreta de ESTE servidor está mal: no es culpa de quien intenta registrarse. */
const CODIGOS_DE_CONFIGURACION = new Set(["missing-input-secret", "invalid-input-secret"]);

const codigosDe = (cuerpo: RespuestaTurnstile): string[] =>
  Array.isArray(cuerpo["error-codes"]) ? cuerpo["error-codes"].filter((c): c is string => typeof c === "string").slice(0, 8) : [];

/** Cloudflare no respondió como debía: se deja pasar y se avisa en el log (sin datos sensibles). */
function dejarPasar(motivo: string): ResultadoCaptcha {
  console.error(`[captcha] ${motivo}; se deja pasar (los límites por IP y por correo siguen aplicando).`);
  return { ok: true, motivo };
}

export async function verificarCaptcha(token: unknown, ip?: string | null): Promise<ResultadoCaptcha> {
  // Se lee en cada llamada (no al cargar el módulo) para que un cambio de configuración o una prueba lo tome.
  const secreto = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secreto) return { ok: true, omitido: true };

  if (typeof token !== "string" || !token.trim()) return { ok: false, motivo: "falta el token del captcha" };
  if (token.length > LARGO_MAXIMO_TOKEN) return { ok: false, motivo: "token del captcha demasiado largo" };

  const datos = new URLSearchParams({ secret: secreto, response: token });
  // clientIp() devuelve «unknown» cuando no hay cabeceras: Cloudflare solo acepta una IP de verdad.
  const ipLimpia = ip?.trim();
  if (ipLimpia && isIP(ipLimpia)) datos.set("remoteip", ipLimpia);

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    const res = await fetch(URL_VERIFICACION_TURNSTILE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: datos,
      signal: control.signal,
      cache: "no-store",
    });
    if (!res.ok) return dejarPasar(`Cloudflare respondió HTTP ${res.status}`);

    const cuerpo = (await res.json().catch(() => null)) as RespuestaTurnstile | null;
    if (!cuerpo || typeof cuerpo !== "object" || typeof cuerpo.success !== "boolean") {
      return dejarPasar("Cloudflare respondió algo que no se pudo leer");
    }
    if (cuerpo.success) return { ok: true };

    const codigos = codigosDe(cuerpo);
    // Fallo del lado de Cloudflare (reintentable): equivale a una caída, no a un rechazo de la persona.
    if (codigos.includes("internal-error")) return dejarPasar("Cloudflare reportó internal-error");
    if (codigos.some((c) => CODIGOS_DE_CONFIGURACION.has(c))) {
      console.error(`[captcha] TURNSTILE_SECRET_KEY rechazada por Cloudflare (${codigos.join(", ")}): revisa la llave; mientras tanto nadie pasa la verificación.`);
    }
    return { ok: false, motivo: `Cloudflare rechazó el token${codigos.length ? ` (${codigos.join(", ")})` : ""}` };
  } catch (e) {
    // Solo el nombre del error: el mensaje de un fallo de red puede traer la URL o datos de la petición.
    const causa = e instanceof Error && e.name === "AbortError" ? `no respondió en ${ESPERA_MS / 1000} s` : `no se pudo contactar (${e instanceof Error ? e.name : "error"})`;
    return dejarPasar(`Cloudflare ${causa}`);
  } finally {
    clearTimeout(temporizador);
  }
}
