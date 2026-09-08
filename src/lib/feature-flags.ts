/**
 * Funciones pausadas para el lanzamiento. El código de cada una sigue aquí
 * completo, probado y funcionando — esto solo oculta su interfaz y la
 * reemplaza por un aviso de "Próximamente" (ver ComingSoon.tsx). Reactivar
 * una función es cambiar su valor a `false` aquí, nada más: no hay que tocar
 * ninguna de las páginas ni sus rutas.
 *
 * Se usa a la vez en el Sidebar (insignia "Pronto") y en cada página (qué se
 * renderiza), para que ambos nunca queden desincronizados.
 */
export const COMING_SOON = {
  cartera: true,
  presupuesto: true,
  certificados: true,
  asambleas: true,
  comunicados: true,
  pqrs: true,
} as const;

export type ComingSoonKey = keyof typeof COMING_SOON;
