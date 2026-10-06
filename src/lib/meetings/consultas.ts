/**
 * Selecciones de Prisma que comparten las rutas de reuniones, para que lista,
 * creación y edición devuelvan exactamente las mismas columnas.
 */

/** Lo que muestra la lista (sin la ficha ni las URLs privadas). */
export const SELECCION_RESUMEN = {
  id: true,
  propertyId: true,
  type: true,
  title: true,
  date: true,
  status: true,
  stage: true,
  progress: true,
  durationMs: true,
  errorMessage: true,
  property: { select: { name: true } },
} as const;

/** Lo que carga la página de una reunión. Las URLs viajan hasta el mapeador, que las descarta. */
export const INCLUIR_DETALLE = {
  property: { select: { name: true } },
  sources: true,
  speakers: true,
  markers: true,
} as const;
