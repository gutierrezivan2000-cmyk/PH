/** El vigilante de generaciones colgadas: las actas de reuniones se miden por actividad, no por haberse creado hace 15 min. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { crearDbFalsa, type DbFalsa } from "@/lib/meetings/db-falsa";
import { STUCK_REUNION_MS, failStuckGenerations } from "./usage";

const MIN = 60_000;
const HORA = 60 * MIN;
let db: DbFalsa;

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
});

/** Una fila con fechas explícitas (la tabla falsa pone «ahora» al crear y al actualizar). */
function fila(id: string, datos: Record<string, unknown>, creadaHace: number, actividadHace: number) {
  db.generation.filas.push({
    id, userId: "u1", propertyId: "p1", type: "informe", status: "processing", progress: 10, batchId: null, meetingId: null, errorMessage: null,
    createdAt: new Date(Date.now() - creadaHace), updatedAt: new Date(Date.now() - actividadHace), ...datos,
  });
}
const estado = (id: string) => db.generation.filas.find((g) => g.id === id)!.status;

describe("failStuckGenerations", () => {
  it("una generación suelta que lleva más de 15 min creada y sin terminar se da por muerta (corría dentro de una función de 300 s)", async () => {
    fila("vieja", {}, 20 * MIN, 20 * MIN);
    fila("reciente", {}, 5 * MIN, 5 * MIN);
    fila("pendiente-vieja", { status: "pending" }, 30 * MIN, 30 * MIN);
    fila("lista", { status: "completed" }, 40 * MIN, 40 * MIN);
    await failStuckGenerations("u1");
    expect(["vieja", "reciente", "pendiente-vieja", "lista"].map(estado)).toEqual(["failed", "processing", "failed", "completed"]);
    expect(db.generation.filas[0].errorMessage).toBe("La generación excedió el tiempo máximo y se canceló.");
  });

  it("las de un lote: solo se da por muerta la que el cron reclamó y no terminó; las que esperan su turno, no", async () => {
    fila("lote-procesando", { batchId: "b1" }, 20 * MIN, 20 * MIN);
    fila("lote-esperando", { batchId: "b1", status: "pending" }, 20 * MIN, 20 * MIN);
    fila("lote-reciente", { batchId: "b1" }, 5 * MIN, 5 * MIN);
    await failStuckGenerations("u1");
    expect(["lote-procesando", "lote-esperando", "lote-reciente"].map(estado)).toEqual(["failed", "pending", "processing"]);
  });

  it("un acta de una reunión que lleva más de 15 min NO se da por muerta mientras siga teniendo actividad (varias tareas, con reintentos de hasta 10 min)", async () => {
    fila("acta-viva", { type: "acta", meetingId: "r1" }, 2 * HORA, 3 * MIN);
    fila("acta-esperando-reintento", { type: "acta", meetingId: "r1" }, 40 * MIN, 12 * MIN);
    await failStuckGenerations("u1");
    expect(estado("acta-viva")).toBe("processing");
    expect(estado("acta-esperando-reintento")).toBe("processing");
  });

  it("un acta sin actividad en 3 h sí se da por muerta, con su mensaje, y «Intentar de nuevo» puede retomarla", async () => {
    fila("acta-muerta", { type: "acta", meetingId: "r1" }, 5 * HORA, STUCK_REUNION_MS + MIN);
    fila("acta-pendiente-muerta", { type: "acta", meetingId: "r1", status: "pending" }, 5 * HORA, STUCK_REUNION_MS + MIN);
    fila("acta-casi", { type: "acta", meetingId: "r1" }, 5 * HORA, STUCK_REUNION_MS - 5 * MIN);
    await failStuckGenerations("u1");
    expect(["acta-muerta", "acta-pendiente-muerta", "acta-casi"].map(estado)).toEqual(["failed", "failed", "processing"]);
    expect(db.generation.filas[0].errorMessage).toBe("La generación excedió el tiempo máximo y se canceló.");
  });

  it("un acta terminada o con error, por vieja que sea, no se toca", async () => {
    fila("acta-lista", { type: "acta", meetingId: "r1", status: "completed", errorMessage: null }, 9 * HORA, 9 * HORA);
    fila("acta-error", { type: "acta", meetingId: "r1", status: "failed", errorMessage: "No pudimos redactar la sección." }, 9 * HORA, 9 * HORA);
    await failStuckGenerations("u1");
    expect(estado("acta-lista")).toBe("completed");
    expect(db.generation.filas[1].errorMessage).toBe("No pudimos redactar la sección.");
  });

  it("solo toca las de esa persona", async () => {
    fila("mia", {}, 20 * MIN, 20 * MIN);
    fila("ajena", { userId: "u2" }, 20 * MIN, 20 * MIN);
    fila("acta-ajena", { userId: "u2", type: "acta", meetingId: "r2" }, 5 * HORA, 4 * HORA);
    await failStuckGenerations("u1");
    expect(["mia", "ajena", "acta-ajena"].map(estado)).toEqual(["failed", "processing", "processing"]);
  });
});
