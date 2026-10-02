import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_USER } from "@/lib/demo-store";
import {
  MAX_PERSONAS_DEMO, MAX_REUNIONES_DEMO, demoActualizarPersona, demoActualizarReunion, demoCrearPersona, demoCrearReunion,
  demoEliminarPersona, demoEliminarReunion, demoIntervenciones, demoPersonas, demoPrepararSubida, demoProcesar, demoQuitarFuente,
  demoRegistrarFuente, demoReunion, demoReuniones, reiniciarDemoReuniones,
} from "./demo";
import { MAX_FUENTES_POR_REUNION } from "./tipos";
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

describe("el demo permite crear, editar y borrar (con tope)", () => {
  beforeEach(() => reiniciarDemoReuniones());

  it("crea un borrador que aparece primero si es el más reciente", () => {
    const creada = demoCrearReunion(DEMO_USER.id, { propertyId: "prop-demo-001", type: "consejo", title: "Nueva", date: new Date("2030-01-01T10:00:00Z") })!;
    expect(creada).toMatchObject({ status: "borrador", title: "Nueva", propertyName: "Conjunto Residencial Los Pinos", durationMs: null });
    expect(demoReuniones(DEMO_USER.id)[0].id).toBe(creada.id);
    expect(demoReunion(DEMO_USER.id, creada.id)?.sources).toEqual([]);
  });
  it("las ids no se repiten aunque se creen en el mismo milisegundo", () => {
    const ids = new Set(Array.from({ length: 10 }, () => demoCrearReunion(DEMO_USER.id, { propertyId: "prop-demo-001", type: "otra", title: "x", date: new Date() })!.id));
    expect(ids.size).toBe(10);
  });
  it("respeta el tope del demo", () => {
    let creadas = 0;
    for (let i = 0; i < MAX_REUNIONES_DEMO + 5; i++) {
      if (demoCrearReunion(DEMO_USER.id, { propertyId: "prop-demo-001", type: "otra", title: `r${i}`, date: new Date() })) creadas++;
    }
    expect(creadas).toBe(MAX_REUNIONES_DEMO - 5); // ya hay 5 sembradas
    expect(demoReuniones(DEMO_USER.id).length).toBe(MAX_REUNIONES_DEMO);
  });
  it("edita título, tipo, fecha y constancia; no toca el estado", () => {
    const antes = demoReunion(DEMO_USER.id, "reunion-demo-003")!.meeting;
    const r = demoActualizarReunion(DEMO_USER.id, "reunion-demo-003", {
      title: "Otro título", type: "asamblea_extraordinaria", date: new Date("2031-02-03T04:05:06Z"), consentAt: new Date("2031-02-03T04:00:00Z"),
    })!;
    expect(r).toMatchObject({ title: "Otro título", type: "asamblea_extraordinaria", date: "2031-02-03T04:05:06.000Z", status: antes.status });
    expect(demoReunion(DEMO_USER.id, "reunion-demo-003")!.meeting.consentAt).toBe("2031-02-03T04:00:00.000Z");
    demoActualizarReunion(DEMO_USER.id, "reunion-demo-003", { consentAt: null });
    expect(demoReunion(DEMO_USER.id, "reunion-demo-003")!.meeting.consentAt).toBeNull();
  });
  it("no edita ni borra reuniones de otro usuario ni inexistentes", () => {
    expect(demoActualizarReunion("otro", "reunion-demo-001", { title: "x" })).toBeNull();
    expect(demoEliminarReunion("otro", "reunion-demo-001")).toBe(false);
    expect(demoEliminarReunion(DEMO_USER.id, "no-existe")).toBe(false);
    expect(demoReuniones(DEMO_USER.id).length).toBe(5);
  });
  it("borra", () => {
    expect(demoEliminarReunion(DEMO_USER.id, "reunion-demo-003")).toBe(true);
    expect(demoReunion(DEMO_USER.id, "reunion-demo-003")).toBeNull();
    expect(demoReuniones(DEMO_USER.id).length).toBe(4);
  });

  it("personas: crea, no duplica por nombre (sin distinguir mayúsculas) y las lista por nombre", () => {
    const a = demoCrearPersona("prop-demo-001", { name: "Zoe Vargas", role: "consejero" })!;
    const b = demoCrearPersona("prop-demo-001", { name: "zoe vargas", role: null })!;
    expect(a.creada).toBe(true);
    expect(b.creada).toBe(false);
    expect(b.persona.id).toBe(a.persona.id);
    const nombres = demoPersonas("prop-demo-001").map((p) => p.name);
    expect(nombres.length).toBe(7);
    expect([...nombres].sort((x, y) => x.localeCompare(y, "es"))).toEqual(nombres);
    // En otra copropiedad sí es otra persona.
    expect(demoCrearPersona("prop-demo-002", { name: "Zoe Vargas", role: null })!.persona.id).not.toBe(a.persona.id);
  });
  it("personas: edita, desactiva (deja de listarse) y borra, solo dentro de su copropiedad", () => {
    const p = demoCrearPersona("prop-demo-001", { name: "Ana Mora", role: null })!.persona;
    expect(demoActualizarPersona("prop-demo-001", p.id, { name: "Ana M. Mora", role: "contador" })).toMatchObject({ name: "Ana M. Mora", role: "contador" });
    expect(demoActualizarPersona("prop-demo-002", p.id, { name: "x" })).toBeNull();
    demoActualizarPersona("prop-demo-001", p.id, { active: false });
    expect(demoPersonas("prop-demo-001").some((x) => x.id === p.id)).toBe(false);
    expect(demoEliminarPersona("prop-demo-002", p.id)).toBe(false);
    expect(demoEliminarPersona("prop-demo-001", p.id)).toBe(true);
    expect(demoEliminarPersona("prop-demo-001", p.id)).toBe(false);
  });
  it("personas: respeta el tope", () => {
    let creadas = 0;
    for (let i = 0; i < MAX_PERSONAS_DEMO + 5; i++) if (demoCrearPersona("prop-demo-001", { name: `Persona ${i}`, role: null })) creadas++;
    expect(creadas).toBe(MAX_PERSONAS_DEMO - 6); // ya hay 6 sembradas
  });
});

describe("el demo entrega copias, no su estado interno", () => {
  beforeEach(() => reiniciarDemoReuniones());
  it("modificar lo leído no cambia el almacén", () => {
    const a = demoReunion(DEMO_USER.id, "reunion-demo-001")!;
    a.sources.push({ id: "x", idx: 9, kind: "archivo", name: "x", sizeBytes: 1, mimeType: null, status: "ok", durationMs: null, offsetMs: null });
    a.speakers[0].name = "Cambiado";
    a.digest!.decisiones.length = 0;
    a.meeting.title = "Otro";
    const b = demoReunion(DEMO_USER.id, "reunion-demo-001")!;
    expect(b.sources.length).toBe(1);
    expect(b.speakers[0].name).toBe("Martha López");
    expect(b.digest!.decisiones.length).toBe(3);
    expect(b.meeting.title).toBe("Reunión de consejo — septiembre");
  });
});

describe("el demo simula la subida de archivos", () => {
  beforeEach(() => reiniciarDemoReuniones());
  const U = DEMO_USER.id;
  const reg = (id: string, n: number) => demoRegistrarFuente(U, id, { nombre: `parte-${n}.mp3`, tamano: 1000 + n, tipo: "audio/mpeg", pathname: `meetings/${id}/fuentes/aaaaaaa${n}-parte-${n}.mp3` });

  it("preparar una subida pasa el borrador a «Subiendo»", () => {
    expect(demoPrepararSubida(U, "reunion-demo-003")).toEqual({ ok: true, valor: null });
    expect(demoReunion(U, "reunion-demo-003")!.meeting.status).toBe("subiendo");
  });
  it("no se suben archivos a una reunión que ya se procesa o ya está lista; ni a una que no existe", () => {
    expect(demoPrepararSubida(U, "reunion-demo-001")).toMatchObject({ ok: false, codigo: "cerrada" });
    expect(demoPrepararSubida(U, "reunion-demo-002")).toMatchObject({ ok: false, codigo: "cerrada" });
    expect(demoPrepararSubida(U, "no-existe")).toMatchObject({ ok: false, codigo: "no_existe" });
    expect(demoPrepararSubida("otro", "reunion-demo-003")).toMatchObject({ ok: false, codigo: "no_existe" });
  });
  it("registra archivos en orden, y registrar dos veces el mismo no lo duplica", () => {
    const a = reg("reunion-demo-003", 1);
    const b = reg("reunion-demo-003", 2);
    expect(a.ok && a.valor.creada).toBe(true);
    expect(b.ok && b.valor.fuente.idx).toBe(1);
    const otra = reg("reunion-demo-003", 1);
    expect(otra.ok && otra.valor.creada).toBe(false);
    const d = demoReunion(U, "reunion-demo-003")!;
    expect(d.sources.map((f) => f.name)).toEqual(["parte-1.mp3", "parte-2.mp3"]);
    expect(d.meeting.status).toBe("subiendo");
    expect(d.sources.every((f) => f.status === "recibida")).toBe(true);
  });
  it("respeta el tope de archivos por reunión", () => {
    for (let n = 0; n < MAX_FUENTES_POR_REUNION; n++) expect(reg("reunion-demo-003", n).ok).toBe(true);
    expect(reg("reunion-demo-003", 999)).toMatchObject({ ok: false, codigo: "tope" });
  });
  it("quitar un archivo renumera; sin archivos la reunión vuelve a borrador", () => {
    reg("reunion-demo-003", 1);
    reg("reunion-demo-003", 2);
    reg("reunion-demo-003", 3);
    const d = demoReunion(U, "reunion-demo-003")!;
    expect(demoQuitarFuente(U, "reunion-demo-003", d.sources[0].id)).toEqual({ ok: true, valor: null });
    expect(demoReunion(U, "reunion-demo-003")!.sources.map((f) => [f.name, f.idx])).toEqual([["parte-2.mp3", 0], ["parte-3.mp3", 1]]);
    for (const f of demoReunion(U, "reunion-demo-003")!.sources) demoQuitarFuente(U, "reunion-demo-003", f.id);
    expect(demoReunion(U, "reunion-demo-003")!.meeting.status).toBe("borrador");
    expect(demoQuitarFuente(U, "reunion-demo-003", "no-existe")).toMatchObject({ ok: false, codigo: "no_existe" });
  });
  it("procesar: pide archivos, pasa a «en cola» y es idempotente", () => {
    expect(demoProcesar(U, "reunion-demo-003")).toMatchObject({ ok: false, codigo: "vacia" });
    reg("reunion-demo-003", 1);
    expect(demoProcesar(U, "reunion-demo-003")).toEqual({ ok: true, valor: { status: "en_cola" } });
    expect(demoReunion(U, "reunion-demo-003")!.meeting.status).toBe("en_cola");
    expect(demoProcesar(U, "reunion-demo-003")).toEqual({ ok: true, valor: { status: "en_cola" } });
    // Ya cerrada a la captura: no admite más archivos.
    expect(reg("reunion-demo-003", 2)).toMatchObject({ ok: false, codigo: "cerrada" });
    expect(demoProcesar(U, "reunion-demo-001")).toEqual({ ok: true, valor: { status: "lista" } });
  });
});
