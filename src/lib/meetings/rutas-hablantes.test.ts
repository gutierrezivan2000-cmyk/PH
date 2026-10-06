/** El PUT de los nombres de las voces con la base de datos (falsa): pertenencia, personas, fusión atómica y respuesta. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake } = vi.hoisted(() => ({ auth: vi.fn(), fake: { db: null as unknown } }));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));

import { PUT as guardar } from "@/app/api/meetings/[id]/speakers/route";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";

let db: DbFalsa;
const ID = "mreunion1";
const MIN = 60_000;
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const json = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });
const put = (cuerpo: unknown, id = ID) => guardar(new NextRequest(`http://localhost/api/meetings/${id}/speakers`, { method: "PUT", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } }), ctx(id));

async function sembrar(extra: Record<string, unknown> = {}) {
  await db.meeting.create({ data: { id: ID, userId: "u1", propertyId: "p1", status: "lista", ...extra } });
  for (const [label, talk] of [["V1", 40], ["V2", 30], ["V3", 20], ["H5", 5]] as const) {
    await db.meetingSpeaker.create({ data: { meetingId: ID, label, talkMs: talk * MIN, suggestion: label === "H5" ? { nombre: "Andrés", evidencia: "e" } : null } });
  }
  ["V1", "V2", "V3", "V3", "H5"].forEach((speaker, idx) => db.meetingUtterance.filas.push({ id: `u${idx}`, meetingId: ID, idx, startMs: idx * 10_000, endMs: idx * 10_000 + 4_000, speaker, text: `línea ${idx}` }));
  await db.propertyPerson.create({ data: { id: "per1", propertyId: "p1", name: "Martha López", role: "presidente", active: true } });
  await db.propertyPerson.create({ data: { id: "per2", propertyId: "otra", name: "De otra copropiedad", active: true } });
}
const hablante = (label: string) => db.meetingSpeaker.filas.find((h) => h.label === label);

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  auth.mockReset();
  vi.stubEnv("DEMO_MODE", "false");
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com", role: "admin" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("PUT speakers", () => {
  it("guarda el nombre, el rol y la persona; la voz con nombre queda confirmada y la sugerencia de la IA se conserva", async () => {
    await sembrar();
    const { status, cuerpo } = await json(await put({ hablantes: [{ label: "V1", name: "Martha López", role: "presidente", personId: "per1" }, { label: "H5", name: "Andrés Gómez" }] }));
    expect(status).toBe(200);
    expect(hablante("V1")).toMatchObject({ name: "Martha López", role: "presidente", personId: "per1", confirmed: true });
    expect(hablante("H5")).toMatchObject({ name: "Andrés Gómez", confirmed: true, suggestion: { nombre: "Andrés", evidencia: "e" } });
    expect(hablante("V2")).toMatchObject({ name: null, confirmed: false }); // no se tocó
    // La respuesta trae todas las voces, la que más habla primero, ya como las ve la pantalla (sin URLs ni filas crudas).
    expect(cuerpo.speakers.map((h: { label: string }) => h.label)).toEqual(["V1", "V2", "V3", "H5"]);
    expect(cuerpo.speakers[0]).toEqual({ label: "V1", name: "Martha López", role: "presidente", personId: "per1", confirmed: true, suggestion: null, talkMs: 40 * MIN, sampleStartMs: null, sampleEndMs: null });
  });

  it("fusiona las voces con el mismo nombre en la que más habla: sus intervenciones pasan a ella y su fila desaparece", async () => {
    await sembrar();
    const { status, cuerpo } = await json(await put({ hablantes: [{ label: "V2", name: "Jorge Pardo" }, { label: "V3", name: "jorge pardo" }, { label: "H5", name: "Jorge  Pardo" }] }));
    expect(status).toBe(200);
    expect(db.meetingSpeaker.filas.map((h) => h.label).sort()).toEqual(["V1", "V2"]);
    expect(hablante("V2")).toMatchObject({ name: "Jorge Pardo", confirmed: true, talkMs: 55 * MIN });
    expect(db.meetingUtterance.filas.map((u) => u.speaker)).toEqual(["V1", "V2", "V2", "V2", "V2"]);
    expect(cuerpo.speakers.map((h: { label: string }) => h.label)).toEqual(["V2", "V1"]); // V2 habla más ahora (55 min contra 40)
  });

  it("es idempotente: repetir el mismo pedido (la respuesta se perdió) no rompe nada", async () => {
    await sembrar();
    const pedido = { hablantes: [{ label: "V2", name: "Jorge" }, { label: "V3", name: "Jorge" }] };
    await put(pedido);
    const estado = () => JSON.stringify(db.meetingSpeaker.filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== "updatedAt")))); // salvo la hora de la última escritura
    const antes = estado();
    const { status } = await json(await put(pedido));
    expect(status).toBe(200);
    expect(estado()).toBe(antes);
  });

  it("una persona de otra copropiedad (o que no existe) se rechaza y no se toca nada", async () => {
    await sembrar();
    for (const personId of ["per2", "no-existe"]) {
      const { status, cuerpo } = await json(await put({ hablantes: [{ label: "V1", name: "Ana", personId }] }));
      expect(status).toBe(400);
      expect(cuerpo.error).toBe("Una de las personas no es de esta copropiedad.");
    }
    expect(hablante("V1")).toMatchObject({ name: null, confirmed: false });
  });

  it("solo toca las voces de SU reunión", async () => {
    await sembrar();
    await db.meeting.create({ data: { id: "otra", userId: "u1", propertyId: "p1", status: "lista" } });
    await db.meetingSpeaker.create({ data: { meetingId: "otra", label: "V1", talkMs: 5 } });
    await put({ hablantes: [{ label: "V1", name: "Ana" }] });
    expect(db.meetingSpeaker.filas.find((h) => h.meetingId === "otra" && h.label === "V1")).toMatchObject({ name: null });
  });

  it("una reunión de otro usuario o que no existe: 404; un pedido inválido: 400", async () => {
    await sembrar({ userId: "otro" });
    expect((await put({ hablantes: [{ label: "V1", name: "Ana" }] })).status).toBe(404);
    expect((await put({ hablantes: [{ label: "V1", name: "Ana" }] }, "no-existe")).status).toBe(404);
    db = crearDbFalsa();
    fake.db = db;
    await sembrar();
    expect((await put({})).status).toBe(400);
    expect((await put({ hablantes: [{ label: "uno", name: "Ana" }] })).status).toBe(400);
  });

  it("si la base de datos falla, 500 con un mensaje sin detalles", async () => {
    await sembrar();
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "$transaction").mockRejectedValue(new Error("deadlock detected"));
    const { status, cuerpo } = await json(await put({ hablantes: [{ label: "V1", name: "Ana" }] }));
    expect(status).toBe(500);
    expect(cuerpo).toEqual({ error: "No pudimos guardar los nombres." });
    consola.mockRestore();
  });
});
