/**
 * Cuánto del uso del chat de los agentes le queda a la cuenta, al estilo de Claude o ChatGPT: un porcentaje que baja con cada
 * mensaje según lo que cueste de verdad (el costo en dólares de cada llamada, ya registrado en UsageRecord).
 *
 * Tres ventanas, y se muestra la más ajustada:
 *  - sesión: 20 % del presupuesto del plan, móvil de 5 horas;
 *  - semana: 40 % del presupuesto, móvil de 7 días;
 *  - mes: el presupuesto completo, desde el inicio del periodo (mes calendario en Bogotá, o la prueba gratis).
 *
 * Pura: recibe los consumos y el instante; no toca la base.
 */

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
/** Bogotá es UTC-5 todo el año (sin horario de verano). */
const DESPLAZAMIENTO_BOGOTA_MS = 5 * HORA_MS;

export const VENTANAS_DE_USO = {
  sesion: { duracionMs: 5 * HORA_MS, parte: 0.2 },
  semana: { duracionMs: 7 * DIA_MS, parte: 0.4 },
} as const;

export type VentanaDeUso = keyof typeof VENTANAS_DE_USO | "mes";

export type Consumo = { fecha: Date; costUsd: number };

export type EstadoDeUso = {
  /** Lo que queda, en % entero (0 a 100). */
  porcentajeRestante: number;
  /** La ventana que más se está agotando. */
  ventana: VentanaDeUso;
  /**
   * Cuándo empieza a liberarse uso en esa ventana: en las móviles, cuando sale el consumo más antiguo; en el mes, al
   * renovarse el periodo.
   */
  renovaEn: Date;
  agotado: boolean;
};

/** El periodo mensual de facturación en Bogotá: del día 1 a las 00:00 hasta el día 1 del mes siguiente. */
export function periodoMensualBogota(ahora: Date): { inicio: Date; fin: Date } {
  const local = new Date(ahora.getTime() - DESPLAZAMIENTO_BOGOTA_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  return {
    inicio: new Date(Date.UTC(y, m, 1) + DESPLAZAMIENTO_BOGOTA_MS),
    fin: new Date(Date.UTC(y, m + 1, 1) + DESPLAZAMIENTO_BOGOTA_MS),
  };
}

/** Una ventana se considera agotada cuando le queda menos del 1 %: es la misma cuenta que redondea a 0 % en la barra. */
const UMBRAL_DE_AGOTADO = 0.01;

type Candidato = {
  ventana: VentanaDeUso;
  restante: number;
  /** Cuándo sale el primer consumo de la ventana y empieza a liberarse algo (en el mes, al renovarse el periodo). */
  primeraSalida: Date;
  /** Cuándo la ventana vuelve a tener al menos 1 % disponible. */
  vuelveEn: Date;
};

export function estadoDeUso({
  presupuestoUsd,
  periodo,
  consumos,
  ahora,
}: {
  presupuestoUsd: number;
  periodo: { inicio: Date; fin: Date };
  consumos: Consumo[];
  ahora: Date;
}): EstadoDeUso {
  if (!(presupuestoUsd > 0)) return { porcentajeRestante: 0, ventana: "mes", renovaEn: periodo.fin, agotado: true };

  const ahoraMs = ahora.getTime();
  // Solo cuenta lo que ya ocurrió y tiene un costo válido (un consumo con fecha futura no debería existir, pero no se suma).
  const validos = consumos
    .filter((c) => c.fecha.getTime() <= ahoraMs && Number.isFinite(c.costUsd) && c.costUsd > 0)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const sumar = (xs: Consumo[]) => xs.reduce((s, c) => s + c.costUsd, 0);

  // El mes cuenta lo gastado dentro del periodo. La sesión y la semana son ventanas MÓVILES: miran hacia atrás desde ahora, aunque
  // lo gastado quede en el mes anterior (si no, a principios de mes el tope de 20 % y 40 % dejaría de aplicar).
  const delPeriodo = validos.filter((c) => c.fecha.getTime() >= periodo.inicio.getTime());
  const candidatos: Candidato[] = [
    { ventana: "mes", restante: 1 - sumar(delPeriodo) / presupuestoUsd, primeraSalida: periodo.fin, vuelveEn: periodo.fin },
  ];
  for (const [nombre, v] of Object.entries(VENTANAS_DE_USO) as [keyof typeof VENTANAS_DE_USO, (typeof VENTANAS_DE_USO)[keyof typeof VENTANAS_DE_USO]][]) {
    const dentro = validos.filter((c) => c.fecha.getTime() >= ahoraMs - v.duracionMs);
    const tope = presupuestoUsd * v.parte;
    const gastado = sumar(dentro);
    // Vuelve a haber 1 % cuando, al ir saliendo los consumos más antiguos, lo gastado baja de (1 − 1 %) del tope.
    let vuelveEn = ahora;
    if (gastado > tope * (1 - UMBRAL_DE_AGOTADO)) {
      let resto = gastado;
      for (const c of dentro) {
        resto -= c.costUsd;
        vuelveEn = new Date(c.fecha.getTime() + v.duracionMs);
        if (resto <= tope * (1 - UMBRAL_DE_AGOTADO)) break;
      }
    }
    candidatos.push({
      ventana: nombre,
      restante: 1 - gastado / tope,
      primeraSalida: dentro.length === 0 ? ahora : new Date(dentro[0].fecha.getTime() + v.duracionMs),
      vuelveEn,
    });
  }

  const porcentaje = (c: Candidato) => Math.max(0, Math.min(100, Math.floor(c.restante * 100)));
  const peor = candidatos.reduce((a, b) => (b.restante < a.restante ? b : a));
  const porcentajeRestante = porcentaje(peor);
  if (porcentajeRestante > 0) return { porcentajeRestante, ventana: peor.ventana, renovaEn: peor.primeraSalida, agotado: false };

  // Agotado: el uso solo vuelve cuando TODAS las ventanas agotadas se liberan, así que manda la que tarda más.
  const bloqueantes = candidatos.filter((c) => porcentaje(c) <= 0);
  const manda = bloqueantes.reduce((a, b) => (b.vuelveEn.getTime() > a.vuelveEn.getTime() ? b : a));
  return { porcentajeRestante: 0, ventana: manda.ventana, renovaEn: manda.vuelveEn, agotado: true };
}

/** Cuánto aviso mostrar: 20 % y 5 % son los dos umbrales de la barra. */
export function nivelDeAviso(porcentajeRestante: number): "ok" | "poco" | "casi_agotado" | "agotado" {
  if (porcentajeRestante <= 0) return "agotado";
  if (porcentajeRestante <= 5) return "casi_agotado";
  if (porcentajeRestante <= 20) return "poco";
  return "ok";
}

const NOMBRE_DE_VENTANA: Record<VentanaDeUso, string> = { sesion: "sesión de 5 horas", semana: "semana", mes: "mes" };
const FECHA_BOGOTA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long" });
const HORA_BOGOTA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });

/** Una fecha en palabras de Bogotá: «1 de noviembre». */
export const fechaBogota = (fecha: Date): string => FECHA_BOGOTA.format(fecha);

/** Cuándo vuelve el uso, en palabras de Bogotá: «a las 3:15 p. m.» el mismo día, «el 16 de octubre a las 9:00 a. m.» después. */
export function cuandoSeLibera(fecha: Date, ahora: Date): string {
  if (FECHA_BOGOTA.format(fecha) === FECHA_BOGOTA.format(ahora)) return `a las ${HORA_BOGOTA.format(fecha)}`;
  return `el ${FECHA_BOGOTA.format(fecha)} a las ${HORA_BOGOTA.format(fecha)}`;
}

/** Lo que se le dice a la persona cuando el uso se agotó. */
export function mensajeDeAgotado(estado: EstadoDeUso, ahora: Date): string {
  if (estado.ventana === "mes") return `Se agotó tu uso del chat de este mes. Se renueva el ${FECHA_BOGOTA.format(estado.renovaEn)}.`;
  // «a las 5:00 p. m.» ya termina en punto: se evita el doble punto.
  return `Se agotó tu uso del chat de esta ${NOMBRE_DE_VENTANA[estado.ventana]}. Vuelve a tener uso ${cuandoSeLibera(estado.renovaEn, ahora)}.`.replace(/\.\.$/, ".");
}

/** Inicio del día de hoy en Bogotá (medianoche). */
export function inicioDelDiaBogota(ahora: Date): Date {
  const local = new Date(ahora.getTime() - DESPLAZAMIENTO_BOGOTA_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DESPLAZAMIENTO_BOGOTA_MS);
}

/**
 * El asistente del reglamento que usan los residentes lo paga la administración dueña de la copropiedad, y el residente no tiene
 * cuenta: se topa por administrador (cada pregunta queda como `UsageRecord` de esa cuenta). Los residentes crecen con el tamaño de
 * la administración, así que el tope sube con el plan. Una pregunta cuesta ≈ US$0,002.
 */
export type LimitesDelAsistenteDelPortal = { porDia: number; porMes: number };

export const LIMITES_DEL_ASISTENTE_DEL_PORTAL: Readonly<Record<"pro" | "business" | "elite" | "sinPlan", LimitesDelAsistenteDelPortal>> = {
  pro: { porDia: 40, porMes: 300 },
  business: { porDia: 80, porMes: 600 },
  elite: { porDia: 120, porMes: 1000 },
  // Cuentas beta y fase de pruebas: no tienen plan, pero sí un techo de seguridad (no quedan sin ningún límite).
  sinPlan: { porDia: 120, porMes: 1200 },
};

export function limitesDelAsistenteDelPortal(plan: "pro" | "business" | "elite" | null): LimitesDelAsistenteDelPortal {
  return LIMITES_DEL_ASISTENTE_DEL_PORTAL[plan ?? "sinPlan"];
}

/** El mensaje si ya se llegó al tope, o null si todavía se puede preguntar. */
export function topeDelAsistenteDelPortal(preguntas: { hoy: number; mes: number }, limites: LimitesDelAsistenteDelPortal): string | null {
  if (preguntas.hoy >= limites.porDia) {
    return "La administración de esta copropiedad llegó hoy al límite de preguntas al asistente del reglamento. Intenta mañana o escribe a la administración.";
  }
  if (preguntas.mes >= limites.porMes) {
    return "La administración de esta copropiedad llegó este mes al límite de preguntas al asistente del reglamento. Escribe a la administración.";
  }
  return null;
}
