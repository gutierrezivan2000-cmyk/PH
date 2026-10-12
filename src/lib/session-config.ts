import type { NextAuthConfig } from "next-auth";

/**
 * Vida de la sesión y de su cookie (parte pura de la configuración de NextAuth, para poder probarla sin arrancar Auth.js).
 *
 * La sesión es un JWT que viaja en una cookie, así que quien se lleve esa cookie entra hasta que caduque. Eran 30 días; ahora son
 * 7. La sesión es DESLIZANTE: cada vez que el navegador pregunta quién es (`/api/auth/session`, que dispara el SessionProvider al
 * abrir el panel o al volver a la pestaña) Auth.js firma el token de nuevo y renueva la cookie por otros 7 días. Quien usa la
 * aplicación no se entera; quien deja de usarla una semana tiene que volver a entrar.
 */

/** Cuánto vive la sesión sin actividad, en segundos (7 días). Vale para el token y para la cookie. */
export const SESION_MAX_AGE_SEG = 7 * 24 * 60 * 60;

/**
 * Cada cuánto se «renueva» la sesión, en segundos (24 h). Con estrategia JWT Auth.js NO usa este valor (solo lo lee la estrategia
 * de base de datos): el token se vuelve a firmar en cada lectura de la sesión, es decir, la renovación es aún más frecuente. Se
 * declara igualmente para dejar escrita la intención y para que el valor correcto ya esté si algún día cambia la estrategia.
 */
export const SESION_UPDATE_AGE_SEG = 24 * 60 * 60;

/**
 * ¿Pasó más de `maxAgeSeg` desde que se firmó este token por última vez?
 *
 * `iat` es la fecha de la última firma: se reescribe en cada renovación, así que equivale a «la última vez que esta persona usó la
 * aplicación». Los tokens nuevos ya llevan `exp = iat + 7 días` y Auth.js los rechaza solo; esta comprobación existe por los tokens
 * VIEJOS, emitidos con `exp = iat + 30 días`: sin ella, quien no volvió en 7 días seguiría dentro hasta 30 días después del
 * despliegue, y el recorte de plazo no valdría para las cookies que ya andan sueltas. La usa el callback `jwt` de auth.ts al
 * releer una sesión existente (no al iniciar sesión, donde el token es nuevo y no trae `iat`), y se puede retirar cuando hayan
 * pasado 30 días del despliegue. Si `iat` no es un número no decide nada (queda el `exp` de Auth.js): peor sería sacar a todos por
 * un token raro.
 */
export function vencidoPorInactividad(iat: unknown, ahoraMs: number, maxAgeSeg: number = SESION_MAX_AGE_SEG): boolean {
  if (typeof iat !== "number" || !Number.isFinite(iat)) return false;
  return ahoraMs - iat * 1000 > maxAgeSeg * 1000;
}

/** Nombre de la cookie de sesión: con prefijo `__Secure-` cuando es segura (el navegador solo la acepta por HTTPS). */
export function nombreCookieSesion(seguras: boolean): string {
  return seguras ? "__Secure-authjs.session-token" : "authjs.session-token";
}

/**
 * Cookies de Auth.js. Sin `COOKIE_DOMAIN` devuelve `undefined` y Auth.js usa sus valores por omisión, que ya son los correctos
 * (httpOnly, sameSite lax, secure + prefijos `__Secure-`/`__Host-` por HTTPS, cookie ligada solo al host). Con `COOKIE_DOMAIN`
 * redefine únicamente la de sesión para añadirle `domain`; el resto (CSRF, callback) sigue ligado al host.
 */
export function cookiesDeSesion(opciones: { cookieDomain?: string; seguras: boolean }): NextAuthConfig["cookies"] {
  const { cookieDomain, seguras } = opciones;
  if (!cookieDomain) return undefined;
  return {
    sessionToken: {
      name: nombreCookieSesion(seguras),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: seguras,
        domain: cookieDomain,
      },
    },
  };
}

/**
 * Texto del aviso que se escribe en el log del servidor cuando, en producción, `COOKIE_DOMAIN` está definida; `null` si no hay
 * nada que avisar. Una cookie con `Domain=.dominio` viaja a TODOS los subdominios, no solo a los de esta aplicación. Solo el
 * nombre del dominio (no es un secreto) y la variable; nunca el contenido de la cookie.
 */
export function avisoCookieDomain(cookieDomain: string | undefined, nodeEnv: string | undefined): string | null {
  if (!cookieDomain || nodeEnv !== "production") return null;
  return (
    `[AUTH] COOKIE_DOMAIN="${cookieDomain}" está definida: la cookie de sesión se envía a TODOS los subdominios de ese dominio ` +
    `(cualquier subdominio mal protegido o abandonado podría recibirla). Si no necesitas compartir la sesión entre la app y el ` +
    `admin, quita la variable: la cookie queda ligada solo al host. Ver docs/ADMIN_SETUP.md.`
  );
}
