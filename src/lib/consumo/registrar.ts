/**
 * El registro del consumo de IA: cada llamada (o cada operación, si junta varias) deja una fila en `UsageRecord` con quién,
 * qué función, qué proveedor y modelo, los tokens separados (entrada, salida, caché), los segundos de audio, el costo en US$
 * calculado con la tabla de precios del día y a qué operación pertenece (una generación, una reunión, un chat). De ahí sale el
 * panel «Consumo IA» para precificar.
 *
 * Registrar NUNCA rompe lo que se está haciendo: si la base de datos falla, se anota en el registro del servidor y sigue.
 *
 * Las llamadas que están lejos de quien sabe el usuario (leer una imagen dentro de una generación, transcribir un audio
 * subido) toman el usuario y la operación del CONTEXTO (`conConsumo`), que pone quien empieza la operación.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import { costoDeUso, type Proveedor } from "./calculo";
import type { Tokens } from "./precios";
import { TOKENS_VACIOS, totalDeTokens } from "./uso";

/** A qué operación pertenece una llamada: con esto se suma lo que costó cada generación, cada reunión o cada chat. */
export type RefDeConsumo = { tipo: "generacion" | "reunion" | "chat" | "importacion"; id: string };

type Contexto = {
  userId: string;
  ref?: RefDeConsumo;
  /**
   * Con qué función se registran las lecturas que se hacen adentro: un audio transcrito dentro del chat de los agentes es
   * «transcription» (lo cuentan los cupos de minutos), dentro de una generación es «generacion_audio».
   */
  tipos?: { audio?: string; imagen?: string };
};
const almacen = new AsyncLocalStorage<Contexto>();

/** Corre `fn` con un usuario y una operación a los que se cargan las llamadas de IA que se hagan adentro. */
export function conConsumo<T>(contexto: Contexto, fn: () => T): T {
  return almacen.run(contexto, fn);
}

export const contextoDeConsumo = (): Contexto | null => almacen.getStore() ?? null;

/** La función con la que se registra una lectura (audio o imagen) según la operación en la que ocurre. */
export const tipoDeLectura = (clase: "audio" | "imagen", porDefecto: string): string => contextoDeConsumo()?.tipos?.[clase] ?? porDefecto;

export type Consumo = {
  /** La función (`TIPOS` de `funciones.ts`). */
  tipo: string;
  proveedor: Proveedor;
  modelo: string;
  tokens?: Tokens;
  audioSegundos?: number;
  /** Si ya se calculó (Reuniones lo calcula llamada por llamada); si no, se calcula con la tabla de precios. */
  costoUsd?: number;
  /** Si no se da, el del contexto. */
  userId?: string;
  /** Si no se da, el del contexto; `null` para no asociarla a ninguna operación. */
  ref?: RefDeConsumo | null;
  /** Lo que va en la columna `tokens` (por omisión, el total de tokens; en las funciones de audio, segundos). */
  tokensDelRegistro?: number;
};

export type FilaDeConsumo = {
  userId: string;
  type: string;
  tokens: number;
  costUsd: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  audioSeconds: number;
  refType: string | null;
  refId: string | null;
};

/** La fila que se guarda (pura): se prueba sin base de datos. null si no se sabe de quién es. */
export function filaDeConsumo(c: Consumo, contexto: Contexto | null): FilaDeConsumo | null {
  const userId = c.userId ?? contexto?.userId;
  if (!userId) return null;
  const tokens = c.tokens ?? TOKENS_VACIOS;
  const audioSegundos = Math.max(0, Math.round(c.audioSegundos ?? 0));
  const costo = c.costoUsd ?? costoDeUso({ proveedor: c.proveedor, modelo: c.modelo, tokens, audioSegundos });
  const ref = c.ref === undefined ? contexto?.ref ?? null : c.ref;
  return {
    userId,
    type: c.tipo,
    tokens: Math.max(0, Math.round(c.tokensDelRegistro ?? totalDeTokens(tokens))),
    costUsd: Number.isFinite(costo) && costo > 0 ? costo : 0,
    provider: c.proveedor,
    model: c.modelo,
    inputTokens: tokens.entrada,
    outputTokens: tokens.salida,
    cacheReadTokens: tokens.cacheLectura,
    cacheWriteTokens: tokens.cacheEscritura,
    audioSeconds: audioSegundos,
    refType: ref?.tipo ?? null,
    refId: ref?.id ?? null,
  };
}

/**
 * Las columnas del detalle (las mismas que agrega `ensureAdminSchema`): el `prisma db push` del build puede fallar en silencio,
 * así que se agregan aquí la primera vez. Si falla, se vuelve a intentar a lo sumo una vez por minuto, no en cada registro.
 */
const COLUMNAS = [
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "provider" TEXT`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "model" TEXT`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "inputTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "outputTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "cacheReadTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "audioSeconds" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "refType" TEXT`,
  `ALTER TABLE "UsageRecord" ADD COLUMN IF NOT EXISTS "refId" TEXT`,
];
let columnasListas = false;
let ultimoIntento = 0;

export async function asegurarColumnasDeConsumo(): Promise<void> {
  if (columnasListas || Date.now() - ultimoIntento < 60_000) return;
  ultimoIntento = Date.now();
  const ejecutar = (db as unknown as { $executeRawUnsafe?: (sql: string) => Promise<unknown> }).$executeRawUnsafe;
  if (typeof ejecutar !== "function") return;
  try {
    for (const sql of COLUMNAS) await ejecutar.call(db, sql);
    columnasListas = true;
  } catch (e) {
    console.error("[consumo] no se pudieron preparar las columnas del detalle", e);
  }
}

/** Guarda el consumo. Nunca lanza. Devuelve el costo registrado (0 si no se pudo). */
export async function registrarConsumo(c: Consumo): Promise<number> {
  if (process.env.DEMO_MODE === "true") return 0;
  const fila = filaDeConsumo(c, contextoDeConsumo());
  if (!fila) {
    console.error("[consumo] llamada de IA sin usuario al que cargarla", c.tipo, c.modelo);
    return 0;
  }
  try {
    await asegurarColumnasDeConsumo();
    await db.usageRecord.create({ data: fila });
    return fila.costUsd;
  } catch (e) {
    console.error("[consumo] no se pudo registrar", c.tipo, e);
    return 0;
  }
}
