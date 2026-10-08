/**
 * Las funciones del producto que gastan IA, tal como se miden para precificar. Cada registro de consumo (`UsageRecord.type`)
 * es una de estas claves. Es puro: lo usan el registro, el panel de administración y las pruebas.
 *
 * Los nombres de las claves son los que ya existían en la base de datos (no se cambian: hay cupos que las cuentan).
 */

export type FuncionDeConsumo = {
  tipo: string;
  nombre: string;
  grupo: string;
  /** Qué es «una vez» de esta función, para decir cuánto cuesta cada una. */
  unidad: string;
  /** En estos registros, `tokens` guarda SEGUNDOS de audio (así los cuentan los cupos de transcripción). */
  tokensSonSegundos?: boolean;
};

export const TIPOS = {
  generacion: "generacion",
  informe: "informe",
  acta: "acta",
  lecturaDeImagenes: "generacion_lectura",
  audioEnGeneracion: "generacion_audio",
  requisitosDeActa: "requisitos_acta",
  correccion: "correccion",
  agenteChat: "agente_chat",
  agenteTitulo: "agente_titulo",
  agenteLectura: "agente_lectura",
  audioEnAgente: "transcription",
  soporte: "soporte_chat",
  cartaDeCobro: "carta_cobro",
  importarUnidades: "import_unidades",
  importarBitacora: "import_bitacora",
  comunicado: "comunicado_draft",
  portalAsistente: "asistente_reglamento",
  reunionAudio: "reunion_audio",
  reunionIa: "reunion_ia",
  reunionActa: "reunion_acta",
  reunionPregunta: "reunion_pregunta",
} as const;

export const FUNCIONES: Readonly<Record<string, FuncionDeConsumo>> = Object.fromEntries(
  ([
    [TIPOS.informe, "Generar: informe de gestión", "Documentos", "informe"],
    [TIPOS.acta, "Generar: acta", "Documentos", "acta"],
    [TIPOS.generacion, "Generar: informe y acta juntos (registros anteriores al detalle)", "Documentos", "generación"],
    [TIPOS.lecturaDeImagenes, "Lectura de imágenes subidas", "Documentos", "imagen"],
    [TIPOS.audioEnGeneracion, "Transcripción de audios subidos", "Documentos", "audio", true],
    [TIPOS.requisitosDeActa, "Revisión de requisitos del acta (Ley 675)", "Documentos", "revisión"],
    [TIPOS.correccion, "Corrección de un documento", "Documentos", "corrección"],
    [TIPOS.agenteChat, "Asistentes IA: mensajes", "Asistentes IA", "mensaje"],
    [TIPOS.agenteTitulo, "Asistentes IA: título del chat", "Asistentes IA", "título"],
    [TIPOS.agenteLectura, "Asistentes IA: lectura de imágenes adjuntas", "Asistentes IA", "imagen"],
    [TIPOS.audioEnAgente, "Asistentes IA: transcripción de audios", "Asistentes IA", "audio", true],
    [TIPOS.reunionAudio, "Reuniones: transcripción", "Reuniones", "reunión", true],
    [TIPOS.reunionIa, "Reuniones: resumen con IA", "Reuniones", "reunión"],
    [TIPOS.reunionActa, "Reuniones: acta", "Reuniones", "acta"],
    [TIPOS.reunionPregunta, "Reuniones: Preguntar", "Reuniones", "pregunta"],
    [TIPOS.cartaDeCobro, "Carta de cobro", "Gestión", "carta"],
    [TIPOS.importarUnidades, "Importar unidades", "Gestión", "importación"],
    [TIPOS.importarBitacora, "Importar bitácora (zonas comunes)", "Gestión", "importación"],
    [TIPOS.comunicado, "Borrador de comunicado", "Gestión", "borrador"],
    [TIPOS.portalAsistente, "Portal de residentes: asistente del reglamento", "Portal de residentes", "respuesta"],
    [TIPOS.soporte, "Chat de soporte", "Soporte", "mensaje"],
  ] as Array<[string, string, string, string, boolean?]>).map(([tipo, nombre, grupo, unidad, segundos]) => [
    tipo,
    { tipo, nombre, grupo, unidad, ...(segundos ? { tokensSonSegundos: true } : {}) },
  ]),
);

/** La función de un tipo; uno que no está en el catálogo se muestra con su clave, en «Otros». */
export const funcionDe = (tipo: string): FuncionDeConsumo => FUNCIONES[tipo] ?? { tipo, nombre: tipo, grupo: "Otros", unidad: "operación" };
