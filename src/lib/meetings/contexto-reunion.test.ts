/** Lo que la IA necesita saber de una reunión: quién es cada voz, quiénes asistieron y la transcripción completa, siempre en el mismo orden. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { asistentesDeReunion, cargarContextoDeReunion, transcripcionParaIA, vocesDeReunion } from "./contexto-reunion";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { FICHA_SEPTIEMBRE } from "./demo-datos";

let db: DbFalsa;
beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
});

const hablante = (label: string, talkMs: number, name: string | null = null, role: string | null = null) => ({ label, name, role, talkMs });

describe("vocesDeReunion", () => {
  it("de la que más habló a la que menos; a igual tiempo, por etiqueta contando los números (V2 antes que V10)", () => {
    const voces = vocesDeReunion([hablante("V10", 100), hablante("V2", 100), hablante("V1", 50), hablante("H5", 900), hablante("V3", 100)]);
    expect(voces.map((v) => v.etiqueta)).toEqual(["H5", "V2", "V3", "V10", "V1"]);
  });

  it("el nombre se recorta y uno vacío es «sin nombre»; el rol conocido sale con su nombre y el libre, tal cual", () => {
    const voces = vocesDeReunion([hablante("V1", 3, "  Martha López ", "presidente"), hablante("V2", 2, "   ", null), hablante("V3", 1, "Ana", "Vecina del 301")]);
    expect(voces).toEqual([
      { etiqueta: "V1", nombre: "Martha López", rol: "Presidente del consejo" },
      { etiqueta: "V2", nombre: null, rol: null },
      { etiqueta: "V3", nombre: "Ana", rol: "Vecina del 301" },
    ]);
  });

  it("no cambia lo que recibe", () => {
    const entrada = [hablante("V2", 1), hablante("V1", 9)];
    vocesDeReunion(entrada);
    expect(entrada.map((h) => h.label)).toEqual(["V2", "V1"]);
  });
});

describe("asistentesDeReunion", () => {
  it("son los de la ficha; sin ellos, las voces con nombre", () => {
    const voces = vocesDeReunion([hablante("V1", 9, "Martha", "presidente"), hablante("V2", 5, null), hablante("V3", 1, "Luis")]);
    expect(asistentesDeReunion(FICHA_SEPTIEMBRE, voces)).toEqual(FICHA_SEPTIEMBRE.asistentes.map((a) => ({ nombre: a.nombre, rol: a.rol })));
    expect(asistentesDeReunion({ ...FICHA_SEPTIEMBRE, asistentes: [] }, voces)).toEqual([
      { nombre: "Martha", rol: "Presidente del consejo" },
      { nombre: "Luis", rol: null },
    ]);
    expect(asistentesDeReunion(null, voces)).toHaveLength(2);
    expect(asistentesDeReunion(null, [])).toEqual([]);
  });
});

describe("cargarContextoDeReunion", () => {
  async function sembrar(n = 5) {
    await db.meeting.create({
      data: { id: "r1", userId: "u1", propertyId: "p1", type: "consejo", title: "Consejo", date: new Date("2026-09-16T00:00:00Z"), status: "lista", durationMs: 8_040_000, digest: structuredClone(FICHA_SEPTIEMBRE), property: { name: "Los Pinos" } },
    });
    await db.meetingSpeaker.create({ data: { meetingId: "r1", label: "V1", name: "Martha López", role: "presidente", talkMs: 500 } });
    await db.meetingSpeaker.create({ data: { meetingId: "r1", label: "V2", talkMs: 900 } });
    // Se insertan desordenadas: la lectura las devuelve por posición.
    for (let i = n - 1; i >= 0; i--) db.meetingUtterance.filas.push({ id: `u${i}`, meetingId: "r1", idx: i, startMs: i * 1000, endMs: i * 1000 + 800, speaker: i % 2 ? "V2" : "V1", text: `Frase ${i}` });
  }

  it("trae la reunión, las voces, la ficha, los asistentes y la transcripción en orden", async () => {
    await sembrar();
    const c = (await cargarContextoDeReunion("r1"))!;
    expect(c).toMatchObject({ meetingId: "r1", userId: "u1", propertyId: "p1", propiedad: "Los Pinos", titulo: "Consejo", tipo: "consejo", status: "lista", duracionMs: 8_040_000 });
    expect(c.voces.map((v) => v.etiqueta)).toEqual(["V2", "V1"]);
    expect(c.ficha?.decisiones).toHaveLength(3);
    expect(c.asistentes.map((a) => a.nombre)).toContain("Martha López");
    expect(c.lineas.map((l) => l.text)).toEqual(["Frase 0", "Frase 1", "Frase 2", "Frase 3", "Frase 4"]);
    expect(c.fecha).toEqual(new Date("2026-09-16T00:00:00Z"));
  });

  it("lee TODAS las intervenciones aunque pasen de un lote (una reunión de 8 h tiene miles), sin repetir ni saltar ninguna", async () => {
    await sembrar(4_500);
    const c = (await cargarContextoDeReunion("r1"))!;
    expect(c.lineas).toHaveLength(4_500);
    expect(c.lineas[0].text).toBe("Frase 0");
    expect(c.lineas[1_999].text).toBe("Frase 1999");
    expect(c.lineas[2_000].text).toBe("Frase 2000");
    expect(c.lineas[4_499].text).toBe("Frase 4499");
    expect(c.lineas.every((l, i) => l.startMs === i * 1000)).toBe(true);
  });

  it("un lote justo del tamaño del tope no se queda corto ni pide de más", async () => {
    await sembrar(4_000);
    expect((await cargarContextoDeReunion("r1"))!.lineas).toHaveLength(4_000);
  });

  it("solo de quien es la reunión, cuando se pide; y sin reunión, nada", async () => {
    await sembrar();
    expect(await cargarContextoDeReunion("r1", { userId: "u1" })).not.toBeNull();
    expect(await cargarContextoDeReunion("r1", { userId: "otra" })).toBeNull();
    expect(await cargarContextoDeReunion("noexiste")).toBeNull();
  });

  it("sin ficha usa las voces con nombre como asistentes; sin duración usa la última intervención; sin copropiedad no se rompe", async () => {
    await sembrar();
    await db.meeting.updateMany({ where: { id: "r1" }, data: { digest: null, durationMs: null, property: null } });
    const c = (await cargarContextoDeReunion("r1"))!;
    expect(c.ficha).toBeNull();
    expect(c.asistentes).toEqual([{ nombre: "Martha López", rol: "Presidente del consejo" }]);
    expect(c.duracionMs).toBe(4_000);
    expect(c.propiedad).toBe("Copropiedad");
  });
});

describe("transcripcionParaIA", () => {
  it("una línea por intervención, con la hora y la etiqueta (los nombres van en la leyenda)", () => {
    expect(transcripcionParaIA([{ startMs: 5_000, speaker: "V1", text: "Buenas noches." }, { startMs: 3_725_000, speaker: "H5", text: "Gracias." }])).toBe(
      "[00:00:05] V1: Buenas noches.\n[01:02:05] H5: Gracias.",
    );
    expect(transcripcionParaIA([])).toBe("");
  });
});
