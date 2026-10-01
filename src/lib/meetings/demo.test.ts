import { describe, expect, it } from "vitest";
import { DEMO_USER } from "@/lib/demo-store";
import { demoIntervenciones, demoPersonas, demoReunion, demoReuniones } from "./demo";
import { DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE, construirHablantes, construirIntervenciones } from "./demo-datos";
import { ESTADOS_REUNION, esEstadoReunion, esTipoReunion, formatearReloj } from "./tipos";

describe("reunión de ejemplo (septiembre): el guion es coherente", () => {
  const u = construirIntervenciones();

  it("tiene una conversación real: muchas intervenciones, ordenadas y sin pisarse", () => {
    expect(u.length).toBeGreaterThanOrEqual(50);
    for (let i = 0; i < u.length; i++) {
      expect(u[i].endMs, `u${i} termina después de empezar`).toBeGreaterThan(u[i].startMs);
      expect(u[i].text.trim().length).toBeGreaterThan(10);
      if (i > 0) expect(u[i].startMs, `u${i} no empieza antes que la anterior`).toBeGreaterThan(u[i - 1].startMs);
      if (i > 0) expect(u[i].startMs, `u${i} no pisa a la anterior`).toBeGreaterThanOrEqual(u[i - 1].endMs);
    }
    expect(u[0].startMs).toBeLessThan(10_000);
    expect(u[u.length - 1].endMs).toBeLessThanOrEqual(DURACION_SEPTIEMBRE_MS);
  });

  it("los ids son únicos", () => {
    expect(new Set(u.map((x) => x.id)).size).toBe(u.length);
  });

  it("hablan cinco voces: cuatro con nombre y una sin confirmar", () => {
    const etiquetas = [...new Set(u.map((x) => x.speaker))].sort();
    expect(etiquetas).toEqual(["H5", "V1", "V2", "V3", "V4"]);
    const hablantes = construirHablantes(u);
    expect(hablantes.map((h) => h.label)).toEqual(["V1", "V2", "V3", "V4", "H5"]);
    expect(hablantes.filter((h) => h.confirmed).length).toBe(4);
    const h5 = hablantes.find((h) => h.label === "H5")!;
    expect(h5.confirmed).toBe(false);
    expect(h5.name).toBeNull();
    expect(h5.suggestion?.nombre).toBe("Andrés Gómez");
    expect(h5.suggestion?.evidencia).toContain("0:45:10");
    for (const h of hablantes) {
      expect(h.talkMs).toBeGreaterThan(0);
      expect(h.sampleEndMs! - h.sampleStartMs!).toBeGreaterThanOrEqual(4_000);
      expect(h.sampleEndMs! - h.sampleStartMs!).toBeLessThanOrEqual(6_000);
    }
  });

  it("la ficha cita minutos que existen en el guion y no repite identificadores", () => {
    const { decisiones, compromisos, votaciones, ordenDelDia } = FICHA_SEPTIEMBRE;
    expect(new Set(decisiones.map((d) => d.id)).size).toBe(decisiones.length);
    expect(new Set(compromisos.map((c) => c.id)).size).toBe(compromisos.length);
    expect(decisiones.map((d) => d.id)).toEqual(["D1", "D2", "D3"]);
    expect(compromisos.map((c) => c.id)).toEqual(["C1", "C2", "C3", "C4", "C5", "C6"]);
    for (const x of [...decisiones, ...compromisos, ...votaciones]) {
      const ms = x.t * 1000;
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(DURACION_SEPTIEMBRE_MS);
      // Cada cita cae sobre una intervención real (dentro de 2 s de su inicio).
      const cerca = u.some((i) => Math.abs(i.startMs - ms) <= 2_000);
      expect(cerca, `no hay intervención cerca de ${formatearReloj(ms)}`).toBe(true);
    }
    const inicios = ordenDelDia.map((o) => o.inicioS);
    expect([...inicios].sort((a, b) => a - b)).toEqual(inicios);
    for (const o of ordenDelDia) {
      expect(u.some((i) => Math.abs(i.startMs - o.inicioS * 1000) <= 2_000), o.titulo).toBe(true);
    }
  });

  it("la votación y los compromisos están dichos en el guion", () => {
    const texto = u.map((x) => x.text).join(" ").toLowerCase();
    expect(texto).toContain("someto a votación");
    expect(texto).toContain("tres votos a favor");
    expect(texto).toContain("provisión");
    expect(texto).toContain("informe de rondas");
  });
});

describe("almacén de demo", () => {
  it("lista cinco reuniones, la más reciente primero, con los estados principales", () => {
    const todas = demoReuniones(DEMO_USER.id);
    expect(todas.length).toBe(5);
    const fechas = todas.map((r) => r.date);
    expect([...fechas].sort().reverse()).toEqual(fechas);
    const estados = new Set(todas.map((r) => r.status));
    for (const e of ["lista", "procesando", "borrador", "error", "sin_cupo"]) expect(estados.has(e), e).toBe(true);
    for (const r of todas) {
      expect(esEstadoReunion(r.status)).toBe(true);
      expect(esTipoReunion(r.type)).toBe(true);
      expect(r.propertyName.length).toBeGreaterThan(0);
    }
  });

  it("filtra por copropiedad y no muestra reuniones de otro usuario", () => {
    expect(demoReuniones(DEMO_USER.id, "prop-demo-001").length).toBe(3);
    expect(demoReuniones(DEMO_USER.id, "prop-demo-002").length).toBe(2);
    expect(demoReuniones("otro-usuario")).toEqual([]);
    expect(demoReunion("otro-usuario", "reunion-demo-001")).toBeNull();
    expect(demoIntervenciones("otro-usuario", "reunion-demo-001")).toBeNull();
  });

  it("la reunión en proceso trae su avance (12 de 24) y la fallida, su mensaje", () => {
    const octubre = demoReunion(DEMO_USER.id, "reunion-demo-002")!;
    expect(octubre.meeting).toMatchObject({ status: "procesando", stage: "transcribiendo", hechas: 12, total: 24 });
    expect(octubre.sources.length).toBe(2);
    expect(octubre.sources[1].offsetMs).toBe(octubre.sources[0].durationMs);
    const error = demoReunion(DEMO_USER.id, "reunion-demo-004")!;
    expect(error.meeting.errorMessage).toContain("2:10:00");
    const cupo = demoReunion(DEMO_USER.id, "reunion-demo-005")!;
    expect(cupo.meeting.errorMessage).toContain("te quedan 2 h");
  });

  it("la reunión lista tiene todo: ficha, hablantes, marcadores, receso y cobertura completa", () => {
    const r = demoReunion(DEMO_USER.id, "reunion-demo-001")!;
    expect(r.meeting.status).toBe("lista");
    expect(r.meeting.coverage).toBe(1);
    expect(r.meeting.hasAudio).toBe(true);
    expect(r.digest?.decisiones.length).toBe(3);
    expect(r.speakers.length).toBe(5);
    expect(r.markers.length).toBe(3);
    expect(r.silences.length).toBe(1);
    // El receso no tiene intervenciones dentro.
    const u = demoIntervenciones(DEMO_USER.id, "reunion-demo-001")!;
    const { desdeMs, hastaMs } = r.silences[0];
    expect(u.some((x) => x.startMs >= desdeMs && x.startMs < hastaMs)).toBe(false);
  });

  it("el borrador no tiene audio ni transcripción", () => {
    const c = demoReunion(DEMO_USER.id, "reunion-demo-003")!;
    expect(c.meeting.status).toBe("borrador");
    expect(c.meeting.hasAudio).toBe(false);
    expect(c.sources).toEqual([]);
    expect(c.digest).toBeNull();
    expect(demoIntervenciones(DEMO_USER.id, "reunion-demo-003")).toEqual([]);
  });

  it("las personas de Los Pinos alimentan el selector de hablantes", () => {
    const personas = demoPersonas("prop-demo-001");
    expect(personas.map((p) => p.name)).toContain("Andrés Gómez");
    expect(personas.length).toBe(6);
    expect(demoPersonas("prop-demo-002")).toEqual([]);
  });

  it("cubre todos los estados que la interfaz sabe pintar (los demás se prueban en tipos.test)", () => {
    const usados = new Set(demoReuniones(DEMO_USER.id).map((r) => r.status));
    const sinEjemplo = ESTADOS_REUNION.filter((e) => !usados.has(e));
    expect(sinEjemplo.sort()).toEqual(["en_cola", "grabando", "subiendo"]);
  });
});
