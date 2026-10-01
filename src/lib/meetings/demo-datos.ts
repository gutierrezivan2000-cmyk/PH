/**
 * Reuniones de ejemplo para el modo demo (sin base de datos ni claves).
 *
 * «Reunión de consejo — septiembre» es una reunión COMPLETA y creíble de
 * 2 h 14 min con cinco voces, un receso, una votación, tres decisiones y seis
 * compromisos: sirve para probar de verdad la lectura, la búsqueda, los saltos
 * al minuto, los hablantes y el acta. Es un extracto (una intervención cada
 * pocos minutos), no una grabación literal.
 */
import type { Ficha, HablanteDTO, IntervencionDTO, MarcadorDTO, PersonaDTO, RangoMs } from "./dto";
import { leerReloj } from "./tipos";

type Voz = "V1" | "V2" | "V3" | "V4" | "H5";

/** Duración de la reunión de septiembre: 2 h 14 min. */
export const DURACION_SEPTIEMBRE_MS = 8_040_000;

/** [inicio «h:mm:ss», quién habla, lo que dice] */
const GUION: Array<[string, Voz, string]> = [
  // ── Quórum y orden del día ───────────────────────────────────────────
  ["0:00:05", "V1", "Buenas noches a todos. Siendo las siete de la noche damos inicio a la reunión ordinaria del consejo de administración del Conjunto Residencial Los Pinos. Le pido al administrador que verifique el quórum."],
  ["0:00:34", "V2", "Buenas noches. Verifico asistencia: está la presidente del consejo, Martha López; la consejera Carolina Ríos; el consejero Andrés Gómez; el revisor fiscal, Hernán Sierra, y yo como administrador. Hay quórum para deliberar y decidir."],
  ["0:01:12", "V1", "Perfecto, hay quórum. El orden del día que enviamos es: primero, informe de cartera y recaudo; segundo, mantenimiento de los ascensores; tercero, seguridad, cámaras y vigilancia; y cuarto, proposiciones y varios. ¿Alguna modificación?"],
  ["0:01:50", "V3", "Yo pediría agregar, dentro de proposiciones y varios, la convocatoria a la asamblea ordinaria, porque ya estamos a tiempo de definir la fecha."],
  ["0:02:17", "V1", "Claro, Carolina, la incluimos en varios. ¿Se aprueba el orden del día con esa adición? Entonces queda aprobado por unanimidad de los presentes."],

  // ── Cartera y recaudo ────────────────────────────────────────────────
  ["0:08:10", "V2", "Entro con el informe de cartera. A corte de este mes el recaudo de la cuota ordinaria fue del ochenta y nueve por ciento, tres puntos más que el mes pasado. La cartera total en mora asciende a ciento doce millones de pesos, de los cuales sesenta y cuatro millones corresponden a diez unidades con más de noventa días."],
  ["0:10:20", "V3", "¿Y esas diez unidades ya recibieron la carta de cobro y la citación a conciliación? Porque el año pasado se nos quedó un grupo sin gestionar y después se complicó."],
  ["0:11:05", "V2", "Siete ya tienen carta de cobro y acuerdo de pago firmado. A las otras tres les enviamos la segunda carta la semana pasada y estamos esperando respuesta; si no responden en quince días las pasamos al abogado para el proceso ejecutivo."],
  ["0:13:30", "V4", "Como revisor fiscal quiero dejar constancia de que la cartera de más de noventa días representa más de la mitad de la mora y que hay que provisionarla en los estados financieros. Les recomiendo hacer la provisión por deudas de difícil cobro antes del cierre."],
  ["0:15:40", "V1", "Tomamos nota, Hernán. Jorge, por favor pídele a la contadora el cálculo de la provisión para la próxima reunión."],
  ["0:16:25", "V2", "Listo, se lo solicito mañana a primera hora. Pasando a ingresos adicionales: el alquiler del salón social dejó cuatro millones doscientos mil pesos este trimestre, y los parqueaderos de visitantes, un millón ochocientos mil."],
  ["0:19:10", "V3", "Sobre el salón social, ¿ya ajustamos la tarifa? Me han dicho que el conjunto vecino cobra casi el doble por evento."],
  ["0:20:00", "V2", "Está pendiente. Puedo traer una comparación de tarifas y una propuesta de ajuste para la próxima reunión."],
  ["0:22:30", "V1", "Me parece bien. Dejémoslo como compromiso del administrador. Hernán, ¿algo más sobre el recaudo?"],
  ["0:23:10", "V4", "Solo que mantengan al día los extractos por unidad. En la última revisión encontré dos pagos mal aplicados; ya los corrigieron, pero conviene una conciliación mensual."],
  ["0:26:40", "V2", "La conciliación mensual ya está implementada; el reporte de septiembre les llega junto con el acta."],
  ["0:29:50", "V1", "Si no hay más preguntas sobre cartera, hacemos un receso de diez minutos y volvemos con los ascensores."],

  // ── Ascensores ───────────────────────────────────────────────────────
  ["0:41:05", "V1", "Retomamos. Pasamos al punto de los ascensores. Jorge, cuéntanos cómo va el contrato con Schindler."],
  ["0:41:40", "V2", "El contrato vence el treinta y uno de octubre. Schindler propone prorrogarlo doce meses con un ajuste del seis por ciento, que equivale a una cuota mensual de dos millones trescientos mil pesos. Tengo otra cotización de una empresa local por un millón novecientos mil, pero sin garantía de atender repuestos en menos de veinticuatro horas."],
  ["0:44:15", "V3", "Con el ascensor de la torre A hemos tenido tres fallas en dos meses. Si cambiamos de proveedor ahora y la transición se complica, los residentes nos lo van a cobrar. A mí me preocupa más el tiempo de respuesta que el precio."],
  ["0:45:10", "V1", "Andrés, ¿tú qué opinas? Tú conoces a la otra empresa."],
  ["0:45:25", "H5", "La conozco, es seria, pero tiene un solo técnico para toda la zona; en una emergencia podríamos quedar esperando. Yo me inclino por prorrogar con Schindler, pero negociando que el tiempo de respuesta quede por escrito en el contrato."],
  ["0:48:50", "V4", "Desde lo fiscal, un ajuste del seis por ciento está por debajo del IPC acumulado del año, así que es razonable. Sí les pido que el contrato incluya una cláusula de penalidad por incumplimiento de los tiempos de respuesta."],
  ["0:52:20", "V2", "Puedo negociar la cláusula: respuesta en cuatro horas para fallas que dejen gente atrapada y en veinticuatro para el resto, con descuento en la cuota si se incumple."],
  ["0:55:10", "V1", "Antes de votar, ¿alguien quiere que pidamos una tercera cotización? Lo pregunto para que después no digan que no comparamos."],
  ["0:56:00", "V4", "Con las dos cotizaciones y la diferencia de servicio está suficientemente soportado, siempre que quede constancia en el acta de por qué se escoge la más cara."],
  ["0:57:40", "V3", "Que quede en el acta: la razón es el tiempo de respuesta y la disponibilidad de repuestos."],
  ["1:00:30", "V3", "Con eso estoy de acuerdo. Y que quede claro quién del consejo hace seguimiento mensual a los reportes de fallas."],
  ["1:02:10", "V1", "Yo lo asumo; pido que el administrador me envíe el reporte de fallas cada mes. Si no hay más intervenciones, someto a votación prorrogar por doce meses el contrato de mantenimiento de ascensores con Schindler, con el ajuste del seis por ciento y la cláusula de tiempos de respuesta. Quienes estén a favor, levanten la mano."],
  ["1:05:30", "V1", "Tres votos a favor y ninguno en contra. Queda aprobada la prórroga con las condiciones discutidas."],

  // ── Seguridad: cámaras y vigilancia ──────────────────────────────────
  ["1:20:10", "V1", "Pasamos a seguridad. En septiembre hubo dos hurtos de partes de vehículos en los parqueaderos del sótano. Jorge, ¿qué cotizaciones tenemos?"],
  ["1:21:00", "V2", "Tengo tres cotizaciones para instalar ocho cámaras adicionales en el sótano y en la entrada peatonal: catorce millones ochocientos mil, diecisiete millones doscientos mil y diecinueve millones, esta última con monitoreo incluido por un año."],
  ["1:24:30", "V4", "La de catorce ochocientos cabe dentro del rubro de seguridad del presupuesto, que tiene un saldo de veintidós millones. Las otras dos habría que aprobarlas como adición presupuestal en la asamblea."],
  ["1:27:15", "V3", "¿La de catorce ochocientos incluye mantenimiento? Las cámaras sin mantenimiento a los seis meses ya no sirven."],
  ["1:28:00", "V2", "Incluye un año de garantía y una visita de mantenimiento semestral. Después tendríamos que contratar el mantenimiento aparte."],
  ["1:31:40", "H5", "También deberíamos revisar a la empresa de vigilancia: en los dos hurtos nadie reportó nada en la minuta. Propongo pedir un informe de rondas del último trimestre."],
  ["1:34:20", "V1", "Buen punto, Andrés. Jorge, solicita a la empresa de vigilancia el informe de rondas y las minutas de las dos noches de los hurtos."],
  ["1:36:10", "V2", "Anotado. Se los pido mañana con copia al consejo."],
  ["1:40:00", "V3", "Mi voto sería por la cotización de catorce ochocientos, siempre que el proveedor instale antes de la temporada de diciembre."],
  ["1:43:20", "V4", "Como revisor fiscal no voto, pero sí aclaro que esa contratación está por debajo del tope que el reglamento deja a decisión del consejo, así que no necesita asamblea."],
  ["1:46:00", "V1", "Entonces propongo contratar la instalación de las ocho cámaras con la cotización de catorce millones ochocientos mil pesos, con instalación antes del quince de noviembre. ¿Hay alguna objeción? Ninguna. Queda decidido por consenso del consejo."],
  ["1:50:15", "V2", "Con la decisión tomada, firmo el contrato esta semana y les comparto el cronograma de instalación."],

  // ── Proposiciones y varios ───────────────────────────────────────────
  ["1:55:20", "V1", "Pasamos a proposiciones y varios. Carolina pidió que tratemos la convocatoria de la asamblea ordinaria."],
  ["1:55:50", "V3", "Sí. Hay que definir la fecha para presentar el presupuesto y los estados financieros a los propietarios. Propongo la tercera semana de octubre."],
  ["1:57:10", "V2", "El reglamento exige que la convocatoria salga con quince días hábiles de antelación; para la tercera semana de octubre tendría que enviarla esta misma semana."],
  ["2:00:30", "V4", "Les recuerdo que para la asamblea deben tener listos los estados financieros con corte a septiembre y mi dictamen como revisor fiscal."],
  ["2:05:00", "V1", "Entonces queda decidido: convocar la asamblea ordinaria para la tercera semana de octubre. El administrador envía la convocatoria esta semana y prepara los estados financieros con corte a septiembre."],
  ["2:08:10", "H5", "Una última cosa: el cerramiento del parque infantil tiene dos tubos sueltos. Es un tema de seguridad de los niños."],
  ["2:09:00", "V2", "Lo reviso mañana mismo con el personal de mantenimiento y les confirmo."],
  ["2:11:20", "V1", "Si no hay más temas, damos por terminada la reunión siendo las nueve y once de la noche. Muchas gracias a todos."],
  ["2:13:10", "V3", "Gracias, buenas noches."],
];

/** Lo que se habla por segundo, para dar una duración creíble a cada intervención. */
const CARACTERES_POR_SEGUNDO = 15;

export function construirIntervenciones(): IntervencionDTO[] {
  return GUION.map(([reloj, speaker, text], i) => {
    const startMs = leerReloj(reloj) as number;
    const siguienteMs = i + 1 < GUION.length ? (leerReloj(GUION[i + 1][0]) as number) : DURACION_SEPTIEMBRE_MS;
    const hablaMs = Math.min(Math.max(Math.round((text.length / CARACTERES_POR_SEGUNDO) * 1000), 4_000), 90_000);
    return {
      id: `u-demo-${String(i + 1).padStart(3, "0")}`,
      startMs,
      endMs: Math.min(startMs + hablaMs, siguienteMs - 800),
      speaker,
      text,
    };
  });
}

/** El receso de diez minutos: es lo que la transcripción marca como «Sin voz». */
export const SILENCIOS_SEPTIEMBRE: RangoMs[] = [{ desdeMs: leerReloj("0:30:20") as number, hastaMs: leerReloj("0:41:00") as number }];

export const MARCADORES_SEPTIEMBRE: MarcadorDTO[] = [
  { id: "m-demo-1", atMs: leerReloj("0:41:05") as number, kind: "tema", note: "Ascensores" },
  { id: "m-demo-2", atMs: leerReloj("1:05:30") as number, kind: "votacion", note: "Prórroga del contrato de ascensores" },
  { id: "m-demo-3", atMs: leerReloj("1:46:00") as number, kind: "nota", note: "Cámaras: decisión por consenso" },
];

/** La ficha que la IA habría extraído de la reunión de septiembre. */
export const FICHA_SEPTIEMBRE: Ficha = {
  resumen:
    "El consejo verificó el quórum y aprobó el orden del día con la adición de la convocatoria a la asamblea. " +
    "Se informó un recaudo del 89 % y una cartera en mora de $112 millones; el revisor fiscal recomendó provisionar la cartera de más de 90 días. " +
    "Se aprobó por unanimidad de los consejeros presentes prorrogar doce meses el contrato de ascensores con Schindler (ajuste del 6 %), con cláusula de tiempos de respuesta. " +
    "Se decidió por consenso instalar ocho cámaras adicionales con la cotización de $14.800.000 y convocar la asamblea ordinaria para la tercera semana de octubre.",
  ordenDelDia: [
    { titulo: "Verificación del quórum y aprobación del orden del día", inicioS: 5 },
    { titulo: "Informe de cartera y recaudo", inicioS: 490 },
    { titulo: "Mantenimiento de los ascensores", inicioS: 2465 },
    { titulo: "Seguridad: cámaras y vigilancia", inicioS: 4810 },
    { titulo: "Proposiciones y varios", inicioS: 6920 },
  ],
  asistentes: [
    { nombre: "Martha López", rol: "Presidente del consejo" },
    { nombre: "Carolina Ríos", rol: "Consejera" },
    { nombre: "Andrés Gómez", rol: "Consejero" },
    { nombre: "Hernán Sierra", rol: "Revisor fiscal" },
    { nombre: "Jorge Pardo", rol: "Administrador" },
  ],
  decisiones: [
    { id: "D1", texto: "Prorrogar por doce meses el contrato de mantenimiento de ascensores con Schindler, con ajuste del 6 % y cláusula de tiempos de respuesta (4 h para personas atrapadas, 24 h para el resto).", t: 3930 },
    { id: "D2", texto: "Contratar la instalación de ocho cámaras adicionales con la cotización de $14.800.000, con instalación antes del 15 de noviembre.", t: 6360 },
    { id: "D3", texto: "Convocar la asamblea ordinaria para la tercera semana de octubre.", t: 7500 },
  ],
  compromisos: [
    { id: "C1", texto: "Solicitar a la contadora el cálculo de la provisión por deudas de difícil cobro.", responsable: "Jorge Pardo", fecha: "Próxima reunión", t: 940 },
    { id: "C2", texto: "Presentar una comparación de tarifas del salón social y una propuesta de ajuste.", responsable: "Jorge Pardo", fecha: "Próxima reunión", t: 1200 },
    { id: "C3", texto: "Negociar con Schindler la cláusula de tiempos de respuesta, con descuento en la cuota si se incumple.", responsable: "Jorge Pardo", fecha: "Antes del 31 de octubre", t: 3140 },
    { id: "C4", texto: "Enviar cada mes a la presidente del consejo el reporte de fallas de los ascensores.", responsable: "Jorge Pardo", fecha: "Mensual", t: 3730 },
    { id: "C5", texto: "Pedir a la empresa de vigilancia el informe de rondas y las minutas de las noches de los hurtos.", responsable: "Jorge Pardo", fecha: "Esta semana", t: 5660 },
    { id: "C6", texto: "Enviar la convocatoria a la asamblea ordinaria y preparar los estados financieros con corte a septiembre.", responsable: "Jorge Pardo", fecha: "Esta semana", t: 7500 },
  ],
  votaciones: [
    {
      t: 3930,
      asunto: "Prórroga por doce meses del contrato de ascensores con Schindler",
      aFavor: 3,
      enContra: 0,
      abstenciones: 0,
      resultado: "Aprobada por unanimidad de los consejeros presentes",
    },
  ],
  pendientes: [
    "No se mencionó el lugar de la reunión.",
    "La fecha de la asamblea ordinaria quedó como «tercera semana de octubre», sin día exacto.",
    "Al revisar el parque infantil (tubos sueltos en el cerramiento) no se fijó fecha de arreglo.",
  ],
  hablantes: [
    { etiqueta: "V1", nombreSugerido: "Martha López", rol: "Presidente del consejo", confianza: "alta", evidencia: "El administrador la nombra como presidente del consejo a las 0:00:34 y ella modera la reunión." },
    { etiqueta: "V2", nombreSugerido: "Jorge Pardo", rol: "Administrador", confianza: "alta", evidencia: "Verifica el quórum y presenta los informes; la presidente lo llama «Jorge» a las 0:15:40." },
    { etiqueta: "V3", nombreSugerido: "Carolina Ríos", rol: "Consejera", confianza: "alta", evidencia: "La presidente le responde «Claro, Carolina» a las 0:02:17." },
    { etiqueta: "V4", nombreSugerido: "Hernán Sierra", rol: "Revisor fiscal", confianza: "alta", evidencia: "Dice «como revisor fiscal» a las 0:13:30 y la presidente le habla como «Hernán» a las 0:15:40." },
    { etiqueta: "H5", nombreSugerido: "Andrés Gómez", rol: "Consejero", confianza: "media", evidencia: "La presidente pregunta «Andrés, ¿tú qué opinas?» a las 0:45:10 y esta voz responde." },
  ],
};

/** Nombres que ya dio por buenos la persona; H5 queda como sugerencia sin confirmar. */
const PERSONAS_SEPTIEMBRE: Array<{ label: Voz; name: string; role: string }> = [
  { label: "V1", name: "Martha López", role: "Presidente del consejo" },
  { label: "V2", name: "Jorge Pardo", role: "Administrador" },
  { label: "V3", name: "Carolina Ríos", role: "Consejera" },
  { label: "V4", name: "Hernán Sierra", role: "Revisor fiscal" },
];

export function construirHablantes(intervenciones: IntervencionDTO[]): HablanteDTO[] {
  const etiquetas: Voz[] = ["V1", "V2", "V3", "V4", "H5"];
  return etiquetas.map((label) => {
    const suyas = intervenciones.filter((u) => u.speaker === label);
    const talkMs = suyas.reduce((suma, u) => suma + (u.endMs - u.startMs), 0);
    // Muestra de 6 s tomada de su intervención más larga (la voz más limpia y continua).
    const larga = suyas.reduce((mejor, u) => (u.endMs - u.startMs > mejor.endMs - mejor.startMs ? u : mejor), suyas[0]);
    const confirmada = PERSONAS_SEPTIEMBRE.find((p) => p.label === label);
    const sugerida = FICHA_SEPTIEMBRE.hablantes.find((h) => h.etiqueta === label);
    return {
      label,
      name: confirmada?.name ?? null,
      role: confirmada?.role ?? null,
      personId: confirmada ? `persona-demo-${label}` : null,
      confirmed: Boolean(confirmada),
      suggestion: confirmada || !sugerida
        ? null
        : {
            nombre: sugerida.nombreSugerido,
            rol: sugerida.rol,
            evidencia: sugerida.evidencia,
            t: 2710,
            confianza: sugerida.confianza,
          },
      talkMs,
      sampleStartMs: larga.startMs,
      sampleEndMs: Math.min(larga.startMs + 6_000, larga.endMs),
    };
  });
}

/** Personas de «Los Pinos»: alimentan el selector de nombres de la pestaña Hablantes. */
export const PERSONAS_LOS_PINOS: PersonaDTO[] = [
  { id: "persona-demo-V1", propertyId: "prop-demo-001", name: "Martha López", role: "presidente", active: true },
  { id: "persona-demo-V2", propertyId: "prop-demo-001", name: "Jorge Pardo", role: "administrador", active: true },
  { id: "persona-demo-V3", propertyId: "prop-demo-001", name: "Carolina Ríos", role: "consejero", active: true },
  { id: "persona-demo-V4", propertyId: "prop-demo-001", name: "Hernán Sierra", role: "revisor_fiscal", active: true },
  { id: "persona-demo-H5", propertyId: "prop-demo-001", name: "Andrés Gómez", role: "consejero", active: true },
  { id: "persona-demo-C6", propertyId: "prop-demo-001", name: "Luz Marina Ortiz", role: "contador", active: true },
];
