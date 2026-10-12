/**
 * Validación de lo que escribe el usuario en formularios (perfil, tickets): tipo, recorte, largo y caracteres.
 *
 * Pura (sin base de datos) para poder probarla sola. Las rutas arman el objeto que guardan campo por campo con estas
 * funciones, así que lo que no se pide aquí nunca llega a la base aunque venga en el cuerpo (asignación masiva).
 */
export type Validado<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Largos máximos por campo, en caracteres. Generosos para el uso real; el tope evita filas y correos desmesurados. */
export const LIMITES = {
  nombre: 120,
  cargo: 100,
  telefono: 30,
  empresa: 160,
  ciudad: 120,
  url: 2048,
  asuntoTicket: 150,
  mensajeTicket: 5000,
} as const;

// Los caracteres de control (sobre todo el NUL) no caben en las columnas de texto de Postgres y rompían el guardado con un 500.
const CONTROL_EN_UNA_LINEA = /[\u0000-\u001f\u007f]/;
const CONTROL_EN_VARIAS_LINEAS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // deja pasar \t, \n y \r

export type OpcionesDeTexto = {
  /** Si es true, el texto vacío (tras recortar) se rechaza. Por omisión se acepta: sirve para borrar un campo. */
  obligatorio?: boolean;
  /** Si es true, admite saltos de línea (mensajes). Por omisión es de una sola línea (nombre, ciudad…). */
  variasLineas?: boolean;
};

/**
 * Texto recortado y acotado. `etiqueta` lleva el artículo («El nombre», «La ciudad») porque va al inicio del mensaje.
 * Rechaza lo que no sea texto (objetos, números, null, arreglos) en vez de convertirlo.
 */
export function textoAcotado(valor: unknown, etiqueta: string, max: number, opciones: OpcionesDeTexto = {}): Validado<string> {
  // Un campo que no vino es «falta», no «tipo equivocado».
  if (valor === undefined && opciones.obligatorio) return { ok: false, error: `${etiqueta} es obligatorio.` };
  if (typeof valor !== "string") return { ok: false, error: `${etiqueta} debe ser texto.` };
  const t = valor.trim();
  if (opciones.obligatorio && t.length === 0) return { ok: false, error: `${etiqueta} es obligatorio.` };
  if (t.length > max) return { ok: false, error: `${etiqueta} no puede pasar de ${max} caracteres.` };
  if ((opciones.variasLineas ? CONTROL_EN_VARIAS_LINEAS : CONTROL_EN_UNA_LINEA).test(t)) {
    return { ok: false, error: `${etiqueta} tiene caracteres no permitidos.` };
  }
  return { ok: true, valor: t };
}

// Solo los caracteres que admite una URL (RFC 3986: letras, dígitos, reservados y %). Las de Vercel Blob cumplen esto; lo que
// lo rompe (comillas, ángulos, espacios, barra invertida, unicode sin codificar) es justo lo que sirve para salirse de un
// atributo HTML (`<img src="…">` en correos y documentos) o esconder otra dirección.
const URL_SEGURA = /^[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+$/;

/**
 * URL https acotada. Vacía es válida (devuelve "") para poder quitar el valor. Rechaza http, javascript:, data:, URLs con
 * usuario/contraseña, direcciones sin dominio y las que pasan de `max`.
 */
export function urlHttps(valor: unknown, etiqueta: string, max: number = LIMITES.url): Validado<string> {
  if (typeof valor !== "string") return { ok: false, error: `${etiqueta} debe ser texto.` };
  const t = valor.trim();
  if (t === "") return { ok: true, valor: "" };
  if (t.length > max) return { ok: false, error: `${etiqueta} no puede pasar de ${max} caracteres.` };
  const invalida = { ok: false, error: `${etiqueta} debe ser una dirección https válida.` } as const;
  // `https:///x` y `https:/x` los normaliza el navegador a otro destino; se exige la forma canónica https://dominio…
  if (!URL_SEGURA.test(t) || !/^https:\/\/[^/?#]/i.test(t)) return invalida;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return invalida;
  }
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return invalida;
  return { ok: true, valor: t };
}

/** Color en hexadecimal de 6 dígitos (#1a2b3c). Vacío es válido (devuelve "") para quitarlo. */
export function colorHex(valor: unknown, etiqueta: string): Validado<string> {
  if (typeof valor !== "string") return { ok: false, error: `${etiqueta} debe ser texto.` };
  const t = valor.trim();
  if (t === "") return { ok: true, valor: "" };
  if (!/^#[0-9a-fA-F]{6}$/.test(t)) return { ok: false, error: `${etiqueta} debe ser un color hexadecimal como #1a2b3c.` };
  return { ok: true, valor: t };
}

/** El cuerpo de la petición como objeto simple, o null si es otra cosa (arreglo, texto, null, JSON roto). */
export function cuerpoComoObjeto(crudo: unknown): Record<string, unknown> | null {
  return crudo && typeof crudo === "object" && !Array.isArray(crudo) ? (crudo as Record<string, unknown>) : null;
}
