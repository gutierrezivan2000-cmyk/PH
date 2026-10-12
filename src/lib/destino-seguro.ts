/**
 * Solo rutas internas para volver tras iniciar sesión. Un enlace con callbackUrl=javascript:… o =https://sitio-ajeno llevaba,
 * tras entrar, a donde quisiera quien lo armó. Cualquier otro valor cae en la ruta por defecto.
 */
export function destinoSeguro(valor: string | null | undefined, porDefecto = "/dashboard"): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) return porDefecto;
  if (/[\u0000-\u001f\u007f]/.test(valor)) return porDefecto;
  return valor;
}
