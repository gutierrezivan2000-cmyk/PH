/** Las rutas de la transcripción con la base de datos (falsa): pertenencia, páginas, búsqueda y el .txt. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake } = vi.hoisted(() => ({ auth: vi.fn(), fake: { db: null as unknown } }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));

import { GET as descargar } from "@/app/api/meetings/[id]/transcript/route";
import { GET as paginas } from "@/app/api/meetings/[id]/utterances/route";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

let db: DbFalsa;
const ID = "mreunion1";
const MIN = 60_000;
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const json = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });
const pedir = (qs = "") => new NextRequest(`http://localhost/api/meetings/${ID}/utterances${qs}`);

const reunion = (extra: Record<string, unknown> = {}) =>
  db.meeting.create({
    data: {
      id: ID, userId: "u1", title: "Reunión de consejo — septiembre", type: "consejo", date: new Date("2026-09-12T00:00:00Z"), status: "lista",
      durationMs: 8_040_000, coverage: 1, silences: [{ desdeMs: 1_820_000, hastaMs: 2_460_000 }], property: { name: "Conjunto Los Pinos" }, ...extra,
    },
  });
const intervencion = (idx: number, startMs: number, speaker: string, text: string, meetingId = ID) =>
  db.meetingUtterance.create({ data: { meetingId, idx, startMs, endMs: startMs + 4_000, speaker, text } });
const hablante = (label: string, name: string | null) => db.meetingSpeaker.create({ data: { meetingId: ID, label, name } });

async function sembrar() {
  await reunion();
  await intervencion(0, 5_000, "V1", "Buenas noches a todos.");
  await intervencion(1, 34_000, "V2", "Verifico la asistencia: hay quórum.");
  await intervencion(2, 10 * MIN, "V1", "Hablemos de la cotización del ascensor.");
  await intervencion(3, 29 * MIN + 59_000, "V3", "Última de la primera media hora.");
  await intervencion(4, 30 * MIN, "V2", "Primera de la segunda media hora.");
  await intervencion(5, 100 * MIN, "H5", "Ya casi terminamos con el ASCENSOR.");
  await hablante("V1", "Martha López");
  await hablante("V2", "  ");
  await hablante("V3", null);
  await hablante("H5", "Andrés Gómez");
}

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  vi.stubEnv("DEMO_MODE", "false");
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com", role: "admin" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET utterances", () => {
  it("la primera página son las intervenciones de los primeros 30 min, con los nombres que ya existen", async () => {
    await sembrar();
    const { status, cuerpo } = await json(await paginas(pedir(), ctx()));
    expect(status).toBe(200);
    expect(cuerpo.items.map((x: { startMs: number }) => x.startMs)).toEqual([5_000, 34_000, 10 * MIN, 29 * MIN + 59_000]);
    expect(cuerpo.items[0]).toEqual({ id: expect.any(String), startMs: 5_000, endMs: 9_000, speaker: "V1", text: "Buenas noches a todos." });
    expect(cuerpo.nombres).toEqual({ V1: "Martha López", H5: "Andrés Gómez" }); // sin nombre o con el nombre en blanco: no salen
    expect(cuerpo.siguienteMs).toBe(30 * MIN);
  });

  it("no filtra nada que no hace falta: ni la reunión ni las URLs privadas", async () => {
    await sembrar();
    const { cuerpo } = await json(await paginas(pedir(), ctx()));
    expect(Object.keys(cuerpo.items[0]).sort()).toEqual(["endMs", "id", "speaker", "startMs", "text"]);
  });

  it("la siguiente página salta los bloques vacíos y la última no tiene siguiente", async () => {
    await sembrar();
    const p2 = await json(await paginas(pedir(`?desde=${30 * MIN}`), ctx()));
    expect(p2.cuerpo.items.map((x: { startMs: number }) => x.startMs)).toEqual([30 * MIN]);
    expect(p2.cuerpo.siguienteMs).toBe(90 * MIN);
    const p3 = await json(await paginas(pedir(`?desde=${90 * MIN}`), ctx()));
    expect(p3.cuerpo.items.map((x: { startMs: number }) => x.startMs)).toEqual([100 * MIN]);
    expect(p3.cuerpo.siguienteMs).toBeNull();
  });

  it("ordena por minuto y, a igual minuto, por posición", async () => {
    await reunion();
    await intervencion(1, 5_000, "V2", "segunda");
    await intervencion(0, 5_000, "V1", "primera");
    const { cuerpo } = await json(await paginas(pedir(), ctx()));
    expect(cuerpo.items.map((x: { text: string }) => x.text)).toEqual(["primera", "segunda"]);
  });

  it("busca sin distinguir tildes ni mayúsculas, en toda la reunión", async () => {
    await sembrar();
    const { cuerpo } = await json(await paginas(pedir("?q=Ascensor"), ctx()));
    expect(cuerpo.items.map((x: { startMs: number }) => x.startMs)).toEqual([10 * MIN, 100 * MIN]);
    expect(cuerpo.siguienteMs).toBeNull();
    expect((await json(await paginas(pedir("?q=cotizacion"), ctx()))).cuerpo.items).toHaveLength(1);
    expect((await json(await paginas(pedir("?q=cotización+ascensor"), ctx()))).cuerpo.items).toHaveLength(1);
    expect((await json(await paginas(pedir("?q=nada+de+esto"), ctx()))).cuerpo.items).toEqual([]);
  });

  it("la búsqueda recorre una reunión larga por lotes y respeta el tope de 200 coincidencias", async () => {
    await reunion();
    // 4.500 intervenciones (más de dos lotes de lectura); las que dicen «contrato» son una de cada 15: 300.
    for (let k = 0; k < 4_500; k++) db.meetingUtterance.filas.push({ id: `u${k}`, meetingId: ID, idx: k, startMs: k * 5_000, endMs: k * 5_000 + 4_000, speaker: "V1", text: k % 15 === 0 ? `Sobre el contrato número ${k}` : `Intervención ${k}` });
    const p1 = await json(await paginas(pedir("?q=contrato"), ctx()));
    expect(p1.cuerpo.items).toHaveLength(200);
    expect(p1.cuerpo.items[0].startMs).toBe(0);
    expect(p1.cuerpo.siguienteMs).toBe(200 * 15 * 5_000);
    const p2 = await json(await paginas(pedir(`?q=contrato&desde=${p1.cuerpo.siguienteMs}`), ctx()));
    expect(p2.cuerpo.items).toHaveLength(100);
    expect(p2.cuerpo.siguienteMs).toBeNull();
    // Y una página sin búsqueda de esa misma reunión larga no lee más que su media hora.
    const p = await json(await paginas(pedir("?desde=3600000"), ctx()));
    expect(p.cuerpo.items).toHaveLength(360);
  });

  it("solo ve las intervenciones de SU reunión", async () => {
    await sembrar();
    await db.meeting.create({ data: { id: "otra", userId: "u1", status: "lista" } });
    await intervencion(0, 1_000, "V1", "de otra reunión", "otra");
    const { cuerpo } = await json(await paginas(pedir(), ctx()));
    expect(JSON.stringify(cuerpo)).not.toContain("de otra reunión");
  });

  it("una reunión de otro usuario o que no existe: 404; parámetros inválidos: 400", async () => {
    await reunion({ userId: "otro" });
    expect((await paginas(pedir(), ctx())).status).toBe(404);
    expect((await paginas(pedir(), ctx("no-existe"))).status).toBe(404);
    db.meeting.filas.length = 0;
    await reunion();
    expect((await paginas(pedir("?desde=-1"), ctx())).status).toBe(400);
  });

  it("un fallo de la base de datos responde 500 con un mensaje, sin detalles", async () => {
    await sembrar();
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.meetingUtterance, "findMany").mockRejectedValue(new Error("connection terminated"));
    const { status, cuerpo } = await json(await paginas(pedir(), ctx()));
    expect(status).toBe(500);
    expect(cuerpo).toEqual({ error: "No pudimos cargar la transcripción." });
    consola.mockRestore();
  });
});

describe("GET transcript", () => {
  const pedirTexto = (id = ID) => descargar(new NextRequest(`http://localhost/api/meetings/${id}/transcript`), ctx(id));

  it("arma el .txt con el encabezado, los nombres actuales y los silencios", async () => {
    await sembrar();
    const r = await pedirTexto();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="transcripcion-reunion-de-consejo-septiembre.txt"');
    const lineas = (await r.text()).split("\n");
    expect(lineas.slice(0, 4)).toEqual([
      "Reunión de consejo — septiembre",
      "Conjunto Los Pinos · Consejo · 11 de septiembre de 2026 · 2 h 14 min",
      "Transcripción completa · cobertura 100 %",
      "",
    ]);
    expect(lineas.slice(4)).toEqual([
      "[00:00:05] V1 (Martha López): Buenas noches a todos.",
      "[00:00:34] V2: Verifico la asistencia: hay quórum.",
      "[00:10:00] V1 (Martha López): Hablemos de la cotización del ascensor.",
      "[00:29:59] V3: Última de la primera media hora.",
      "[00:30:00] V2: Primera de la segunda media hora.",
      "[00:30:20] (Sin voz hasta 00:41:00)",
      "[01:40:00] H5 (Andrés Gómez): Ya casi terminamos con el ASCENSOR.",
      "",
    ]);
  });

  it("una reunión que todavía no está lista: 409; de otro usuario o inexistente: 404", async () => {
    await reunion({ status: "procesando" });
    expect((await pedirTexto()).status).toBe(409);
    db.meeting.filas.length = 0;
    await reunion({ userId: "otro" });
    expect((await pedirTexto()).status).toBe(404);
    expect((await pedirTexto("no-existe")).status).toBe(404);
  });

  it("lee toda la reunión por lotes aunque tenga miles de intervenciones", async () => {
    await reunion({ silences: [] });
    for (let k = 0; k < 4_500; k++) db.meetingUtterance.filas.push({ id: `u${k}`, meetingId: ID, idx: k, startMs: k * 1_000, endMs: k * 1_000 + 800, speaker: "V1", text: `línea ${k}` });
    const lineas = (await (await pedirTexto()).text()).split("\n").filter((l) => l.startsWith("["));
    expect(lineas).toHaveLength(4_500);
    expect(lineas[4_499]).toBe("[01:14:59] V1: línea 4499");
  });

  it("una reunión sin voz (solo silencio) da el encabezado y el silencio", async () => {
    await reunion({ durationMs: 600_000, silences: [{ desdeMs: 0, hastaMs: 600_000 }] });
    const texto = await (await pedirTexto()).text();
    expect(texto.endsWith("[00:00:00] (Sin voz hasta 00:10:00)\n")).toBe(true);
  });
});
