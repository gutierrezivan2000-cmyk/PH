import { describe, expect, it } from "vitest";
import { FICHA_SEPTIEMBRE } from "./demo-datos";
import { aDetalle, aFuente, aHablante, aMarcador, aPersona, aResumen, leerFicha, leerRangos, leerSugerencia, type FilaDetalle } from "./mapeo";

const fila = (extra: Partial<FilaDetalle> = {}): FilaDetalle => ({
  id: "m1",
  propertyId: "p1",
  type: "consejo",
  title: "Reunión de consejo — septiembre",
  date: new Date("2026-09-12T00:00:00Z"),
  status: "lista",
  stage: null,
  progress: 100,
  durationMs: 8_040_000,
  errorMessage: null,
  property: { name: "Los Pinos" },
  coverage: 1,
  consentAt: new Date("2026-09-11T23:58:00Z"),
  readyAt: new Date("2026-09-12T03:00:00Z"),
  provider: "openai",
  costUsd: 4.6,
  audioUrl: "https://abc.private.blob.vercel-storage.com/meetings/m1/audio.mp3",
  digest: FICHA_SEPTIEMBRE,
  silences: [{ desdeMs: 1_820_000, hastaMs: 2_460_000 }],
  sources: [],
  speakers: [],
  markers: [],
  ...extra,
});

describe("aResumen", () => {
  it("pasa la fecha a ISO y trae el nombre de la copropiedad", () => {
    const r = aResumen(fila());
    expect(r.date).toBe("2026-09-12T00:00:00.000Z");
    expect(r.propertyName).toBe("Los Pinos");
    expect(r).toMatchObject({ id: "m1", status: "lista", durationMs: 8_040_000, hechas: null, total: null });
  });
  it("lleva el conteo de tareas cuando se procesa", () => {
    expect(aResumen(fila({ status: "procesando" }), { hechas: 12, total: 24 })).toMatchObject({ hechas: 12, total: 24 });
  });
  it("sin la propiedad cargada no rompe", () => {
    expect(aResumen(fila({ property: null })).propertyName).toBe("Copropiedad");
    expect(aResumen(fila({ property: undefined })).propertyName).toBe("Copropiedad");
  });
});

describe("aDetalle: nada privado sale al navegador", () => {
  it("no incluye URLs de Blob ni rutas internas, solo si hay audio", () => {
    const d = aDetalle(fila({
      sources: [{ id: "s1", idx: 0, kind: "archivo", name: "a.m4a", sizeBytes: 1, mimeType: null, status: "normalizada", durationMs: 1, offsetMs: 0 }],
    }));
    const json = JSON.stringify(d);
    expect(json).not.toContain("blob.vercel-storage");
    expect(json).not.toContain("audioUrl");
    expect(json).not.toContain("transcriptUrl");
    expect(json).not.toContain("pathname");
    expect(d.meeting.hasAudio).toBe(true);
    expect(aDetalle(fila({ audioUrl: null })).meeting.hasAudio).toBe(false);
  });
  it("las fuentes salen sin su URL", () => {
    const f = aFuente({ id: "s", idx: 2, kind: "grabacion", name: "n", sizeBytes: 5, mimeType: "audio/webm", status: "recibida", durationMs: null, offsetMs: null });
    expect(Object.keys(f).sort()).toEqual(["durationMs", "id", "idx", "kind", "mimeType", "name", "offsetMs", "sizeBytes", "status"]);
  });
});

describe("aDetalle: orden y normalización", () => {
  it("ordena fuentes por posición, hablantes por quién más habla y marcadores por minuto", () => {
    const src = (idx: number) => ({ id: `s${idx}`, idx, kind: "archivo", name: "x", sizeBytes: 0, mimeType: null, status: "ok", durationMs: null, offsetMs: null });
    const hab = (label: string, talkMs: number) => ({ label, name: null, role: null, personId: null, confirmed: false, suggestion: null, talkMs, sampleStartMs: null, sampleEndMs: null });
    const d = aDetalle(fila({
      sources: [src(2), src(0), src(1)],
      speakers: [hab("V2", 100), hab("V1", 900), hab("H5", 100)],
      markers: [{ id: "b", atMs: 500, kind: "nota", note: null }, { id: "a", atMs: 100, kind: "tema", note: "x" }],
    }));
    expect(d.sources.map((s) => s.idx)).toEqual([0, 1, 2]);
    expect(d.speakers.map((s) => s.label)).toEqual(["V1", "H5", "V2"]);
    expect(d.markers.map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("tipos desconocidos se vuelven valores seguros", () => {
    expect(aMarcador({ id: "1", atMs: 0, kind: "raro", note: null }).kind).toBe("nota");
    expect(aFuente({ id: "s", idx: 0, kind: "otra", name: "n", sizeBytes: 0, mimeType: null, status: "x", durationMs: null, offsetMs: null }).kind).toBe("archivo");
  });
  it("la ficha y los silencios llegan ya leídos", () => {
    const d = aDetalle(fila());
    expect(d.digest?.decisiones.map((x) => x.id)).toEqual(["D1", "D2", "D3"]);
    expect(d.silences).toEqual([{ desdeMs: 1_820_000, hastaMs: 2_460_000 }]);
    expect(d.meeting.consentAt).toBe("2026-09-11T23:58:00.000Z");
  });
  it("una reunión sin ficha ni silencios", () => {
    const d = aDetalle(fila({ digest: null, silences: null, consentAt: null, readyAt: null, coverage: null }));
    expect(d.digest).toBeNull();
    expect(d.silences).toEqual([]);
    expect(d.meeting).toMatchObject({ consentAt: null, readyAt: null, coverage: null });
  });
});

describe("leerFicha (tolerante con lo que escribió una IA)", () => {
  it("la ficha de ejemplo se lee completa y sin cambios", () => {
    expect(leerFicha(FICHA_SEPTIEMBRE)).toEqual(
      // `undefined` en campos opcionales equivale a ausente.
      JSON.parse(JSON.stringify(FICHA_SEPTIEMBRE)),
    );
  });
  it("lo que no es una ficha da null", () => {
    for (const v of [null, undefined, "texto", 5, [], {}, { resumen: "" }, { decisiones: "x" }]) {
      expect(leerFicha(v), JSON.stringify(v)).toBeNull();
    }
  });
  it("descarta elementos mal formados y conserva el resto", () => {
    const f = leerFicha({
      resumen: "  Resumen  ",
      decisiones: [{ id: "D1", texto: "Bien", t: 10 }, { id: "D2", texto: "", t: 5 }, { texto: "sin id", t: 1 }, "x", null, { id: "D3", texto: "t malo", t: "5" }],
      compromisos: [{ id: "C1", texto: "Hacer", t: 30, responsable: "Ana", fecha: 5 }],
      votaciones: [{ t: 3, asunto: "Algo", resultado: "Aprobada", aFavor: 3, enContra: "x" }, { asunto: "sin t", resultado: "x" }],
      hablantes: [{ etiqueta: "V1", evidencia: "lo dicen", confianza: "rara" }],
      pendientes: ["uno", "", 7],
    });
    expect(f?.resumen).toBe("Resumen");
    expect(f?.decisiones).toEqual([{ id: "D1", texto: "Bien", t: 10 }]);
    expect(f?.compromisos).toEqual([{ id: "C1", texto: "Hacer", t: 30, responsable: "Ana", fecha: undefined }]);
    expect(f?.votaciones).toEqual([{ t: 3, asunto: "Algo", resultado: "Aprobada", aFavor: 3, enContra: undefined, abstenciones: undefined }]);
    expect(f?.hablantes).toEqual([{ etiqueta: "V1", evidencia: "lo dicen", confianza: "baja", nombreSugerido: undefined, rol: undefined, igualA: undefined }]);
    expect(f?.pendientes).toEqual(["uno"]);
  });
});

describe("leerRangos y leerSugerencia", () => {
  it("solo rangos con sentido", () => {
    expect(leerRangos([{ desdeMs: 1, hastaMs: 5 }, { desdeMs: 5, hastaMs: 5 }, { desdeMs: 9, hastaMs: 2 }, { desdeMs: "1", hastaMs: 2 }, null, 3])).toEqual([{ desdeMs: 1, hastaMs: 5 }]);
    expect(leerRangos(null)).toEqual([]);
    expect(leerRangos({ desdeMs: 1, hastaMs: 5 })).toEqual([]);
  });
  it("la sugerencia exige evidencia", () => {
    expect(leerSugerencia({ nombre: "Ana", evidencia: "la llaman Ana", t: 12, confianza: "alta" })).toEqual({
      nombre: "Ana", rol: undefined, evidencia: "la llaman Ana", t: 12, igualA: undefined, confianza: "alta",
    });
    expect(leerSugerencia({ nombre: "Ana" })).toBeNull();
    expect(leerSugerencia(null)).toBeNull();
    expect(leerSugerencia("Ana")).toBeNull();
    expect(aHablante({ label: "V1", name: null, role: null, personId: null, confirmed: false, suggestion: { evidencia: "x" }, talkMs: 1, sampleStartMs: null, sampleEndMs: null }).suggestion?.evidencia).toBe("x");
  });
});

describe("aPersona", () => {
  it("solo lo que la pantalla necesita (sin fechas internas)", () => {
    const p = aPersona({ id: "p1", propertyId: "c1", name: "Ana", role: "consejero", active: true, createdAt: new Date(), updatedAt: new Date() } as Parameters<typeof aPersona>[0]);
    expect(p).toEqual({ id: "p1", propertyId: "c1", name: "Ana", role: "consejero", active: true });
  });
});
