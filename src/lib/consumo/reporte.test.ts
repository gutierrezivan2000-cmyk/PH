import { describe, expect, it } from "vitest";
import { aCsv, diaEnBogota, distribucion, informeDeConsumo, inicioDeDiaEnBogota, periodoPedido, segundosDeAudio, type RegistroDeConsumo } from "./reporte";

let n = 0;
const r = (extra: Partial<RegistroDeConsumo>): RegistroDeConsumo => ({
  userId: "u1", type: "informe", date: new Date("2026-10-05T15:00:00Z"), costUsd: 0.1, tokens: 1000, provider: "anthropic", model: "claude-sonnet-5",
  inputTokens: 800, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, audioSeconds: 0, refType: null, refId: `x${++n}`, ...extra,
});

describe("distribucion", () => {
  it("promedio, mediana, p90 y máximo", () => {
    expect(distribucion([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({ n: 10, promedio: 5.5, mediana: 5, p90: 9, maximo: 10 });
    expect(distribucion([7])).toEqual({ n: 1, promedio: 7, mediana: 7, p90: 7, maximo: 7 });
    expect(distribucion([])).toEqual({ n: 0, promedio: 0, mediana: 0, p90: 0, maximo: 0 });
    expect(distribucion([3, 1, 2]).mediana).toBe(2);
  });
});

describe("informeDeConsumo", () => {
  it("por función: veces, usuarios, tokens separados, costo total y por vez, y los modelos usados", () => {
    const i = informeDeConsumo([
      r({ type: "informe", costUsd: 0.1, inputTokens: 1000, outputTokens: 300, cacheReadTokens: 50 }),
      r({ type: "informe", costUsd: 0.3, userId: "u2", model: "claude-sonnet-5-5" }),
      r({ type: "acta", costUsd: 0.05 }),
    ]);
    const informe = i.porFuncion.find((f) => f.tipo === "informe")!;
    expect(informe).toMatchObject({ nombre: "Generar: informe de gestión", grupo: "Documentos", unidad: "informe", veces: 2, usuarios: 2, entrada: 1800, salida: 500, cacheLectura: 50, estimados: 0 });
    expect(informe.costoUsd).toBeCloseTo(0.4, 9);
    expect(informe.porVez).toMatchObject({ n: 2, promedio: 0.2, mediana: 0.1, p90: 0.3, maximo: 0.3 });
    expect(informe.modelos).toEqual(["claude-sonnet-5", "claude-sonnet-5-5"]);
    // Ordenado de lo que más cuesta a lo que menos.
    expect(i.porFuncion.map((f) => f.tipo)).toEqual(["informe", "acta"]);
    expect(i.total).toMatchObject({ veces: 3, usuarios: 2, estimados: 0 });
    expect(i.total.costoUsd).toBeCloseTo(0.45, 9);
  });

  it("audio: los segundos (también los de registros anteriores, que los guardaban en `tokens`) y el costo por hora", () => {
    const i = informeDeConsumo([
      r({ type: "reunion_audio", costUsd: 0.72, audioSeconds: 7200, tokens: 7200, provider: "openai", model: "gpt-4o-transcribe-diarize" }),
      r({ type: "reunion_audio", costUsd: 0.36, audioSeconds: 0, tokens: 3600, provider: null, model: null }), // anterior a la medición
    ]);
    const audio = i.porFuncion[0];
    expect(audio.audioSegundos).toBe(10_800);
    expect(audio.usdPorHoraDeAudio).toBeCloseTo(0.36, 9);
    expect(audio.estimados).toBe(1);
    expect(i.total).toMatchObject({ audioSegundos: 10_800, estimados: 1 });
    expect(i.total.costoEstimadoUsd).toBeCloseTo(0.36, 9);
    // Una función que no es de audio no convierte sus tokens en segundos.
    expect(segundosDeAudio(r({ type: "informe", tokens: 5000 }))).toBe(0);
  });

  it("por producto: suma todo lo de cada operación (una generación con su lectura de imágenes y su revisión), con su composición", () => {
    const i = informeDeConsumo([
      r({ type: "informe", costUsd: 0.2, refType: "generacion", refId: "g1" }),
      r({ type: "acta", costUsd: 0.1, refType: "generacion", refId: "g1" }),
      r({ type: "generacion_lectura", costUsd: 0.05, refType: "generacion", refId: "g1" }),
      r({ type: "requisitos_acta", costUsd: 0.01, refType: "generacion", refId: "g1" }),
      r({ type: "informe", costUsd: 0.4, refType: "generacion", refId: "g2" }),
      r({ type: "soporte_chat", costUsd: 0.001, refType: null, refId: null }), // sin operación: solo cuenta por función
    ]);
    const gen = i.porProducto.find((p) => p.tipo === "generacion")!;
    expect(gen.operaciones).toBe(2);
    expect(gen.costoUsd).toBeCloseTo(0.76, 9);
    expect(gen.porOperacion.promedio).toBeCloseTo(0.38, 9);
    expect(gen.porOperacion.maximo).toBeCloseTo(0.4, 9);
    expect(gen.composicion.map((c) => c.tipo)).toEqual(["informe", "acta", "generacion_lectura", "requisitos_acta"]);
    expect(gen.composicion[0].porOperacion).toBeCloseTo(0.3, 9);
    expect(i.porProducto.map((p) => p.tipo)).toEqual(["generacion"]);
  });

  it("una reunión: todo lo suyo dividido entre sus horas de audio", () => {
    const i = informeDeConsumo([
      r({ type: "reunion_audio", costUsd: 0.72, audioSeconds: 7200, refType: "reunion", refId: "m1" }),
      r({ type: "reunion_ia", costUsd: 1.5, refType: "reunion", refId: "m1" }),
      r({ type: "reunion_acta", costUsd: 1.2, refType: "reunion", refId: "m1" }),
      r({ type: "reunion_pregunta", costUsd: 0.58, refType: "reunion", refId: "m1" }),
    ]);
    const reunion = i.porProducto[0];
    expect(reunion).toMatchObject({ tipo: "reunion", operaciones: 1 });
    expect(reunion.costoUsd).toBeCloseTo(4, 9);
    expect(reunion.usdPorHoraDeAudio).toBeCloseTo(2, 9);
  });

  it("por usuario: total, tokens, audio y en qué se le fue, de mayor a menor", () => {
    const i = informeDeConsumo([
      r({ userId: "a", type: "agente_chat", costUsd: 0.01, inputTokens: 100, outputTokens: 50 }),
      r({ userId: "a", type: "agente_chat", costUsd: 0.02, inputTokens: 100, outputTokens: 50 }),
      r({ userId: "a", type: "informe", costUsd: 0.5 }),
      r({ userId: "b", type: "informe", costUsd: 0.1 }),
    ]);
    expect(i.porUsuario.map((u) => u.userId)).toEqual(["a", "b"]);
    expect(i.porUsuario[0]).toMatchObject({ veces: 3, tokens: 300 + 1000 });
    expect(i.porUsuario[0].porTipo.map((t) => [t.tipo, t.veces])).toEqual([["informe", 1], ["agente_chat", 2]]);
    expect(i.porUsuario[0].porTipo[1].costoUsd).toBeCloseTo(0.03, 9);
  });

  it("costos raros no ensucian las sumas; por proveedor, lo sin detalle aparte", () => {
    const i = informeDeConsumo([r({ costUsd: Number.NaN }), r({ costUsd: -3 }), r({ costUsd: 0.5, provider: null, model: null })]);
    expect(i.total.costoUsd).toBeCloseTo(0.5, 9);
    expect(i.porProveedor).toEqual([
      { proveedor: "sin detalle", costoUsd: 0.5, veces: 1 },
      { proveedor: "anthropic", costoUsd: 0, veces: 2 },
    ]);
  });

  it("sin registros: todo en cero", () => {
    expect(informeDeConsumo([])).toMatchObject({ total: { costoUsd: 0, veces: 0, usuarios: 0 }, porFuncion: [], porProducto: [], porUsuario: [] });
  });
});

describe("periodo", () => {
  const AHORA = new Date("2026-10-08T03:00:00Z"); // 7 de octubre, 10 p. m. en Bogotá
  it("los días son de Bogotá", () => {
    expect(diaEnBogota(AHORA)).toBe("2026-10-07");
    expect(inicioDeDiaEnBogota("2026-10-01")?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(inicioDeDiaEnBogota("2026-02-30")).toBeNull();
    expect(inicioDeDiaEnBogota("ayer")).toBeNull();
  });
  it("sin fechas: el mes en curso hasta hoy (incluido)", () => {
    expect(periodoPedido(null, null, AHORA)).toEqual({
      desdeDia: "2026-10-01", hastaDia: "2026-10-07", desde: new Date("2026-10-01T05:00:00Z"), hasta: new Date("2026-10-08T05:00:00Z"),
    });
  });
  it("con fechas las respeta; al revés las corrige; una inválida usa la de siempre", () => {
    expect(periodoPedido("2026-09-01", "2026-09-30", AHORA)).toMatchObject({ desdeDia: "2026-09-01", hastaDia: "2026-09-30", hasta: new Date("2026-10-01T05:00:00Z") });
    expect(periodoPedido("2026-09-30", "2026-09-01", AHORA)).toMatchObject({ desdeDia: "2026-09-01", hastaDia: "2026-09-30" });
    expect(periodoPedido("x", "2026-10-05", AHORA)).toMatchObject({ desdeDia: "2026-10-01", hastaDia: "2026-10-05" });
  });
});

describe("aCsv", () => {
  it("con BOM, comillas donde hace falta y números sin notación rara", () => {
    const csv = aCsv(["Cliente", "Costo"], [["Ana, la jefa", 0.123456789], ['Dice "hola"', 3]]);
    expect(csv).toBe('﻿Cliente,Costo\n"Ana, la jefa",0.123457\n"Dice ""hola""",3\n');
  });
});
