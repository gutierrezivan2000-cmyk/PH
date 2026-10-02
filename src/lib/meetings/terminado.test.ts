import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { fake, correo } = vi.hoisted(() => ({ fake: { db: null as unknown }, correo: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/email", () => ({ sendMeetingReadyEmail: (...a: unknown[]) => correo(...a) }));

import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { avanzar } from "./orquestador";
import { alPasarALista, sumarCostos } from "./terminado";

const uso = (costoUsd: number, entrada = 1_000, salida = 200) => ({ uso: { entrada, salida, cacheLectura: 0, cacheEscritura: 0, costoUsd } });

describe("sumarCostos", () => {
  it("los tramos aportan su costo de transcripción; los bloques y la ficha, su uso de IA con los tokens", () => {
    const c = sumarCostos([
      { kind: "transcribir_tramo", result: { costoUsd: 0.063 } },
      { kind: "transcribir_tramo", result: { costoUsd: 0.06 } },
      { kind: "analizar_bloque", result: uso(0.5, 30_000, 4_000) },
      { kind: "analizar_bloque", result: uso(0.4, 20_000, 3_000) },
      { kind: "ficha", result: uso(0.3, 10_000, 2_000) },
    ]);
    expect(c.transcripcionUsd).toBeCloseTo(0.123, 9);
    expect(c.iaUsd).toBeCloseTo(1.2, 9);
    expect(c.iaTokens).toBe(34_000 + 23_000 + 12_000);
  });

  it("no cuenta dos veces: un tramo no aporta IA y un bloque no aporta transcripción", () => {
    const c = sumarCostos([{ kind: "transcribir_tramo", result: { costoUsd: 1, ...uso(9) } }, { kind: "analizar_bloque", result: { costoUsd: 7, ...uso(2) } }]);
    expect(c).toMatchObject({ transcripcionUsd: 1, iaUsd: 2 });
  });

  it("ignora lo que no es legible, los otros tipos de tarea y los valores raros", () => {
    const c = sumarCostos([
      { kind: "transcribir_tramo", result: null },
      { kind: "transcribir_tramo", result: { costoUsd: -5 } },
      { kind: "transcribir_tramo", result: { costoUsd: "mucho" } },
      { kind: "analizar_bloque", result: { omitido: "sin saldo", ...uso(0, 0, 0) } },
      { kind: "analizar_bloque", result: { uso: "no" } },
      { kind: "unir", result: { costoUsd: 99, ...uso(5) } },
      { kind: "voces", result: uso(7) },
      { kind: "ficha", result: [] },
    ]);
    expect(c).toEqual({ transcripcionUsd: 0, iaUsd: 0, iaTokens: 0 });
  });
});

describe("al pasar a «lista»", () => {
  let db: DbFalsa;
  const ID = "m1";
  beforeEach(() => {
    db = crearDbFalsa();
    fake.db = db;
    correo.mockReset();
    correo.mockResolvedValue({ sent: true });
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://soph.test");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function reunionTerminada(extra: Record<string, unknown> = {}) {
    await db.meeting.create({ data: { id: ID, userId: "u1", title: "Consejo de octubre", status: "procesando", stage: "analizando", durationMs: 8_040_000, property: { name: "Los Pinos" }, ...extra } });
    await db.user.create({ data: { id: "u1", email: "ana@ejemplo.com" } });
    await db.meetingSource.create({ data: { id: "s1", meetingId: ID, idx: 0, kind: "archivo", name: "a", url: "https://x", status: "normalizada", normalizedMs: 1, durationMs: 1 } });
    for (const [kind, key, result] of [
      ["armar_audio", "armar_audio", null], ["transcribir_tramo", "tramo:0", { costoUsd: 0.063 }], ["voces", "voces", null], ["unir", "unir", { costoUsd: 0.063 }],
      ["analizar_bloque", "bloque:0", uso(0.5, 30_000, 4_000)], ["ficha", "ficha", uso(0.25, 10_000, 2_000)],
    ] as const) await db.meetingTask.create({ data: { meetingId: ID, kind, key, status: "hecha", result } });
  }

  it("suma el costo en la reunión, deja el registro de uso de la transcripción y el de la IA, y avisa por correo", async () => {
    await reunionTerminada();
    await alPasarALista(ID);
    expect(db.meeting.filas[0].costUsd).toBeCloseTo(0.063 + 0.75, 9);
    expect(db.usageRecord.filas.map((x) => ({ type: x.type, userId: x.userId, tokens: x.tokens, costUsd: x.costUsd }))).toEqual([
      { type: "reunion_audio", userId: "u1", tokens: 8_040, costUsd: 0.063 },
      { type: "reunion_ia", userId: "u1", tokens: 46_000, costUsd: 0.75 },
    ]);
    expect(correo).toHaveBeenCalledWith({ to: "ana@ejemplo.com", title: "Consejo de octubre", propertyName: "Los Pinos", duration: "2 h 14 min", url: "https://soph.test/dashboard/reuniones/m1" });
  });

  it("sin análisis con IA no hay registro de IA, y sin un solo segundo de audio tampoco el de audio", async () => {
    await reunionTerminada({ durationMs: null });
    db.meetingTask.filas = db.meetingTask.filas.filter((x) => x.kind !== "analizar_bloque" && x.kind !== "ficha");
    await alPasarALista(ID);
    expect(db.usageRecord.filas).toEqual([]);
    expect(db.meeting.filas[0].costUsd).toBeCloseTo(0.063, 9);
    expect(correo.mock.calls[0][0]).toMatchObject({ duration: "" });
  });

  it("sin correo del usuario, no se envía nada", async () => {
    await reunionTerminada();
    db.user.filas.length = 0;
    await alPasarALista(ID);
    expect(correo).not.toHaveBeenCalled();
    expect(db.usageRecord.filas).toHaveLength(2);
  });

  it("si un paso falla, los demás se hacen igual y nada se lanza", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    await reunionTerminada();
    db.usageRecord.create = (async () => {
      throw new Error("base de datos caída");
    }) as never;
    await expect(alPasarALista(ID)).resolves.toBeUndefined();
    expect(correo).toHaveBeenCalledTimes(1); // el correo salió aunque el registro falló
    correo.mockRejectedValue(new Error("Resend caído"));
    await expect(alPasarALista(ID)).resolves.toBeUndefined();
    consola.mockRestore();
  });

  it("una reunión que ya no existe no hace nada", async () => {
    await expect(alPasarALista("no-existe")).resolves.toBeUndefined();
    expect(correo).not.toHaveBeenCalled();
  });

  it("lo hace UNA vez aunque varias tareas llamen a avanzar a la vez al terminar", async () => {
    await reunionTerminada({ stage: "analizando" });
    await Promise.all([avanzar(ID), avanzar(ID), avanzar(ID), avanzar(ID)]);
    expect(db.meeting.filas[0]).toMatchObject({ status: "lista", progress: 100 });
    expect(correo).toHaveBeenCalledTimes(1);
    expect(db.usageRecord.filas).toHaveLength(2);
    await avanzar(ID); // y ya lista, no se vuelve a tocar
    expect(correo).toHaveBeenCalledTimes(1);
  });
});
