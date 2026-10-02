import { describe, expect, it } from "vitest";
import { MAX_FALTAN_EN_RESPUESTA, offsetAntesDe, planificarCierre, type ParteRecibida } from "./cierre";

const MIME = "audio/webm";
const parte = (session: number, seq: number, bytes = 1000, durationMs = 30_000, mimeType = MIME): ParteRecibida => ({ session, seq, bytes, durationMs, mimeType });
const partes = (session: number, desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => parte(session, desde + i));

describe("planificarCierre · sesiones declaradas", () => {
  it("con todas las partes, cierra la sesión con su tamaño y la duración que midió el dispositivo", () => {
    const plan = planificarCierre(partes(1, 0, 3), [], [{ session: 1, ultimaSecuencia: 3, mimeType: "audio/webm;codecs=opus", duracionMs: 118_000 }]);
    expect(plan.faltan).toEqual([]);
    expect(plan.cerrar).toEqual([{ session: 1, ultimaSecuencia: 3, mimeType: "audio/webm;codecs=opus", sizeBytes: 4000, durationMs: 118_000, huecos: 0 }]);
  });

  it("lista las partes que faltan, en orden, incluida una al final", () => {
    const recibidas = [parte(1, 0), parte(1, 2), parte(2, 0)];
    const plan = planificarCierre(recibidas, [], [
      { session: 2, ultimaSecuencia: 1, mimeType: MIME, duracionMs: 1 },
      { session: 1, ultimaSecuencia: 3, mimeType: MIME, duracionMs: 1 },
    ]);
    expect(plan.faltan).toEqual([{ session: 1, seq: 1 }, { session: 1, seq: 3 }, { session: 2, seq: 1 }]);
  });

  it("una sesión declarada de la que no llegó nada pide todas sus partes", () => {
    const plan = planificarCierre([], [], [{ session: 1, ultimaSecuencia: 2, mimeType: MIME, duracionMs: 90_000 }]);
    expect(plan.faltan).toEqual([{ session: 1, seq: 0 }, { session: 1, seq: 1 }, { session: 1, seq: 2 }]);
  });

  it("si el servidor tiene más partes de las declaradas, gana lo que hay (no se descarta audio)", () => {
    const plan = planificarCierre(partes(1, 0, 5), [], [{ session: 1, ultimaSecuencia: 3, mimeType: MIME, duracionMs: 100_000 }]);
    expect(plan.faltan).toEqual([]);
    expect(plan.cerrar[0]).toMatchObject({ ultimaSecuencia: 5, sizeBytes: 6000 });
  });

  it("una sesión que ya tiene su fuente no se vuelve a cerrar (reintento tras perder la respuesta)", () => {
    const plan = planificarCierre(partes(1, 0, 2), [{ kind: "grabacion", session: 1 }], [{ session: 1, ultimaSecuencia: 2, mimeType: MIME, duracionMs: 1 }]);
    expect(plan).toEqual({ cerrar: [], faltan: [] });
  });

  it("una fuente de tipo archivo no cierra ninguna sesión", () => {
    const plan = planificarCierre(partes(1, 0, 1), [{ kind: "archivo", session: null }], [{ session: 1, ultimaSecuencia: 1, mimeType: MIME, duracionMs: 1 }]);
    expect(plan.cerrar).toHaveLength(1);
  });

  it("las reservas de número (seq −1) no cuentan como audio", () => {
    const plan = planificarCierre([parte(1, -1, 0, 0, ""), ...partes(1, 0, 1)], [], [{ session: 1, ultimaSecuencia: 1, mimeType: MIME, duracionMs: 60_000 }]);
    expect(plan.faltan).toEqual([]);
    expect(plan.cerrar[0].sizeBytes).toBe(2000);
  });

  it("sin duración declarada usa la suma de las partes", () => {
    const plan = planificarCierre([parte(1, 0, 10, 30_000), parte(1, 1, 10, 12_500)], [], [{ session: 1, ultimaSecuencia: 1, mimeType: MIME, duracionMs: 0 }]);
    expect(plan.cerrar[0].durationMs).toBe(42_500);
  });

  it("acota la lista de faltantes para no devolver una respuesta enorme", () => {
    const plan = planificarCierre([], [], [{ session: 1, ultimaSecuencia: 9_999, mimeType: MIME, duracionMs: 1 }]);
    expect(plan.faltan).toHaveLength(MAX_FALTAN_EN_RESPUESTA);
    expect(plan.faltan[0]).toEqual({ session: 1, seq: 0 });
  });
});

describe("planificarCierre · sesiones que nadie declaró", () => {
  it("se cierran con lo que haya, sin bloquear, y se cuentan sus huecos", () => {
    const plan = planificarCierre([parte(2, 0), parte(2, 1), parte(2, 4, 500, 20_000, "audio/mp4")], [], null);
    expect(plan.faltan).toEqual([]);
    expect(plan.cerrar).toEqual([{ session: 2, ultimaSecuencia: 4, mimeType: MIME, sizeBytes: 2500, durationMs: 80_000, huecos: 2 }]);
  });

  it("se suman a las declaradas, en orden de sesión", () => {
    const plan = planificarCierre([...partes(3, 0, 1), ...partes(1, 0, 2)], [], [{ session: 3, ultimaSecuencia: 1, mimeType: MIME, duracionMs: 55_000 }]);
    expect(plan.cerrar.map((s) => s.session)).toEqual([1, 3]);
    expect(plan.cerrar[0]).toMatchObject({ ultimaSecuencia: 2, durationMs: 90_000 });
  });

  it("sin partes y sin sesiones declaradas no hay nada que cerrar", () => {
    expect(planificarCierre([], [], null)).toEqual({ cerrar: [], faltan: [] });
    expect(planificarCierre([parte(1, -1, 0, 0, "")], [], [])).toEqual({ cerrar: [], faltan: [] });
  });
});

describe("offsetAntesDe", () => {
  it("suma las partes de las sesiones anteriores", () => {
    expect(offsetAntesDe(3, [...partes(1, 0, 1), ...partes(2, 0, 0), ...partes(3, 0, 5)], [])).toBe(90_000);
  });
  it("usa la duración de la fuente cuando la sesión ya está cerrada, sin contarla dos veces", () => {
    const fuentes = [{ kind: "grabacion", session: 1, durationMs: 61_000 }];
    expect(offsetAntesDe(2, partes(1, 0, 1), fuentes)).toBe(61_000);
  });
  it("ignora reservas, sesiones posteriores y archivos subidos", () => {
    const todo = [parte(1, -1, 0, 0, ""), parte(2, 0), parte(5, 0)];
    expect(offsetAntesDe(2, todo, [{ kind: "archivo", session: null, durationMs: 999 }])).toBe(0);
  });
});
