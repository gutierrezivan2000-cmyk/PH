/**
 * Content-Security-Policy de la aplicación: dos cabeceras construidas por funciones puras (se prueban sin arrancar Next) y aplicadas
 * en next.config.ts.
 *
 *  1. FORZADA: solo directivas que NO pueden romper el pintado de ninguna página (nada que decida de dónde se cargan scripts,
 *     estilos, imágenes o conexiones). Bloquea el embebido en marcos, los plugins, el cambio de <base> y el envío de formularios a
 *     sitios ajenos.
 *  2. ESTRICTA, en modo solo-informe (Report-Only): la política completa que querríamos forzar. El navegador NO bloquea nada, solo
 *     avisa a /api/csp-report de lo que bloquearía. Se deja un tiempo para ver qué servicios externos usa la aplicación de verdad
 *     y, cuando los informes salgan limpios, se promueve a forzada.
 *
 * Los orígenes salen de recorrer el código (no se adivinaron):
 *  - Google Fonts: <link> en app/layout.tsx y @import en app/page.tsx → hojas en fonts.googleapis.com, archivos en fonts.gstatic.com.
 *  - ePayco: checkout.js se carga con next/script (dashboard/suscripcion) y a mano (u/[token]/PortalPay.tsx) desde
 *    checkout.epayco.co; el modal de pago es un iframe de ePayco (external: "false"); y dashboard/epayco/response consulta
 *    secure.epayco.co desde el navegador. Los subdominios que pida checkout.js por dentro no se pudieron comprobar sin salida a
 *    internet: se admite *.epayco.co y los informes dirán si falta algo más.
 *  - Vercel Blob: @vercel/blob/client sube los archivos desde el navegador. Las peticiones van a https://vercel.com/api/blob/
 *    (`/?pathname=…` y `/mpu`, de ahí la barra final: en CSP, una ruta sin barra final solo coincide EXACTA). Los archivos se leen
 *    de <tienda>.public|private.blob.vercel-storage.com (el comodín cubre ambos). Las grabaciones se reproducen con blob: del propio
 *    navegador y las vistas previas de adjuntos también (createObjectURL).
 *  - Cloudflare Turnstile (challenges.cloudflare.com): su cargador (src/lib/turnstile-cliente.ts) añade el script api.js con
 *    `document.createElement("script")`, y el widget pone un iframe y consulta al mismo host: script-src, frame-src y connect-src.
 *  - Google (accounts.google.com): el inicio de sesión es una NAVEGACIÓN hecha por JavaScript (signIn de next-auth/react hace un
 *    fetch a nuestro propio /api/auth/signin/google y luego `window.location.href = url`), que ninguna directiva de CSP restringe.
 *    Se admite en form-action solo por si el formulario nativo de Auth.js (sin JavaScript) responde con un 302 a Google: Chrome
 *    comprueba form-action también contra las redirecciones de un formulario.
 *  - Sin iframes propios, sin <object>/<embed>, sin Workers ni WebAssembly, sin eval en producción, sin analítica de terceros.
 */

/** Ruta que recibe los informes de violación (app/api/csp-report/route.ts). */
export const RUTA_INFORMES_CSP = "/api/csp-report";

const GOOGLE_FONTS_HOJAS = "https://fonts.googleapis.com";
const GOOGLE_FONTS_ARCHIVOS = "https://fonts.gstatic.com";
const GOOGLE_CUENTAS = "https://accounts.google.com";
const EPAYCO_CHECKOUT = "https://checkout.epayco.co";
const EPAYCO_TODOS = "https://*.epayco.co";
const CLOUDFLARE_TURNSTILE = "https://challenges.cloudflare.com";
/** API de subida de Vercel Blob. La barra final es a propósito (ver el comentario de arriba). */
const BLOB_API = "https://vercel.com/api/blob/";
/** Almacenes de Vercel Blob: <tienda>.public.blob… y <tienda>.private.blob… (el comodín cubre varios niveles). */
const BLOB_ALMACENES = "https://*.blob.vercel-storage.com";

export type EntornoCsp = {
  /**
   * true solo con `next dev`: React usa eval para reconstruir las trazas de error del servidor en el navegador. En producción ni
   * React ni Next usan eval, así que `'unsafe-eval'` no debe estar nunca.
   */
  desarrollo: boolean;
};

type Directivas = Array<[nombre: string, valores: readonly string[]]>;

/** «nombre v1 v2; nombre v1…». Una directiva sin valores (p. ej. upgrade-insecure-requests) queda solo con el nombre. */
function serializar(directivas: Directivas): string {
  return directivas.map(([nombre, valores]) => (valores.length ? `${nombre} ${valores.join(" ")}` : nombre)).join("; ");
}

/** Adónde se pueden enviar los formularios del propio documento (ver la nota de Google arriba). */
const DESTINOS_FORMULARIO = ["'self'", GOOGLE_CUENTAS, EPAYCO_TODOS] as const;

/**
 * Dónde informar de las violaciones: `report-uri`, que entienden todos los navegadores (Chrome, Firefox, Safari) y se comprobó de
 * punta a punta en un Chromium real. NO se añade `report-to` (+ cabecera Reporting-Endpoints): un navegador que lo entiende IGNORA
 * `report-uri` cuando están los dos, y la Reporting API solo entrega por HTTPS, así que no se pudo comprobar su entrega; si fallara,
 * Chrome (casi todo el tráfico) dejaría de informar. El endpoint ya acepta también su formato (application/reports+json) para
 * cuando se quiera añadir.
 */
const INFORMES: Directivas = [["report-uri", [RUTA_INFORMES_CSP]]];

/**
 * Directivas que no pueden romper el pintado: ninguna decide de dónde se cargan recursos.
 *  - object-src 'none': no hay <object>/<embed>/<applet> en la aplicación.
 *  - base-uri 'self': nadie puede cambiar el <base> para redirigir las rutas relativas.
 *  - frame-ancestors 'none': nadie puede embeber la aplicación (X-Frame-Options: DENY ya lo imponía; esto es lo mismo en CSP).
 *  - form-action: ver DESTINOS_FORMULARIO.
 */
const DIRECTIVAS_SEGURAS: Directivas = [
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
  ["form-action", DESTINOS_FORMULARIO],
];

/** Política FORZADA: solo las directivas seguras + dónde informar si algo se bloqueara. */
export function construirCspForzada(): string {
  return serializar([...DIRECTIVAS_SEGURAS, ...INFORMES]);
}

/**
 * Política ESTRICTA (para la cabecera Report-Only): las directivas seguras + el control de cada tipo de recurso.
 *
 * `'unsafe-inline'` en script-src y style-src es lo que hay que aceptar mientras Next inyecte los scripts de hidratación en línea y
 * la aplicación pinte estilos en línea (React `style=`, <style> por pantalla); quitarlo exige nonces por petición, que obligan a
 * renderizar todo de forma dinámica. Es un siguiente paso, no este.
 */
export function construirCspEstricta(entorno: EntornoCsp): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(entorno.desarrollo ? ["'unsafe-eval'"] : []), CLOUDFLARE_TURNSTILE, EPAYCO_CHECKOUT];
  return serializar([
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'", GOOGLE_FONTS_HOJAS]],
    ["font-src", ["'self'", "data:", GOOGLE_FONTS_ARCHIVOS]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "blob:", BLOB_ALMACENES]],
    ["connect-src", ["'self'", BLOB_API, BLOB_ALMACENES, EPAYCO_TODOS, CLOUDFLARE_TURNSTILE]],
    ["frame-src", [EPAYCO_TODOS, CLOUDFLARE_TURNSTILE]],
    ...DIRECTIVAS_SEGURAS,
    ...INFORMES,
  ]);
}

export type CabeceraHttp = { key: string; value: string };

/** Las dos cabeceras de CSP para next.config.ts: la forzada y la estricta en modo solo-informe. */
export function construirCabecerasCsp(entorno: EntornoCsp): CabeceraHttp[] {
  return [
    { key: "Content-Security-Policy", value: construirCspForzada() },
    { key: "Content-Security-Policy-Report-Only", value: construirCspEstricta(entorno) },
  ];
}

// ── Informes de violación ───────────────────────────────────────────────────────────────────────────────────────────────────
// Todo lo que llega a /api/csp-report lo escribe quien quiera (cualquiera puede hacer un POST): se trata como hostil. En el log solo
// entra lo que pasa estos filtros: directiva (letras y guiones), host (sin ruta, consulta, fragmento ni credenciales) y modo.

export type ViolacionCsp = {
  directiva: string;
  /** Solo el host (con puerto si lo lleva) o una palabra clave del navegador: inline, eval, data, blob, self… */
  bloqueado: string;
  /** true si la política que se violó era la forzada (no la de solo-informe): es lo que más importa vigilar. */
  forzada: boolean;
};

export const MAX_BYTES_INFORME = 8 * 1024;
const MAX_VIOLACIONES_POR_PETICION = 20;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function limpiarDirectiva(v: unknown): string {
  // «img-src 'self' data:» → «img-src». Cualquier otra cosa no se confía.
  const primera = texto(v).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return /^[a-z][a-z-]{0,39}$/.test(primera) ? primera : "desconocida";
}

/** Host de la URL bloqueada, sin ruta, consulta, fragmento ni credenciales (en ellas viajan tokens). */
export function hostBloqueado(v: unknown): string {
  const crudo = texto(v).trim();
  if (!crudo) return "vacio";
  // Palabras clave que el navegador pone en lugar de una URL.
  if (/^[a-z][a-z-]{0,23}$/i.test(crudo)) return crudo.toLowerCase();
  try {
    const url = new URL(crudo);
    const base = url.host || url.protocol.replace(/:$/, "");
    const limpio = base.toLowerCase().replace(/[^a-z0-9.:*-]/g, "").slice(0, 100);
    return limpio || "desconocido";
  } catch {
    return "invalido";
  }
}

function desdeCuerpo(cuerpo: Record<string, unknown>, nombreEfectiva: string, nombreViolada: string, nombreBloqueada: string): ViolacionCsp {
  const directiva = limpiarDirectiva(cuerpo[nombreEfectiva] || cuerpo[nombreViolada]);
  return {
    directiva,
    bloqueado: hostBloqueado(cuerpo[nombreBloqueada]),
    // `disposition` es «enforce» para la política forzada y «report» para la de solo-informe. Si falta, se supone informe.
    forzada: texto(cuerpo.disposition).toLowerCase() === "enforce",
  };
}

/**
 * Violaciones contenidas en el cuerpo de un informe, en cualquiera de los dos formatos:
 *  - `application/csp-report` (report-uri): `{"csp-report": {"blocked-uri": …, "effective-directive": …}}`.
 *  - `application/reports+json` (report-to): `[{"type": "csp-violation", "body": {"blockedURL": …, "effectiveDirective": …}}]`.
 * Devuelve [] si el JSON no es válido o no trae nada reconocible. Nunca lanza.
 */
export function extraerViolaciones(cuerpoCrudo: string): ViolacionCsp[] {
  let json: unknown;
  try {
    json = JSON.parse(cuerpoCrudo);
  } catch {
    return [];
  }
  const resultado: ViolacionCsp[] = [];
  if (Array.isArray(json)) {
    for (const informe of json.slice(0, MAX_VIOLACIONES_POR_PETICION)) {
      if (!esObjeto(informe) || informe.type !== "csp-violation" || !esObjeto(informe.body)) continue;
      resultado.push(desdeCuerpo(informe.body, "effectiveDirective", "violatedDirective", "blockedURL"));
    }
  } else if (esObjeto(json) && esObjeto(json["csp-report"])) {
    resultado.push(desdeCuerpo(json["csp-report"], "effective-directive", "violated-directive", "blocked-uri"));
  }
  return resultado;
}

/**
 * UNA sola línea de log por petición: la primera violación y, si venían más, cuántas. Sin saltos de línea ni nada que no haya pasado
 * por los filtros de arriba. `null` si no había ninguna violación reconocible.
 */
export function lineaDeInforme(violaciones: readonly ViolacionCsp[]): string | null {
  const primera = violaciones[0];
  if (!primera) return null;
  const mas = violaciones.length > 1 ? ` (+${violaciones.length - 1} más)` : "";
  return `[csp-report] directiva=${primera.directiva} bloqueado=${primera.bloqueado} modo=${primera.forzada ? "forzada" : "informe"}${mas}`;
}
