/**
 * Las tareas del acta, cada una por separado (base de datos falsa, IA simulada, almacén en una carpeta) y, al final, el acta
 * recorriendo TODO el camino con el trabajador de la cola: calentar la caché → secciones → acta final, con fallos y reintentos.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fake, correo } = vi.hoisted(() => ({ fake: { db: null as unknown }, correo: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/email", () => ({ sendMeetingReadyEmail: (...a: unknown[]) => correo(...a) }));

import {
  SISTEMA_DE_ACTA, armarActa, construirPedidoDeSeccion, planificarSecciones, type SeccionDeActa, type SeccionRedactada,
} from "./acta";
import { avanzarActa, iniciarActa, reanudarActa } from "./acta-orquestador";
import {
  actaFinalTarea, calentarActaTarea, leerResultadoDeSeccion, leerUsoGuardado, prefijoDe, seccionDeActaTarea, tokensDeUso,
} from "./acta-tareas";
import { leerTodo } from "./almacen";
import { AlmacenLocal } from "./almacen-local";
import { cargarContextoDeReunion } from "./contexto-reunion";
import { ErrorTarea, type ContextoTarea } from "./contratos";
import { DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE, construirHablantes, construirIntervenciones } from "./demo-datos";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { ErrorIA, USO_VACIO, type ClienteIA } from "./ia";
import { crearIASimulada } from "./ia-simulada";
import { MANEJADORES } from "./manejadores";
import { trabajar } from "./trabajador";
import { claveActaCalentar, claveActaFinal, claveActaSeccion } from "./transcripcion/claves";

const ID = "reunionprueba1";
const AHORA = new Date("2026-10-05T15:00:00Z");
const SECCIONES = planificarSecciones(FICHA_SEPTIEMBRE, DURACION_SEPTIEMBRE_MS);
const N = SECCIONES.length;

let db: DbFalsa;
let almacen: AlmacenLocal;
let raiz: string;
beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), "acta-tareas-"));
});
afterAll(() => rmSync(raiz, { recursive: true, force: true }));
beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  almacen = new AlmacenLocal(join(raiz, String(Math.random()).slice(2)));
  correo.mockReset();
  vi.stubEnv("MEETINGS_EFFORT", "");
});
afterEach(() => vi.unstubAllEnvs());

async function sembrarReunion() {
  await db.meeting.create({
    data: {
      id: ID, userId: "u1", propertyId: "prop1", type: "consejo", title: "Reunión de consejo — septiembre", date: new Date("2026-09-16T00:00:00Z"),
      status: "lista", durationMs: DURACION_SEPTIEMBRE_MS, digest: structuredClone(FICHA_SEPTIEMBRE), property: { name: "Conjunto Los Pinos" },
    },
  });
  await db.user.create({ data: { id: "u1", email: "ana@ejemplo.com", company: "Administraciones Ana", logoUrl: null, brandColor: "#0f766e" } });
  const intervenciones = construirIntervenciones();
  intervenciones.forEach((u, idx) => db.meetingUtterance.filas.push({ id: u.id, meetingId: ID, idx, startMs: u.startMs, endMs: u.endMs, speaker: u.speaker, text: u.text }));
  for (const h of construirHablantes(intervenciones)) {
    await db.meetingSpeaker.create({ data: { meetingId: ID, label: h.label, name: h.name, role: h.role, talkMs: h.talkMs } });
  }
}

async function iniciar(): Promise<string> {
  const r = await iniciarActa({ meetingId: ID, userId: "u1" });
  if (!r.ok) throw new Error(r.error);
  return r.generationId;
}

type Extra = { intento?: number; ia?: ClienteIA; requisitos?: (texto: string) => Promise<unknown[]> };
const ctx = (key: string, kind: string, payload: Record<string, unknown>, { intento = 1, ia = crearIASimulada(), requisitos }: Extra = {}): ContextoTarea => ({
  tarea: { id: "x", meetingId: ID, kind, key, payload, attempts: intento },
  presupuestoMs: 230_000,
  senal: new AbortController().signal,
  deps: { almacen, ahora: () => AHORA, ia, requisitosDeActa: requisitos ?? (async () => []) },
});
const payloadDeSeccion = (gen: string, s: SeccionDeActa) => ({ generationId: gen, total: N, titulo: s.titulo, seccion: s });
const ctxSeccion = (gen: string, k: number, extra: Extra = {}) => ctx(claveActaSeccion(gen, k), "acta_seccion", payloadDeSeccion(gen, SECCIONES[k]), extra);
const ctxCalentar = (gen: string, extra: Extra = {}) => ctx(claveActaCalentar(gen), "acta_calentar", { generationId: gen, secciones: SECCIONES }, extra);
const ctxFinal = (gen: string, extra: Extra = {}) => ctx(claveActaFinal(gen), "acta_final", { generationId: gen, total: N }, extra);

const resultado = (r: unknown): Record<string, unknown> => (r as { resultado: Record<string, unknown> }).resultado;
const fallo = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error);

/* ════════════════════════════════════════════════════════════════════
   Lo común
   ════════════════════════════════════════════════════════════════════ */

describe("leerUsoGuardado y tokensDeUso", () => {
  it("lee el uso guardado y lo que no cuadra cuenta como cero", () => {
    expect(leerUsoGuardado({ entrada: 10, salida: 5, cacheLectura: 100, cacheEscritura: 7, costoUsd: 0.25 })).toEqual({ entrada: 10, salida: 5, cacheLectura: 100, cacheEscritura: 7, costoUsd: 0.25 });
    expect(leerUsoGuardado({ entrada: -1, salida: "x", costoUsd: NaN })).toEqual(USO_VACIO);
    for (const raro of [null, undefined, "x", 3, []]) expect(leerUsoGuardado(raro)).toEqual(USO_VACIO);
  });
  it("los tokens son todos los que se leyeron o escribieron, como en el análisis de la reunión", () => {
    expect(tokensDeUso({ entrada: 1, salida: 2, cacheLectura: 30, cacheEscritura: 400, costoUsd: 9 })).toBe(433);
  });
});

describe("leerResultadoDeSeccion", () => {
  it("lee una sección hecha, y no acepta una sin texto ni una mal formada", () => {
    const ok = leerResultadoDeSeccion({ k: 2, markdown: "Texto.", ignorados: ["D9", 4], uso: { costoUsd: 1 }, modelo: "claude-opus-5-5" });
    expect(ok).toMatchObject({ k: 2, markdown: "Texto.", ignorados: ["D9"], uso: { costoUsd: 1 }, modelo: "claude-opus-5-5" });
    for (const malo of [null, [], { k: 1 }, { k: 1, markdown: "   " }, { k: "1", markdown: "x" }, { markdown: "x" }, { omitida: "el acta ya no existe" }]) {
      expect(leerResultadoDeSeccion(malo)).toBeNull();
    }
  });
});

describe("prefijoDe", () => {
  it("es el mismo, byte a byte, cada vez que se arma (la caché del servicio lo exige) y trae la reunión completa", async () => {
    await sembrarReunion();
    const a = prefijoDe((await cargarContextoDeReunion(ID))!);
    const b = prefijoDe((await cargarContextoDeReunion(ID))!);
    expect(a).toBe(b);
    expect(a).toContain("Copropiedad: Conjunto Los Pinos");
    expect(a).toContain("V1 = Martha López (Presidente del consejo)");
    expect(a).toContain("H5 = (voz sin nombre confirmado)");
    expect(a).toContain("TRANSCRIPCIÓN COMPLETA");
    const intervenciones = construirIntervenciones();
    expect(a).toContain(intervenciones[0].text);
    expect(a).toContain(intervenciones[intervenciones.length - 1].text);
  });

  it("cambia si cambia la reunión: una voz renombrada no se confunde con la de antes", async () => {
    await sembrarReunion();
    const antes = prefijoDe((await cargarContextoDeReunion(ID))!);
    await db.meetingSpeaker.updateMany({ where: { meetingId: ID, label: "H5" }, data: { name: "Andrés Gómez", role: "Consejero" } });
    const despues = prefijoDe((await cargarContextoDeReunion(ID))!);
    expect(despues).not.toBe(antes);
    expect(despues).toContain("H5 = Andrés Gómez");
  });
});

/* ════════════════════════════════════════════════════════════════════
   acta_calentar
   ════════════════════════════════════════════════════════════════════ */

describe("acta_calentar", () => {
  it("escribe en la caché la transcripción completa, con el mismo sistema y esfuerzo que usarán las secciones", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    const r = await calentarActaTarea(ctxCalentar(gen, { ia }));
    expect(ia.calentamientos).toHaveLength(1);
    const e = ia.calentamientos[0];
    expect(e.sistema).toBe(SISTEMA_DE_ACTA);
    expect(e.compartido).toBe(prefijoDe((await cargarContextoDeReunion(ID))!));
    expect(e.esfuerzo).toBe("high");
    expect(e.etiqueta).toBe("el acta");
    expect(e.timeoutMs).toBeLessThanOrEqual(200_000);
    expect(resultado(r)).toMatchObject({ calentada: true, modelo: "claude-opus-5-5" });
    // La caché se escribió: eso es lo que costó el calentamiento.
    expect((resultado(r).uso as { cacheEscritura: number }).cacheEscritura).toBeGreaterThan(1_000);
  });

  it("usa el esfuerzo configurado", async () => {
    vi.stubEnv("MEETINGS_EFFORT", "xhigh");
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    await calentarActaTarea(ctxCalentar(gen, { ia }));
    expect(ia.calentamientos[0].esfuerzo).toBe("xhigh");
  });

  it("un fallo del momento se reintenta; agotados los intentos, el acta sigue SIN caché (no se detiene)", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const saturada = crearIASimulada({ alCalentar: () => { throw new ErrorIA("El servicio de IA está saturado.", { reintentable: true }); } });
    for (const intento of [1, 2]) {
      const e = await fallo(calentarActaTarea(ctxCalentar(gen, { ia: saturada, intento })));
      expect(e).toBeInstanceOf(ErrorIA);
      expect((e as ErrorIA).reintentable).toBe(true);
    }
    const r = await calentarActaTarea(ctxCalentar(gen, { ia: saturada, intento: 3 }));
    expect(resultado(r)).toMatchObject({ calentada: false, motivo: "El servicio de IA está saturado.", uso: USO_VACIO });
  });

  it("un fallo sin arreglo tampoco la detiene: lo dirán las secciones con su propio mensaje", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const sinSaldo = crearIASimulada({ alCalentar: () => { throw new ErrorIA("No pudimos analizar la reunión con IA: el servicio no tiene saldo disponible.", { reintentable: false }); } });
    const r = await calentarActaTarea(ctxCalentar(gen, { ia: sinSaldo, intento: 1 }));
    expect(resultado(r)).toMatchObject({ calentada: false });
  });

  it("un error cualquiera de la red cuenta como un fallo del momento", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada({ alCalentar: () => { throw Object.assign(new Error("fetch failed"), { status: 503 }); } });
    const e = await fallo(calentarActaTarea(ctxCalentar(gen, { ia, intento: 1 })));
    expect(e).toBeInstanceOf(ErrorIA);
    expect((e as ErrorIA).reintentable).toBe(true);
  });

  it("no hace nada si el acta ya está lista o ya no existe, ni si la reunión se borró", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    await db.generation.updateMany({ where: { id: gen }, data: { status: "completed" } });
    expect(resultado(await calentarActaTarea(ctxCalentar(gen, { ia })))).toEqual({ omitida: "el acta ya está lista" });
    expect(resultado(await calentarActaTarea(ctxCalentar("noexiste", { ia })))).toEqual({ omitida: "el acta ya no existe" });
    await db.generation.updateMany({ where: { id: gen }, data: { status: "processing" } });
    db.meeting.filas.length = 0;
    expect(resultado(await calentarActaTarea(ctxCalentar(gen, { ia })))).toEqual({ omitida: "la reunión ya no existe" });
    expect(ia.calentamientos).toHaveLength(0);
  });

  it("si el acta se detuvo por un fallo, la tarea no se ejecuta: queda «fallida» y se retoma con «Intentar de nuevo»", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    await db.generation.updateMany({ where: { id: gen }, data: { status: "failed" } });
    const ia = crearIASimulada();
    const e = await fallo(calentarActaTarea(ctxCalentar(gen, { ia })));
    expect(e).toBeInstanceOf(ErrorTarea);
    expect((e as ErrorTarea).reintentable).toBe(false);
    expect(ia.calentamientos).toHaveLength(0);
  });

  it("una tarea cuya clave no es de un acta no se puede ejecutar", async () => {
    await sembrarReunion();
    const e = await fallo(calentarActaTarea(ctx("ficha", "acta_calentar", {})));
    expect(e).toBeInstanceOf(ErrorTarea);
    expect((e as ErrorTarea).reintentable).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════
   acta_seccion
   ════════════════════════════════════════════════════════════════════ */

describe("acta_seccion", () => {
  it("manda a la IA el MISMO prefijo que el calentamiento (la caché lo exige) y el pedido de SU sección", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    const r = await seccionDeActaTarea(ctxSeccion(gen, 2, { ia }));

    expect(ia.textos).toHaveLength(1);
    const e = ia.textos[0];
    expect(e.sistema).toBe(SISTEMA_DE_ACTA);
    expect(e.compartido).toBe(prefijoDe((await cargarContextoDeReunion(ID))!));
    expect(e.turnos).toEqual([{ rol: "user", texto: construirPedidoDeSeccion({ seccion: SECCIONES[2], total: N, ficha: FICHA_SEPTIEMBRE }) }]);
    expect(e.etiqueta).toBe("la sección 3 del acta");
    expect(e.esfuerzo).toBe("high");
    expect(e.timeoutMs).toBeLessThanOrEqual(200_000);
    expect(e.permitirCorte).toBeUndefined(); // un acta cortada no sirve: es un fallo

    // Lo que guarda: el texto de la sección, con la decisión y el compromiso que le tocaban y sus minutos.
    const guardado = leerResultadoDeSeccion(resultado(r));
    expect(guardado).toMatchObject({ k: 2, modelo: "claude-opus-5-5", ignorados: [] });
    expect(guardado!.markdown).toContain("[[D1]]");
    expect(guardado!.markdown).toContain("[[C3]]");
    expect(guardado!.markdown).toContain("[[C4]]");
    expect(guardado!.markdown).toMatch(/\[\[t=\d{2}:\d{2}:\d{2}\]\]/);
    expect(guardado!.uso.costoUsd).toBeGreaterThan(0);
  });

  it("el esfuerzo es el mismo en TODOS los intentos: bajarlo en un reintento invalidaría la caché y se pagaría la transcripción otra vez", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    for (const intento of [1, 2, 3]) await seccionDeActaTarea(ctxSeccion(gen, 0, { ia, intento }));
    expect(ia.textos.map((e) => e.esfuerzo)).toEqual(["high", "high", "high"]);
    vi.stubEnv("MEETINGS_EFFORT", "max");
    await seccionDeActaTarea(ctxSeccion(gen, 0, { ia, intento: 3 }));
    expect(ia.textos[3].esfuerzo).toBe("max");
  });

  it("limpia lo que escribe la IA: sin HTML, sin títulos, sin marcadores que no existen; y lo dice", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    ia.generarTexto = async (entrada) => {
      ia.textos.push(entrada);
      return {
        texto: "## Ascensores\n\nSe aprobó <b>prorrogar</b> el contrato & más. [[D1]] [[D9]] [[t=01:05:30]] [[t=09:00:00]]",
        uso: USO_VACIO, modelo: "claude-opus-5-5", conRespaldo: false, cortada: false,
      };
    };
    const r = await seccionDeActaTarea(ctxSeccion(gen, 2, { ia }));
    expect(resultado(r).markdown).toBe("**Ascensores**\n\nSe aprobó &lt;b&gt;prorrogar&lt;/b&gt; el contrato &amp; más. [[D1]] [[t=01:05:30]]");
    expect(resultado(r).ignorados).toEqual(["D9", "t=09:00:00"]);
  });

  it("si la IA no devuelve nada que sirva, se reintenta", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    ia.generarTexto = async () => ({ texto: "[[D9]]", uso: USO_VACIO, modelo: "m", conRespaldo: false, cortada: false });
    const e = await fallo(seccionDeActaTarea(ctxSeccion(gen, 1, { ia })));
    expect(e).toBeInstanceOf(ErrorIA);
    expect((e as ErrorIA).reintentable).toBe(true);
    expect((e as ErrorIA).message).toBe("La IA no devolvió texto para la sección 2 del acta. Se vuelve a intentar.");
  });

  it("un fallo de la IA sube tal cual para que la cola lo reintente o no, según su causa", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const sinArreglo = crearIASimulada({ alLlamarTexto: () => { throw new ErrorIA("El servicio de IA rechazó la solicitud.", { reintentable: false }); } });
    const a = await fallo(seccionDeActaTarea(ctxSeccion(gen, 0, { ia: sinArreglo })));
    expect(a).toBeInstanceOf(ErrorIA);
    expect((a as ErrorIA).reintentable).toBe(false);
    const delMomento = crearIASimulada({ alLlamarTexto: () => { throw Object.assign(new Error("overloaded"), { status: 529 }); } });
    const b = await fallo(seccionDeActaTarea(ctxSeccion(gen, 0, { ia: delMomento })));
    expect(b).toBeInstanceOf(ErrorIA);
    expect((b as ErrorIA).reintentable).toBe(true);
    expect((b as ErrorIA).message).toBe("El servicio de IA está saturado. Se vuelve a intentar.");
  });

  it("no se ejecuta sin saber qué sección redactar, ni si el acta ya está lista, se detuvo o no existe", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const ia = crearIASimulada();
    for (const payload of [{}, { total: N }, { seccion: SECCIONES[0] }, { total: 0, seccion: SECCIONES[0] }, { total: N, seccion: { k: 0 } }]) {
      const e = await fallo(seccionDeActaTarea(ctx(claveActaSeccion(gen, 0), "acta_seccion", payload, { ia })));
      expect(e, JSON.stringify(payload)).toBeInstanceOf(ErrorTarea);
      expect((e as ErrorTarea).reintentable).toBe(false);
    }
    await db.generation.updateMany({ where: { id: gen }, data: { status: "completed" } });
    expect(resultado(await seccionDeActaTarea(ctxSeccion(gen, 0, { ia })))).toEqual({ omitida: "el acta ya está lista" });
    await db.generation.updateMany({ where: { id: gen }, data: { status: "failed" } });
    expect(await fallo(seccionDeActaTarea(ctxSeccion(gen, 0, { ia })))).toBeInstanceOf(ErrorTarea);
    expect(resultado(await seccionDeActaTarea(ctxSeccion("noexiste", 0, { ia })))).toEqual({ omitida: "el acta ya no existe" });
    expect(ia.textos).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════
   acta_final
   ════════════════════════════════════════════════════════════════════ */

const USO_SECCION = (k: number) => ({ entrada: 1_000 + k, salida: 2_000 + k, cacheLectura: 150_000, cacheEscritura: 0, costoUsd: 0.1 + k / 100 });
const USO_CALENTAR = { entrada: 10, salida: 0, cacheLectura: 0, cacheEscritura: 150_000, costoUsd: 1.2 };

/** El acta lista para armar: calentamiento y todas las secciones hechas, con un texto que recoge lo que cada una debía. */
async function actaConSeccionesHechas({ sin = [] as string[], solo }: { sin?: string[]; solo?: number[] } = {}) {
  await sembrarReunion();
  const gen = await iniciar();
  await db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaCalentar(gen) }, data: { status: "hecha", result: { calentada: true, uso: USO_CALENTAR } } });
  const redactadas: SeccionRedactada[] = [];
  for (const s of SECCIONES) {
    if (solo && !solo.includes(s.k)) continue;
    const ids = [...s.decisiones, ...s.compromisos].filter((id) => !sin.includes(id)).map((id) => `[[${id}]]`).join(" ");
    // Lo que deja `limpiarSeccion`: el `&` ya viene escrito como entidad.
    const markdown = `[[t=00:00:05]] Se trató ${s.titulo} &amp; más. ${ids}`.trim();
    redactadas.push({ seccion: s, markdown });
    await db.meetingTask.create({
      data: {
        meetingId: ID, kind: "acta_seccion", key: claveActaSeccion(gen, s.k), status: "hecha", payload: payloadDeSeccion(gen, s),
        result: { k: s.k, markdown, ignorados: [], uso: USO_SECCION(s.k), modelo: "claude-opus-5-5" },
      },
    });
  }
  return { gen, redactadas };
}

const archivo = async (url: string) => new TextDecoder().decode(await leerTodo(almacen, url));
const generacion = () => db.generation.filas[0] as Record<string, unknown> & { outputFiles: Record<string, string> };

describe("acta_final", () => {
  it("arma el acta, sube sus tres archivos y deja la generación «completed» con sus costos", async () => {
    const { gen, redactadas } = await actaConSeccionesHechas();
    const requisitos = vi.fn(async () => [{ item: "Tipo de reunion", status: "completo", detail: "Consejo" }]);
    const r = await actaFinalTarea(ctxFinal(gen, { requisitos }));

    const esperada = armarActa({
      datos: { propiedad: "Conjunto Los Pinos", tipo: "consejo", fecha: new Date("2026-09-16T00:00:00Z"), duracionMs: DURACION_SEPTIEMBRE_MS },
      ficha: FICHA_SEPTIEMBRE, secciones: redactadas, asistentes: FICHA_SEPTIEMBRE.asistentes,
    });
    const g = generacion();
    expect(g).toMatchObject({ status: "completed", progress: 100, errorMessage: null, completedAt: AHORA });
    expect(Object.keys(g.outputFiles).sort()).toEqual(["actaHtml", "actaMarkdown", "actaPendientes", "actaReferencias", "actaRequirements"]);
    expect(g.outputFiles.actaHtml).toBe(`local://generations/${gen}/acta.html`);
    expect(JSON.parse(g.outputFiles.actaPendientes)).toEqual(esperada.pendientes);
    expect(JSON.parse(g.outputFiles.actaRequirements)).toEqual([{ item: "Tipo de reunion", status: "completo", detail: "Consejo" }]);

    // Lo que costó el acta: el calentamiento y cada sección (calculado aparte, no con el código de la tarea).
    const costo = USO_CALENTAR.costoUsd + SECCIONES.reduce((s, x) => s + USO_SECCION(x.k).costoUsd, 0);
    const tokens = USO_CALENTAR.entrada + USO_CALENTAR.cacheEscritura + SECCIONES.reduce((s, x) => s + 1_000 + x.k + 2_000 + x.k + 150_000, 0);
    expect(g.costUsd as number).toBeCloseTo(costo, 10);
    expect(g.tokensUsed).toBe(tokens);
    expect(db.usageRecord.filas).toHaveLength(1);
    expect(db.usageRecord.filas[0]).toMatchObject({ userId: "u1", tokens, type: "reunion_acta" });
    expect(db.usageRecord.filas[0].costUsd as number).toBeCloseTo(costo, 10);
    expect(resultado(r)).toMatchObject({ secciones: N, pendientes: esperada.pendientes.length, requisitos: 1, tokens });
    // La reunión no se toca: el acta es de su generación.
    expect(db.meeting.filas[0]).toMatchObject({ status: "lista" });
  });

  it("el HTML es el documento del acta con la marca de quien administra, y el markdown, el mismo texto sin etiquetas ni entidades", async () => {
    const { gen } = await actaConSeccionesHechas();
    await actaFinalTarea(ctxFinal(gen));
    const html = await archivo(generacion().outputFiles.actaHtml);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Acta de reunión");
    expect(html).toContain("Conjunto Los Pinos");
    expect(html).toContain("15 de septiembre de 2026"); // 7 p. m. del 15 en Bogotá (la reunión es del 16 a las 00:00 UTC)
    expect(html).toContain("Administraciones Ana");
    expect(html).toContain("#0f766e");
    expect(html).toContain("<h3>1. ASISTENTES</h3>");
    expect(html).toContain("Martha López");
    expect(html).toContain("Se trató Verificación del quórum y aprobación del orden del día &amp; más.");
    expect(html).not.toContain("[[");
    expect(html).not.toMatch(/<script/i);

    const md = await archivo(generacion().outputFiles.actaMarkdown);
    expect(md).toContain("## ACTA No. [PENDIENTE DE COMPLETAR] — CONSEJO DE ADMINISTRACIÓN");
    expect(md).toContain("Se trató Verificación del quórum y aprobación del orden del día & más.");
    expect(md).not.toContain("&amp;");
    expect(md).not.toContain("[[");

    const referencias = await archivo(generacion().outputFiles.actaReferencias);
    expect(referencias).toContain("[[t=00:00:05]] Se trató");
    expect(referencias).toContain("[[D1]]");
    expect(referencias).toContain("| N.º | Compromiso | Responsable | Fecha | Minuto |");
    expect(referencias).toContain("&amp; más"); // las referencias son «markdown seguro»: la vista las desescapa al mostrarlas

    expect(almacen.tipos.get(`generations/${gen}/acta.html`)).toBe("text/html; charset=utf-8");
    expect(almacen.tipos.get(`generations/${gen}/acta.md`)).toBe("text/markdown; charset=utf-8");
  });

  it("la revisión de requisitos recibe el texto plano del acta (sin marcadores ni entidades); si falla, el acta sale igual sin ella", async () => {
    const { gen } = await actaConSeccionesHechas();
    const recibido: string[] = [];
    await actaFinalTarea(ctxFinal(gen, { requisitos: async (texto) => { recibido.push(texto); throw new Error("Haiku no responde"); } }));
    expect(recibido).toHaveLength(1);
    expect(recibido[0]).toContain("Se trató Verificación del quórum y aprobación del orden del día & más.");
    expect(recibido[0]).not.toContain("[[");
    expect(recibido[0]).not.toContain("&amp;");
    expect(generacion().status).toBe("completed");
    expect(Object.keys(generacion().outputFiles)).not.toContain("actaRequirements");
  });

  it("una revisión vacía no deja un «actaRequirements» vacío", async () => {
    const { gen } = await actaConSeccionesHechas();
    await actaFinalTarea(ctxFinal(gen, { requisitos: async () => [] }));
    expect(Object.keys(generacion().outputFiles)).not.toContain("actaRequirements");
  });

  it("lo que ninguna sección recogió queda en «Pendientes de verificación»", async () => {
    const { gen } = await actaConSeccionesHechas({ sin: ["D2", "C5"] });
    await actaFinalTarea(ctxFinal(gen));
    const pendientes = JSON.parse(generacion().outputFiles.actaPendientes) as string[];
    expect(pendientes.filter((p) => /no quedó desarrollad/.test(p))).toHaveLength(2);
    expect(pendientes.some((p) => p.startsWith("La decisión D2"))).toBe(true);
    expect(pendientes.some((p) => p.startsWith("El compromiso C5"))).toBe(true);
  });

  it("si faltan secciones no arma un acta a medias: se reintenta", async () => {
    const { gen } = await actaConSeccionesHechas({ solo: [0, 1, 3] });
    const e = await fallo(actaFinalTarea(ctxFinal(gen)));
    expect(e).toBeInstanceOf(ErrorTarea);
    expect((e as ErrorTarea).reintentable).toBe(true);
    expect((e as ErrorTarea).message).toBe(`Faltan secciones del acta (3 de ${N}).`);
    expect(generacion().status).toBe("processing");
    expect(db.usageRecord.filas).toHaveLength(0);
  });

  it("una sección hecha pero ilegible no cuenta: se avisa que falta", async () => {
    const { gen } = await actaConSeccionesHechas();
    await db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaSeccion(gen, 1) }, data: { result: { omitida: "x" } } });
    const e = await fallo(actaFinalTarea(ctxFinal(gen)));
    expect((e as ErrorTarea).message).toBe(`Faltan secciones del acta (${N - 1} de ${N}).`);
  });

  it("es idempotente: repetirla (la función murió y la cola la rescató) no duplica el registro de uso ni cambia el acta", async () => {
    const { gen } = await actaConSeccionesHechas();
    await actaFinalTarea(ctxFinal(gen));
    const antes = structuredClone(generacion());
    const segunda = await actaFinalTarea(ctxFinal(gen));
    expect(resultado(segunda)).toEqual({ omitida: "el acta ya está lista" });
    expect(db.usageRecord.filas).toHaveLength(1);
    expect(generacion()).toEqual(antes);
  });

  it("dos ejecuciones a la vez dejan UN solo registro de uso", async () => {
    const { gen } = await actaConSeccionesHechas();
    await Promise.all([actaFinalTarea(ctxFinal(gen)), actaFinalTarea(ctxFinal(gen))]);
    expect(db.usageRecord.filas).toHaveLength(1);
    expect(generacion().status).toBe("completed");
  });

  it("sin la ficha (la IA no pudo armarla) igual sale un acta, con lo que hay", async () => {
    await sembrarReunion();
    await db.meeting.updateMany({ where: { id: ID }, data: { digest: null } });
    const gen = await iniciar();
    const secciones = (db.meetingTask.filas[0].payload as { secciones: SeccionDeActa[] }).secciones;
    await db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaCalentar(gen) }, data: { status: "hecha", result: { calentada: true } } });
    for (const s of secciones) {
      await db.meetingTask.create({
        data: { meetingId: ID, kind: "acta_seccion", key: claveActaSeccion(gen, s.k), status: "hecha", payload: { generationId: gen, total: secciones.length, titulo: s.titulo, seccion: s }, result: { k: s.k, markdown: `Texto de ${s.titulo}.`, uso: USO_SECCION(s.k) } },
      });
    }
    await actaFinalTarea({ ...ctxFinal(gen), tarea: { id: "x", meetingId: ID, kind: "acta_final", key: claveActaFinal(gen), payload: { generationId: gen, total: secciones.length }, attempts: 1 } });
    expect(generacion().status).toBe("completed");
    const md = await archivo(generacion().outputFiles.actaMarkdown);
    expect(md).toContain("**3.1 Parte 1");
    expect(md).not.toContain("DECISIONES ADOPTADAS");
    // Sin ficha, los asistentes son las voces con nombre confirmado.
    expect(md).toContain("- Martha López — Presidente del consejo");
  });

  it("no hace nada si el acta se detuvo, ya no existe o la reunión se borró", async () => {
    const { gen } = await actaConSeccionesHechas();
    await db.generation.updateMany({ where: { id: gen }, data: { status: "failed" } });
    expect(await fallo(actaFinalTarea(ctxFinal(gen)))).toBeInstanceOf(ErrorTarea);
    expect(resultado(await actaFinalTarea(ctxFinal("noexiste")))).toEqual({ omitida: "el acta ya no existe" });
    await db.generation.updateMany({ where: { id: gen }, data: { status: "processing" } });
    db.meeting.filas.length = 0;
    expect(resultado(await actaFinalTarea(ctxFinal(gen)))).toEqual({ omitida: "la reunión ya no existe" });
    expect(db.usageRecord.filas).toHaveLength(0);
  });

  it("si no se pudo leer la marca de quien administra, el acta sale igual", async () => {
    const { gen } = await actaConSeccionesHechas();
    db.user.filas.length = 0;
    await actaFinalTarea(ctxFinal(gen));
    expect(generacion().status).toBe("completed");
    expect(await archivo(generacion().outputFiles.actaHtml)).not.toContain("Administraciones Ana");
  });
});

/* ════════════════════════════════════════════════════════════════════
   El recorrido completo, con el trabajador de la cola
   ════════════════════════════════════════════════════════════════════ */

describe("el acta de punta a punta (trabajador + cola + IA simulada)", () => {
  let reloj = 0;
  beforeEach(() => {
    reloj = 0;
  });

  async function correr(ia: ClienteIA, extra: { requisitos?: (texto: string) => Promise<unknown[]>; pasadas?: number } = {}) {
    let resumen = { ejecutadas: 0, fallidas: 0, continuadas: 0 };
    // Las tareas se crean con la hora real: el reloj del trabajador no puede ir por detrás (ni quedarse quieto mientras se encolan otras).
    reloj = Math.max(reloj, Date.now() + 60_000);
    for (let pasada = 0; pasada < (extra.pasadas ?? 1); pasada++) {
      resumen = await trabajar({
        presupuestoMs: 600_000, margenMinimoMs: 1000, reloj: () => reloj, manejadores: MANEJADORES,
        deps: { almacen, ia, requisitosDeActa: extra.requisitos ?? (async () => []) },
      });
      reloj += 12 * 60_000;
    }
    return resumen;
  }
  const tarea = (clave: string) => db.meetingTask.filas.find((x) => x.key === clave);
  const kDe = (texto: string) => Number(/sección (\d+) de/.exec(texto)?.[1]) - 1;

  it("calienta la caché UNA vez, redacta todas las secciones leyéndola y arma el acta: el costo de la transcripción se paga una sola vez", async () => {
    await sembrarReunion();
    const ia = crearIASimulada();
    const gen = await iniciar();
    await correr(ia);

    expect(generacion()).toMatchObject({ status: "completed", progress: 100, errorMessage: null });
    expect(ia.calentamientos).toHaveLength(1);
    expect(ia.textos).toHaveLength(N);
    // Todas las llamadas comparten el prefijo y el sistema del calentamiento.
    for (const e of ia.textos) {
      expect(e.compartido).toBe(ia.calentamientos[0].compartido);
      expect(e.sistema).toBe(ia.calentamientos[0].sistema);
      expect(e.esfuerzo).toBe(ia.calentamientos[0].esfuerzo);
    }
    // Escritura de la caché: solo el calentamiento. Las secciones la leen.
    const usoDe = (clave: string) => leerUsoGuardado((tarea(clave)!.result as { uso: unknown }).uso);
    expect(usoDe(claveActaCalentar(gen)).cacheEscritura).toBeGreaterThan(2_000);
    for (const s of SECCIONES) {
      const u = usoDe(claveActaSeccion(gen, s.k));
      expect(u.cacheEscritura, `sección ${s.k}`).toBe(0);
      expect(u.cacheLectura, `sección ${s.k}`).toBe(usoDe(claveActaCalentar(gen)).cacheEscritura);
    }
    // El acta cita todas las decisiones y compromisos de la ficha: nada quedó sin recoger.
    const pendientes = JSON.parse(generacion().outputFiles.actaPendientes) as string[];
    expect(pendientes.filter((p) => /no quedó desarrollad/.test(p))).toEqual([]);
    const referencias = await archivo(generacion().outputFiles.actaReferencias);
    for (const id of ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "C5", "C6"]) expect(referencias, id).toContain(`[[${id}]]`);
    // Los tres archivos y el costo.
    expect(Object.keys(generacion().outputFiles)).toEqual(expect.arrayContaining(["actaHtml", "actaMarkdown", "actaReferencias", "actaPendientes"]));
    const costoTareas = db.meetingTask.filas.reduce((s, x) => s + leerUsoGuardado((x.result as { uso?: unknown } | null)?.uso).costoUsd, 0);
    expect(generacion().costUsd as number).toBeCloseTo(costoTareas, 10);
    expect(db.meeting.filas[0].status).toBe("lista");
    expect(correo).not.toHaveBeenCalled(); // el acta no manda el correo de «reunión lista»
  });

  it("las secciones esperan a que la caché esté calentada", async () => {
    await sembrarReunion();
    const ia = crearIASimulada({
      alLlamarTexto: () => {
        expect(ia.calentamientos).toHaveLength(1);
      },
    });
    await iniciar();
    await correr(ia);
    expect(ia.textos).toHaveLength(N);
    expect(generacion().status).toBe("completed");
  });

  it("lo que la IA se olvida de recoger queda avisado en «Pendientes de verificación»", async () => {
    await sembrarReunion();
    await iniciar();
    await correr(crearIASimulada({ olvidar: ["D2", "C5"] }));
    expect(generacion().status).toBe("completed");
    const pendientes = JSON.parse(generacion().outputFiles.actaPendientes) as string[];
    expect(pendientes.filter((p) => /no quedó desarrollad/.test(p))).toHaveLength(2);
  });

  it("sin caché (el calentamiento no se pudo): se redacta una sección PRIMERO, sola, y las demás van después leyéndola", async () => {
    await sembrarReunion();
    const eventos: string[] = [];
    const ia = crearIASimulada({
      alCalentar: () => { throw new ErrorIA("El servicio de IA rechazó la solicitud.", { reintentable: false }); },
      alLlamarTexto: async (e) => {
        const k = kDe(e.turnos[0].texto);
        eventos.push(`inicio ${k}`);
        await new Promise((r) => setTimeout(r, 5));
        eventos.push(`fin ${k}`);
      },
    });
    const gen = await iniciar();
    await correr(ia);

    expect(generacion().status).toBe("completed");
    expect(eventos.slice(0, 2)).toEqual(["inicio 0", "fin 0"]);
    expect(eventos).toHaveLength(N * 2);
    // La primera escribió la caché; las demás la leyeron.
    const uso = (k: number) => leerUsoGuardado((tarea(claveActaSeccion(gen, k))!.result as { uso: unknown }).uso);
    expect(uso(0).cacheEscritura).toBeGreaterThan(2_000);
    for (let k = 1; k < N; k++) expect(uso(k)).toMatchObject({ cacheEscritura: 0, cacheLectura: uso(0).cacheEscritura });
    expect(tarea(claveActaCalentar(gen))!.result).toMatchObject({ calentada: false });
  });

  it("un fallo sin arreglo en una sección detiene el acta con su mensaje; «Intentar de nuevo» repite SOLO lo que falló y lo que no llegó a hacerse", async () => {
    await sembrarReunion();
    let rotas = true;
    const ia = crearIASimulada({
      alLlamarTexto: (e) => {
        if (rotas && kDe(e.turnos[0].texto) === 1) throw new ErrorIA("El servicio de IA rechazó la solicitud.", { reintentable: false });
      },
    });
    const gen = await iniciar();
    const primera = await correr(ia);

    expect(primera.fallidas).toBe(1);
    expect(generacion()).toMatchObject({ status: "failed", progress: 0 });
    expect(String(generacion().errorMessage)).toMatch(/^No pudimos redactar la sección «Informe de cartera y recaudo» del acta\./);
    expect(tarea(claveActaSeccion(gen, 1))).toMatchObject({ status: "fallida" });
    expect(tarea(claveActaFinal(gen))).toBeUndefined();
    expect(db.meeting.filas[0].status).toBe("lista"); // la reunión no se toca
    const hechasAntes = SECCIONES.filter((s) => tarea(claveActaSeccion(gen, s.k))?.status === "hecha").map((s) => s.k);
    expect(hechasAntes.length).toBeGreaterThanOrEqual(1);
    const llamadasAntes = ia.textos.length;

    // Se arregla y se pide de nuevo.
    rotas = false;
    expect(await reanudarActa(ID, gen, new Date(reloj))).toBe(true);
    await correr(ia);
    expect(generacion()).toMatchObject({ status: "completed", progress: 100, errorMessage: null });

    // Cada sección se redactó con éxito UNA vez: las que ya estaban hechas no se repitieron (ya estaban pagadas).
    const porSeccion = new Map<number, number>();
    for (const e of ia.textos.slice(llamadasAntes)) porSeccion.set(kDe(e.turnos[0].texto), (porSeccion.get(kDe(e.turnos[0].texto)) ?? 0) + 1);
    for (const k of hechasAntes) expect(porSeccion.has(k), `la sección ${k} ya estaba hecha`).toBe(false);
    expect([...porSeccion.values()].every((n) => n === 1)).toBe(true);
    expect(porSeccion.has(1)).toBe(true);
    expect(ia.calentamientos).toHaveLength(1); // la caché ya estaba calentada: no se calienta otra vez
    expect(db.usageRecord.filas).toHaveLength(1);
  });

  it("un fallo del momento se reintenta solo, con el mismo esfuerzo y el mismo prefijo (si no, se pagaría la transcripción otra vez)", async () => {
    await sembrarReunion();
    let fallos = 0;
    const ia = crearIASimulada({
      alLlamarTexto: (e) => {
        if (kDe(e.turnos[0].texto) === 2 && fallos++ === 0) throw Object.assign(new Error("overloaded"), { status: 529 });
      },
    });
    const gen = await iniciar();
    await correr(ia);
    // Primera pasada: la sección 3 quedó esperando su reintento (30 s), el acta sigue en curso.
    expect(generacion().status).toBe("processing");
    expect(tarea(claveActaSeccion(gen, 2))).toMatchObject({ status: "pendiente", attempts: 1, error: "El servicio de IA está saturado. Se vuelve a intentar." });
    expect(tarea(claveActaFinal(gen))).toBeUndefined();

    await correr(ia);
    expect(generacion().status).toBe("completed");
    const intentos = ia.textos.filter((e) => kDe(e.turnos[0].texto) === 2);
    expect(intentos).toHaveLength(2);
    expect(intentos[1].esfuerzo).toBe(intentos[0].esfuerzo);
    expect(intentos[1].compartido).toBe(intentos[0].compartido);
    expect(intentos[1].sistema).toBe(intentos[0].sistema);
  });

  it("si el trabajador murió entre terminar la última sección y encolar el paso final, el cron lo encola y el acta se completa", async () => {
    await sembrarReunion();
    const ia = crearIASimulada();
    const gen = await iniciar();
    await correr(ia);
    // Se deshace lo último: sin la tarea final y con el acta todavía en curso.
    db.meetingTask.filas = db.meetingTask.filas.filter((x) => x.key !== claveActaFinal(gen));
    await db.generation.updateMany({ where: { id: gen }, data: { status: "processing", progress: 90, outputFiles: null, completedAt: null } });
    db.usageRecord.filas.length = 0;

    const { avanzarActasEnCurso } = await import("./acta-orquestador");
    expect(await avanzarActasEnCurso()).toBe(1);
    expect(tarea(claveActaFinal(gen))).toMatchObject({ status: "pendiente" });
    await correr(ia);
    expect(generacion().status).toBe("completed");
    expect(ia.textos).toHaveLength(N); // no se redactó nada de nuevo
  });

  it("el avance llega al 100 % y nunca baja mientras se redacta", async () => {
    await sembrarReunion();
    const gen = await iniciar();
    const vistos: number[] = [];
    const ia = crearIASimulada({ alLlamarTexto: () => { vistos.push(generacion().progress as number); } });
    await correr(ia);
    expect(vistos.length).toBe(N);
    expect(vistos.every((p, i) => i === 0 || p >= vistos[i - 1])).toBe(true);
    expect(generacion().progress).toBe(100);
    expect(await avanzarActa(ID, gen)).toBeNull(); // ya terminó
  });
});
