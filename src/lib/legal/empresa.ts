/**
 * Datos del responsable de la plataforma y versión vigente de los documentos legales.
 *
 * `razonSocial`, `nit` y `domicilio` están en null a propósito: son datos que solo puede poner el titular del negocio
 * (los exige la Ley 1581 de 2012 y el Estatuto del Consumidor para identificar al responsable). Mientras sean null las
 * páginas no los muestran; en cuanto se escriban aquí, aparecen en los Términos, la Política de Privacidad y el
 * Habeas Data sin tocar nada más.
 */
export const EMPRESA = {
  marca: "SOPH.IA",
  razonSocial: null as string | null,
  nit: null as string | null,
  domicilio: null as string | null,
  correoLegal: "soporte@sophiagrouph.com",
} as const;

/**
 * Versión vigente de Términos, Privacidad, Habeas Data, Cookies, Reuniones y Encargado.
 * Cambiarla pide a cada persona volver a aceptar (aviso en el panel). Formato AAAA-MM-DD.
 */
export const LEGAL_VERSION = "2026-10-09";
export const LEGAL_FECHA_TEXTO = "9 de octubre de 2026";

/** Documentos públicos, en el orden en que se muestran en el índice y en los pies de página. */
export const DOCUMENTOS_LEGALES = [
  { ruta: "/legal/terminos", titulo: "Términos y Condiciones de Uso", resumen: "Las reglas del servicio: cuentas, planes, pagos, uso aceptable, IA y responsabilidad." },
  { ruta: "/legal/privacidad", titulo: "Política de Privacidad", resumen: "Qué datos recogemos, para qué, con quién los compartimos y por cuánto tiempo." },
  { ruta: "/legal/habeas-data", titulo: "Tratamiento de Datos Personales (Habeas Data)", resumen: "Tus derechos como titular y cómo ejercerlos (Ley 1581 de 2012)." },
  { ruta: "/legal/reuniones", titulo: "Reuniones: grabación, transcripción y consentimiento", resumen: "Qué debes informar a los asistentes y qué hacemos con el audio." },
  { ruta: "/legal/encargado", titulo: "Acuerdo de Encargado del Tratamiento", resumen: "Cómo tratamos los datos de residentes y terceros que cargas en la plataforma." },
  { ruta: "/legal/ia", titulo: "Uso de Inteligencia Artificial", resumen: "Alcance, límites y proveedores de los documentos asistidos por IA." },
  { ruta: "/legal/cookies", titulo: "Política de Cookies y almacenamiento local", resumen: "Qué guardamos en tu navegador y por qué." },
] as const;
