/**
 * Dirección pública de la aplicación, para enlaces en correos, retornos de pago y callbacks.
 *
 * Orden: NEXT_PUBLIC_APP_URL → dominio de producción de Vercel → URL del despliegue. Solo en desarrollo se
 * cae en localhost: en producción un enlace de recuperación de contraseña o un retorno de pago que apuntara
 * a localhost dejaría al usuario en una página muerta (y el enlace de pago, sin confirmar). Prefiero fallar
 * a gritos antes que mandar ese correo.
 */
type Entorno = Record<string, string | undefined>;

function normalizar(url: string): string {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`URL de la aplicación inválida: ${u.protocol}`);
  return `${u.protocol}//${u.host}`;
}

export function urlBase(env: Entorno = process.env): string {
  const explicita = env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicita) return normalizar(explicita);

  const dominio = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  if (dominio) return normalizar(`https://${dominio.replace(/^https?:\/\//, "")}`);

  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    throw new Error("Falta NEXT_PUBLIC_APP_URL: no se puede armar un enlace público en producción.");
  }
  return "http://localhost:3000";
}
