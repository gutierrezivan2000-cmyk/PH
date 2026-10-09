/**
 * Reglas de los certificados (puras, con pruebas). El paz y salvo afirma algo sobre dinero: no se emite si la cartera dice que la
 * unidad debe, y siempre queda registrado con qué se verificó y cuándo.
 */
export const TIPOS_DE_CERTIFICADO = ["paz_y_salvo", "residencia"] as const;
export type TipoDeCertificado = (typeof TIPOS_DE_CERTIFICADO)[number];

/** Días de vigencia cuando quien emite no indica una fecha. */
export const VIGENCIA_POR_DEFECTO_DIAS: Record<TipoDeCertificado, number> = { paz_y_salvo: 30, residencia: 90 };

/** Fecha de hoy en Bogotá (AAAA-MM-DD). */
export function hoyEnBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);
}

/** AAAA-MM-DD de hoy (Bogotá) más N días. */
export function vigenciaPorDefecto(tipo: TipoDeCertificado, ahora: Date = new Date()): string {
  const [a, m, d] = hoyEnBogota(ahora).split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + VIGENCIA_POR_DEFECTO_DIAS[tipo]));
  return f.toISOString().slice(0, 10);
}

export type VerificacionDeSaldo =
  | { origen: "cartera"; enMora: number; saldo: number }
  | { origen: "declarado" };

export type DecisionDePazYSalvo =
  | { ok: true; verificacion: VerificacionDeSaldo }
  | { ok: false; codigo: "saldo_pendiente" | "falta_confirmacion"; mensaje: string; enMora?: number; saldo?: number };

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/**
 * ¿Se puede emitir el paz y salvo?
 * - Con la unidad del directorio (hay cartera): no, si tiene valores vencidos sin pagar.
 * - Sin unidad del directorio (texto libre): no hay con qué verificar, así que quien emite debe declarar que la unidad está al día.
 */
export function decidirPazYSalvo(entrada: { cartera: { enMora: number; saldo: number } | null; confirmaAlDia: boolean }): DecisionDePazYSalvo {
  if (entrada.cartera) {
    const { enMora, saldo } = entrada.cartera;
    if (enMora > 0.5) {
      return {
        ok: false,
        codigo: "saldo_pendiente",
        mensaje: `La unidad tiene ${pesos(enMora)} vencidos sin pagar. No se puede expedir un paz y salvo hasta que esté al día.`,
        enMora,
        saldo,
      };
    }
    return { ok: true, verificacion: { origen: "cartera", enMora: 0, saldo } };
  }
  if (!entrada.confirmaAlDia) {
    return {
      ok: false,
      codigo: "falta_confirmacion",
      mensaje: "Esta unidad no está en el directorio, así que no se puede verificar su cartera. Confirma que verificaste que está al día para expedir el paz y salvo.",
    };
  }
  return { ok: true, verificacion: { origen: "declarado" } };
}

/** Una revocación es definitiva y necesita un motivo claro. Devuelve el motivo limpio o un error. */
export function validarMotivoDeRevocacion(motivo: unknown): { ok: true; motivo: string } | { ok: false; error: string } {
  const m = typeof motivo === "string" ? motivo.trim().replace(/\s+/g, " ") : "";
  if (m.length < 8) return { ok: false, error: "Escribe el motivo de la revocación (mínimo 8 caracteres). Es definitiva y queda registrada." };
  return { ok: true, motivo: m.slice(0, 300) };
}

/** Dirección pública base: la configurada; solo si falta se toma de la petición (nunca para enlaces que se envían a terceros). */
export function baseUrlPublica(env: string | undefined, cabeceras: { host?: string | null; proto?: string | null }): string {
  const e = (env || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^\s]+$/.test(e)) return e;
  return `${cabeceras.proto === "http" ? "http" : "https"}://${cabeceras.host || "localhost"}`;
}
