/**
 * La retención de Reuniones: los originales se borran a los 90 días (solo si ya hay `audio.mp3`), las partes en vivo de una sesión
 * ya ensamblada y comprobada se borran a los 2, y NADA más se toca.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { ErrorAlmacen } from "./almacen";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { diasDeRetencion, limpiarReuniones, rutaBorrable } from "./retencion";
import { RETENCION_ORIGINAL_DIAS, TEXTO_DE_RETENCION } from "./tipos";

const DIA = 86_400_000;
const AHORA = new Date("2026-10-07T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA);
const ID = "reunionprueba1";
const OTRA = "reunionprueba2";
const url = (id: string, ruta: string) => `https://almacen.test/meetings/${id}/${ruta}`;

let db: DbFalsa;
let borrados: string[];
const almacen = {
  borrar: vi.fn(async (urls: string[]) => {
    borrados.push(...urls);
  }),
};
const limpiar = (extra: Partial<Parameters<typeof limpiarReuniones>[0]> = {}) => limpiarReuniones({ almacen, ahora: AHORA, ...extra });

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  borrados = [];
  almacen.borrar.mockClear();
  almacen.borrar.mockImplementation(async (urls: string[]) => {
    borrados.push(...urls);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const reunion = (extra: Record<string, unknown> = {}, id = ID) =>
  db.meeting.create({ data: { id, userId: "u1", status: "lista", audioUrl: url(id, "audio.mp3"), ...extra } });
let n = 0;
const fuente = async (extra: Record<string, unknown> = {}, meetingId = ID) =>
  (await db.meetingSource.create({
    data: {
      id: `f${++n}`, meetingId, idx: n, kind: "archivo", name: "a.m4a", status: "normalizada", sizeBytes: 1000, originalDeletedAt: null,
      url: url(meetingId, `fuentes/abc12345-a${n}.m4a`), createdAt: hace(100), updatedAt: hace(100), ...extra,
    },
  })) as { id: string; url: string };
const parte = async (seq: number, extra: Record<string, unknown> = {}, meetingId = ID, session = 1) =>
  (await db.meetingLivePart.create({
    data: { meetingId, session, seq, url: url(meetingId, `vivo/${session}/${seq}.webm`), bytes: 500, durationMs: 30_000, mimeType: "audio/webm", createdAt: hace(5), ...extra },
  })) as { id: string; url: string };
const filaDeFuente = (id: string) => db.meetingSource.filas.find((f) => f.id === id)!;

describe("diasDeRetencion", () => {
  it("90 días para los originales y 2 para las partes; las variables de entorno los cambian", () => {
    expect(diasDeRetencion({})).toEqual({ originalDias: 90, partesDias: 2 });
    expect(diasDeRetencion({ RETENCION_ORIGINAL_DIAS: "30", RETENCION_PARTES_DIAS: "7" })).toEqual({ originalDias: 30, partesDias: 7 });
    expect(diasDeRetencion({ RETENCION_ORIGINAL_DIAS: " 45 " })).toEqual({ originalDias: 45, partesDias: 2 });
  });
  it("el plazo que se les dice a las personas es el que se aplica (salvo que el servidor lo cambie)", () => {
    expect(diasDeRetencion({}).originalDias).toBe(RETENCION_ORIGINAL_DIAS);
    expect(TEXTO_DE_RETENCION).toContain(`${RETENCION_ORIGINAL_DIAS} días`);
    expect(TEXTO_DE_RETENCION).toMatch(/transcripción y el audio de trabajo se conservan/);
  });
  it("un valor que no es un número de días (vacío, texto, cero, negativo) usa el de siempre: nunca borra todo por un descuido", () => {
    for (const malo of ["", "  ", "mucho", "0", "-5", "NaN", "0.4"]) {
      expect(diasDeRetencion({ RETENCION_ORIGINAL_DIAS: malo, RETENCION_PARTES_DIAS: malo }), malo).toEqual({ originalDias: 90, partesDias: 2 });
    }
    expect(diasDeRetencion({ RETENCION_ORIGINAL_DIAS: "12.9" }).originalDias).toBe(12);
  });
});

describe("rutaBorrable", () => {
  const prefijo = `meetings/${ID}/fuentes/`;
  it("solo da la ruta de lo que cuelga del lugar que le toca", () => {
    expect(rutaBorrable(url(ID, "fuentes/abc12345-a.m4a"), prefijo)).toBe(`meetings/${ID}/fuentes/abc12345-a.m4a`);
    expect(rutaBorrable(url(ID, "fuentes/sesion-1.webm"), prefijo)).toBe(`meetings/${ID}/fuentes/sesion-1.webm`);
    expect(rutaBorrable(url(ID, "fuentes/Reunion%20mayo.m4a"), prefijo)).toBe(`meetings/${ID}/fuentes/Reunion mayo.m4a`);
  });
  it("lo de otra reunión, de otra carpeta, de otro módulo o con «..» no es borrable", () => {
    for (const mala of [
      url(OTRA, "fuentes/abc12345-a.m4a"), // otra reunión
      url(ID, "audio.mp3"), // el audio que se conserva
      url(ID, "norm/f1/0000.mp3"),
      url(ID, "fuentes/"), // la carpeta misma
      url(ID, "fuentes/../audio.mp3"),
      url(ID, "fuentes/%2e%2e/%2e%2e/audio.mp3"),
      "https://almacen.test/documentos/informe.pdf", // de otro módulo
      "https://almacen.test/generations/g1/acta.html",
      "no es una url",
      "",
    ]) {
      expect(rutaBorrable(mala, prefijo), mala).toBeNull();
    }
    expect(rutaBorrable(null, prefijo)).toBeNull();
    expect(rutaBorrable(undefined, prefijo)).toBeNull();
  });
});

describe("originales", () => {
  it("a los 90 días borra el original de una reunión lista y lo deja anotado; no toca el audio, lo normalizado ni la transcripción", async () => {
    await reunion({ transcriptUrl: url(ID, "transcripcion.txt") });
    const f = await fuente({ sizeBytes: 123_456 });
    const r = await limpiar();
    expect(borrados).toEqual([f.url]);
    expect(filaDeFuente(f.id)).toMatchObject({ originalDeletedAt: AHORA, url: f.url });
    expect(r).toEqual({ originales: 1, sesiones: 0, partes: 0, bytesLiberados: 123_456, omitidas: 0, errores: 0, pendiente: false });
  });

  it("lo que tiene menos de 90 días se queda; con otro plazo, el plazo que se diga", async () => {
    await reunion();
    const joven = await fuente({ createdAt: hace(89) });
    await limpiar();
    expect(borrados).toEqual([]);
    expect(filaDeFuente(joven.id).originalDeletedAt).toBeNull();
    await limpiar({ dias: { originalDias: 60, partesDias: 2 } });
    expect(borrados).toEqual([joven.url]);
  });

  it("también las sesiones ensambladas de lo grabado, y los archivos de reuniones sin horas o con error (su audio ya está armado)", async () => {
    await reunion({ status: "lista" }, ID);
    await reunion({ status: "sin_cupo" }, OTRA);
    await reunion({ status: "error" }, "reunionprueba3");
    const a = await fuente({ kind: "grabacion", session: 1, url: url(ID, "fuentes/sesion-1.webm") });
    const b = await fuente({}, OTRA);
    const c = await fuente({}, "reunionprueba3");
    const r = await limpiar();
    expect(borrados.sort()).toEqual([a.url, b.url, c.url].sort());
    expect(r.originales).toBe(3);
  });

  it("solo cuando ya hay audio y nada está en marcha: un borrador, una grabación, una que se procesa o una sin audio conservan su original", async () => {
    const estados: Array<[string, Record<string, unknown>]> = [
      ["borrador", {}], ["subiendo", {}], ["grabando", {}], ["en_cola", {}], ["procesando", {}], ["lista pero sin audio", { status: "lista", audioUrl: null }],
    ];
    for (const [i, [nombre, extra]] of estados.entries()) {
      const id = `reunionestado${i}`;
      await reunion({ status: nombre, ...extra }, id);
      await fuente({}, id);
    }
    const r = await limpiar();
    expect(borrados).toEqual([]);
    expect(r.originales).toBe(0);
    expect(db.meetingSource.filas.every((f) => f.originalDeletedAt === null)).toBe(true);
  });

  it("no vuelve a borrar lo ya borrado ni toca lo que no tiene archivo", async () => {
    await reunion();
    await fuente({ originalDeletedAt: hace(10) });
    await fuente({ url: null });
    expect((await limpiar()).originales).toBe(0);
    expect(almacen.borrar).not.toHaveBeenCalled();
  });

  it("es idempotente: la segunda pasada no encuentra nada que hacer", async () => {
    await reunion();
    await fuente();
    await fuente();
    expect((await limpiar()).originales).toBe(2);
    almacen.borrar.mockClear();
    expect(await limpiar()).toMatchObject({ originales: 0, errores: 0, pendiente: false });
    expect(almacen.borrar).not.toHaveBeenCalled();
  });

  it("una ruta que no es de la carpeta de su reunión no se borra (ni se anota): se avisa en el registro", async () => {
    await reunion();
    const deOtra = await fuente({ url: url(OTRA, "fuentes/abc12345-a.m4a") });
    const delAudio = await fuente({ url: url(ID, "audio.mp3") });
    const deOtroModulo = await fuente({ url: "https://almacen.test/documentos/informe.pdf" });
    const rara = await fuente({ url: "no es una url" });
    const buena = await fuente();
    const r = await limpiar();
    expect(borrados).toEqual([buena.url]);
    for (const f of [deOtra, delAudio, deOtroModulo, rara]) expect(filaDeFuente(f.id).originalDeletedAt, f.id).toBeNull();
    expect(r).toMatchObject({ originales: 1, omitidas: 4 });
    expect(console.error).toHaveBeenCalledTimes(4);
  });

  it("un identificador de reunión raro tampoco borra nada", async () => {
    await reunion({}, "x");
    await fuente({ url: "https://almacen.test/meetings/x/fuentes/abc12345-a.m4a" }, "x");
    expect(await limpiar()).toMatchObject({ originales: 0, omitidas: 1 });
    expect(almacen.borrar).not.toHaveBeenCalled();
  });

  it("si el almacén falla no se anota nada y se sigue con los demás; mañana se reintenta", async () => {
    await reunion();
    const mala = await fuente();
    const buena = await fuente();
    almacen.borrar.mockImplementation(async (urls: string[]) => {
      if (urls[0] === mala.url) throw new ErrorAlmacen("sin conexión", "transitorio");
      borrados.push(...urls);
    });
    expect(await limpiar()).toMatchObject({ originales: 1, errores: 1 });
    expect(filaDeFuente(mala.id).originalDeletedAt).toBeNull();
    expect(filaDeFuente(buena.id).originalDeletedAt).toEqual(AHORA);
    // Al volver el almacén, la siguiente pasada termina el trabajo.
    almacen.borrar.mockImplementation(async (urls: string[]) => {
      borrados.push(...urls);
    });
    expect(await limpiar()).toMatchObject({ originales: 1, errores: 0 });
    expect(filaDeFuente(mala.id).originalDeletedAt).toEqual(AHORA);
  });

  it("si el archivo ya no estaba en el almacén, igual queda anotado como borrado", async () => {
    await reunion();
    const f = await fuente();
    almacen.borrar.mockRejectedValue(new ErrorAlmacen("El archivo no existe en el almacenamiento.", "no_encontrado"));
    expect(await limpiar()).toMatchObject({ originales: 1, errores: 0 });
    expect(filaDeFuente(f.id).originalDeletedAt).toEqual(AHORA);
  });

  it("si falla al anotar, el archivo ya está borrado y la próxima pasada lo anota (borrar de nuevo no hace daño)", async () => {
    await reunion();
    const f = await fuente();
    vi.spyOn(db.meetingSource, "update").mockRejectedValueOnce(new Error("conexión perdida"));
    expect(await limpiar()).toMatchObject({ originales: 0, errores: 1 });
    expect(filaDeFuente(f.id).originalDeletedAt).toBeNull();
    expect(await limpiar()).toMatchObject({ originales: 1, errores: 0 });
    expect(filaDeFuente(f.id).originalDeletedAt).toEqual(AHORA);
  });

  it("cada pasada tiene su tope: borra hasta ahí, lo dice (`pendiente`) y la siguiente sigue", async () => {
    await reunion();
    for (let i = 0; i < 5; i++) await fuente();
    const primera = await limpiar({ limite: 2 });
    expect(primera).toMatchObject({ originales: 2, pendiente: true });
    const segunda = await limpiar({ limite: 2 });
    expect(segunda).toMatchObject({ originales: 2, pendiente: true });
    const tercera = await limpiar({ limite: 2 });
    expect(tercera).toMatchObject({ originales: 1, pendiente: false });
    expect(db.meetingSource.filas.every((f) => f.originalDeletedAt !== null)).toBe(true);
  });

  it("con justo tantos candidatos como el tope no queda nada pendiente (no se dice que falta algo cuando no falta)", async () => {
    await reunion();
    await fuente();
    await fuente();
    expect(await limpiar({ limite: 2 })).toMatchObject({ originales: 2, pendiente: false });
  });

  it("si se acaba el tiempo no empieza nada nuevo y lo dice", async () => {
    await reunion();
    await fuente();
    expect(await limpiar({ presupuestoMs: -1 })).toMatchObject({ originales: 0, pendiente: true });
    expect(almacen.borrar).not.toHaveBeenCalled();
  });

  it("lo que no toca borrar —por viejo que sea— no tapa a lo que sí toca (más de un lote de candidatos)", async () => {
    await reunion({ status: "procesando" }, OTRA); // viejo pero en marcha: no se toca
    for (let i = 0; i < 205; i++) await fuente({ createdAt: hace(300) }, OTRA);
    await reunion();
    const buena = await fuente({ createdAt: hace(95) });
    const r = await limpiar();
    expect(borrados).toEqual([buena.url]);
    expect(r.originales).toBe(1);
  });
});

describe("partes en vivo", () => {
  /** Una sesión de la grabadora ya ensamblada y comprobada hace `dias` días. */
  const sesionEnsamblada = (extra: Record<string, unknown> = {}, meetingId = ID, session = 1) =>
    fuente({ kind: "grabacion", session, url: url(meetingId, `fuentes/sesion-${session}.webm`), status: "normalizada", createdAt: hace(5), updatedAt: hace(5), ...extra }, meetingId);

  it("las partes de una sesión ya ensamblada y comprobada sobran: se borran sus archivos y sus filas", async () => {
    await reunion();
    await sesionEnsamblada();
    const partes = [await parte(0), await parte(1), await parte(2)];
    const r = await limpiar();
    expect(borrados.sort()).toEqual(partes.map((p) => p.url).sort());
    expect(db.meetingLivePart.filas).toHaveLength(0);
    expect(r).toEqual({ originales: 0, sesiones: 1, partes: 3, bytesLiberados: 1500, omitidas: 0, errores: 0, pendiente: false });
  });

  it("la reserva del número de sesión (seq −1) se queda", async () => {
    await reunion();
    await sesionEnsamblada();
    await parte(-1, { url: "", bytes: 0 });
    await parte(0);
    await limpiar();
    expect(db.meetingLivePart.filas.map((p) => p.seq)).toEqual([-1]);
    expect(borrados).toHaveLength(1);
  });

  it("las partes de una grabación sin cerrar o sin ensamblar NO se tocan: son lo único que hay de ese audio", async () => {
    await reunion({ status: "grabando", audioUrl: null });
    await parte(0);
    await parte(1);
    // Una sesión cerrada pero todavía sin ensamblar (no tiene archivo), y otra cuyo ensamblado no se pudo comprobar.
    await fuente({ kind: "grabacion", session: 2, url: null, status: "recibida", createdAt: hace(5), updatedAt: hace(5) });
    await parte(0, {}, ID, 2);
    await fuente({ kind: "grabacion", session: 3, url: url(ID, "fuentes/sesion-3.webm"), status: "error", createdAt: hace(5), updatedAt: hace(5) });
    await parte(0, {}, ID, 3);
    await fuente({ kind: "grabacion", session: 4, url: url(ID, "fuentes/sesion-4.webm"), status: "normalizando", createdAt: hace(5), updatedAt: hace(5) });
    await parte(0, {}, ID, 4);
    const r = await limpiar();
    expect(borrados).toEqual([]);
    expect(db.meetingLivePart.filas).toHaveLength(5);
    expect(r).toMatchObject({ sesiones: 0, partes: 0 });
  });

  it("una sesión se ensambló hace poco (menos del margen): las partes esperan; y las partes recientes también", async () => {
    await reunion();
    await sesionEnsamblada({ updatedAt: hace(1) });
    await parte(0);
    await limpiar();
    expect(borrados).toEqual([]);
    // El margen es el que se diga.
    await limpiar({ dias: { originalDias: 90, partesDias: 1 } });
    expect(borrados).toHaveLength(0); // las partes tienen 5 días pero el ensamblado, menos de 1: espera
    db.meetingSource.filas[0].updatedAt = hace(2);
    await limpiar({ dias: { originalDias: 90, partesDias: 1 } });
    expect(borrados).toHaveLength(1);
  });

  it("solo las partes de la sesión ensamblada: las de otra sesión de la misma reunión siguen ahí", async () => {
    await reunion();
    await sesionEnsamblada({}, ID, 1);
    await parte(0, {}, ID, 1);
    await parte(0, {}, ID, 2);
    await limpiar();
    expect(db.meetingLivePart.filas.map((p) => `${p.session}:${p.seq}`)).toEqual(["2:0"]);
  });

  it("una parte con una ruta que no es de la carpeta de su reunión frena a toda la sesión: no se borra nada", async () => {
    await reunion();
    await sesionEnsamblada();
    await parte(0);
    await parte(1, { url: url(OTRA, "vivo/1/1.webm") });
    const r = await limpiar();
    expect(borrados).toEqual([]);
    expect(db.meetingLivePart.filas).toHaveLength(2);
    expect(r).toMatchObject({ sesiones: 0, omitidas: 1 });
  });

  it("si el almacén falla se conservan las filas (la próxima pasada reintenta)", async () => {
    await reunion();
    await sesionEnsamblada();
    await parte(0);
    almacen.borrar.mockRejectedValueOnce(new ErrorAlmacen("sin conexión", "transitorio"));
    expect(await limpiar()).toMatchObject({ sesiones: 0, errores: 1 });
    expect(db.meetingLivePart.filas).toHaveLength(1);
    expect(await limpiar()).toMatchObject({ sesiones: 1, partes: 1, errores: 0 });
    expect(db.meetingLivePart.filas).toHaveLength(0);
  });

  it("muchas sesiones sin ensamblar no tapan a la que sí toca (más de un lote)", async () => {
    await reunion({ status: "grabando", audioUrl: null }, OTRA);
    for (let s = 1; s <= 55; s++) await parte(0, { createdAt: hace(300) }, OTRA, s); // 55 sesiones abandonadas, más viejas
    await reunion();
    await sesionEnsamblada();
    const buena = await parte(0);
    const r = await limpiar();
    expect(borrados).toEqual([buena.url]);
    expect(r.sesiones).toBe(1);
  });

  it("con justo tantas sesiones como el tope no queda nada pendiente", async () => {
    await reunion();
    for (let s = 1; s <= 2; s++) {
      await sesionEnsamblada({}, ID, s);
      await parte(0, {}, ID, s);
    }
    expect(await limpiar({ limite: 2 })).toMatchObject({ sesiones: 2, pendiente: false });
  });

  it("cada pasada tiene su tope de sesiones", async () => {
    await reunion();
    for (let s = 1; s <= 3; s++) {
      await sesionEnsamblada({}, ID, s);
      await parte(0, {}, ID, s);
    }
    expect(await limpiar({ limite: 2 })).toMatchObject({ sesiones: 2, pendiente: true });
    expect(await limpiar({ limite: 2 })).toMatchObject({ sesiones: 1, pendiente: false });
  });
});
