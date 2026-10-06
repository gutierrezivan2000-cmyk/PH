import { describe, expect, it } from "vitest";
import { claveDeNombre, numeroDeEtiqueta, planificarGuardado, type FilaDeHablante, type PedidoDeHablante } from "./nombres";

const fila = (label: string, talkMs: number, extra: Partial<FilaDeHablante> = {}): FilaDeHablante => ({ label, name: null, role: null, personId: null, confirmed: false, talkMs, ...extra });
const pedido = (label: string, name: string | null, extra: Partial<PedidoDeHablante> = {}): PedidoDeHablante => ({ label, name, role: null, personId: null, ...extra });
const MIN = 60_000;

describe("numeroDeEtiqueta y claveDeNombre", () => {
  it("V1 → 1, H12 → 12; lo que no es una etiqueta queda al final", () => {
    expect([numeroDeEtiqueta("V1"), numeroDeEtiqueta("H12"), numeroDeEtiqueta("A")]).toEqual([1, 12, Number.MAX_SAFE_INTEGER]);
  });
  it("los nombres que solo cambian en mayúsculas, tildes o espacios son el mismo", () => {
    expect(claveDeNombre("  Martha   LÓPEZ ")).toBe(claveDeNombre("martha lopez"));
    expect(claveDeNombre("Martha López")).not.toBe(claveDeNombre("Martha Pérez"));
  });
});

describe("planificarGuardado", () => {
  const voces = [fila("V1", 40 * MIN), fila("V2", 30 * MIN), fila("V3", 20 * MIN), fila("H5", 5 * MIN)];

  it("poner un nombre confirma esa voz; quitarlo la deja sin confirmar", () => {
    const plan = planificarGuardado(voces, [pedido("V1", "Martha López", { role: "presidente", personId: "p1" }), pedido("V2", null)]);
    expect(plan.fusiones).toEqual([]);
    expect(plan.actualizar).toEqual([
      { label: "V1", name: "Martha López", role: "presidente", personId: "p1", confirmed: true, talkMs: 40 * MIN },
      { label: "V2", name: null, role: null, personId: null, confirmed: false, talkMs: 30 * MIN },
    ]);
  });

  it("solo cambia lo que se pide: las voces que no se mencionan se dejan como están", () => {
    const plan = planificarGuardado([fila("V1", 10, { name: "Ana", confirmed: true }), fila("V2", 5)], [pedido("V2", "Beto")]);
    expect(plan.actualizar.map((a) => a.label)).toEqual(["V2"]);
  });

  it("los espacios sobrantes se quitan y un nombre en blanco es no tener nombre", () => {
    const plan = planificarGuardado(voces, [pedido("V1", "   Ana  "), pedido("V2", "   ")]);
    expect(plan.actualizar).toMatchObject([{ label: "V1", name: "Ana", confirmed: true }, { label: "V2", name: null, confirmed: false }]);
  });

  it("dos voces con el mismo nombre se fusionan en la que más habla, con el habla sumada", () => {
    const plan = planificarGuardado(voces, [pedido("V2", "Jorge Pardo"), pedido("H5", "jorge  pardo"), pedido("V3", "Jorge Pardo")]);
    expect(plan.fusiones).toEqual([{ canonica: "V2", absorbidas: ["V3", "H5"], talkMs: 55 * MIN }]);
    expect(plan.actualizar).toEqual([{ label: "V2", name: "Jorge Pardo", role: null, personId: null, confirmed: true, talkMs: 55 * MIN }]);
  });

  it("la fusión conserva el rol y la persona de cualquiera de las voces si la que manda no los tiene", () => {
    const plan = planificarGuardado(voces, [pedido("V1", "Ana"), pedido("V3", "Ana", { role: "consejero", personId: "p9" })]);
    expect(plan.fusiones[0]).toMatchObject({ canonica: "V1", absorbidas: ["V3"] });
    expect(plan.actualizar).toEqual([{ label: "V1", name: "Ana", role: "consejero", personId: "p9", confirmed: true, talkMs: 60 * MIN }]);
    // Y si la que manda ya tiene rol y persona, esos mandan.
    const otro = planificarGuardado(voces, [pedido("V1", "Ana", { role: "presidente", personId: "p1" }), pedido("V3", "Ana", { role: "consejero", personId: "p9" })]);
    expect(otro.actualizar[0]).toMatchObject({ role: "presidente", personId: "p1" });
  });

  it("a igual habla manda la de número más bajo", () => {
    const plan = planificarGuardado([fila("V2", 10 * MIN), fila("V1", 10 * MIN)], [pedido("V1", "X"), pedido("V2", "X")]);
    expect(plan.fusiones[0].canonica).toBe("V1");
  });

  it("también se fusiona con una voz que ya tenía ese nombre y no se mencionó en el pedido", () => {
    const existentes = [fila("V1", 40 * MIN, { name: "Martha López", confirmed: true, personId: "p1", role: "presidente" }), fila("V3", 20 * MIN)];
    const plan = planificarGuardado(existentes, [pedido("V3", "Martha López")]);
    expect(plan.fusiones).toEqual([{ canonica: "V1", absorbidas: ["V3"], talkMs: 60 * MIN }]);
    expect(plan.actualizar).toEqual([{ label: "V1", name: "Martha López", role: "presidente", personId: "p1", confirmed: true, talkMs: 60 * MIN }]);
  });

  it("varios grupos a la vez, cada uno con lo suyo", () => {
    const plan = planificarGuardado(
      [fila("V1", 10), fila("V2", 20), fila("V3", 30), fila("V4", 40)],
      [pedido("V1", "Ana"), pedido("V2", "Beto"), pedido("V3", "Beto"), pedido("V4", "Ana")],
    );
    expect(plan.fusiones).toEqual([{ canonica: "V3", absorbidas: ["V2"], talkMs: 50 }, { canonica: "V4", absorbidas: ["V1"], talkMs: 50 }]);
    expect(plan.actualizar.map((a) => a.label)).toEqual(["V3", "V4"]);
  });

  it("las etiquetas que no existen se ignoran, y sin pedidos no hay nada que hacer", () => {
    expect(planificarGuardado(voces, [pedido("V9", "Fantasma")])).toEqual({ actualizar: [], fusiones: [] });
    expect(planificarGuardado(voces, [])).toEqual({ actualizar: [], fusiones: [] });
    expect(planificarGuardado([], [pedido("V1", "Ana")])).toEqual({ actualizar: [], fusiones: [] });
  });

  it("repetir el mismo pedido ya aplicado no cambia nada más (idempotente)", () => {
    const una = planificarGuardado(voces, [pedido("V2", "Jorge"), pedido("V3", "Jorge")]);
    // Después de la primera vez V3 ya no existe; V2 tiene el habla sumada.
    const despues = [fila("V1", 40 * MIN), fila("V2", 50 * MIN, { name: "Jorge", confirmed: true }), fila("H5", 5 * MIN)];
    const dos = planificarGuardado(despues, [pedido("V2", "Jorge"), pedido("V3", "Jorge")]);
    expect(una.fusiones).toEqual([{ canonica: "V2", absorbidas: ["V3"], talkMs: 50 * MIN }]);
    expect(dos.fusiones).toEqual([]);
    expect(dos.actualizar).toEqual([{ label: "V2", name: "Jorge", role: null, personId: null, confirmed: true, talkMs: 50 * MIN }]);
  });
});
