/** Lo cargado de la transcripción: una tira continua que se amplía hacia los dos lados. */
import { describe, expect, it } from "vitest";
import type { IntervencionDTO } from "../dto";
import { PAGINA_MS } from "./paginas";
import { agregarAntes, agregarDespues, anteriorDe, estaCargado, inicioDePagina, ventanaDePagina, type Ventana } from "./ventana";

const MIN = 60_000;
const u = (startMs: number): IntervencionDTO => ({ id: `u${startMs}`, startMs, endMs: startMs + 1_000, speaker: "V1", text: `texto ${startMs}` });

describe("inicioDePagina", () => {
  it("es el principio de la página de 30 min donde cae el minuto", () => {
    expect(inicioDePagina(0)).toBe(0);
    expect(inicioDePagina(29 * MIN + 59_999)).toBe(0);
    expect(inicioDePagina(30 * MIN)).toBe(30 * MIN);
    expect(inicioDePagina(5 * 60 * MIN + 12 * MIN)).toBe(5 * 60 * MIN);
    expect(inicioDePagina(-5)).toBe(0);
    expect(inicioDePagina(Number.NaN)).toBe(0);
    expect(PAGINA_MS).toBe(30 * MIN);
  });
});

describe("ventana", () => {
  const desde30 = (): Ventana => ventanaDePagina({ items: [u(31 * MIN), u(40 * MIN), u(59 * MIN)], siguienteMs: 90 * MIN }, 30 * MIN);

  it("una página sola: sabe dónde empieza y desde dónde seguir", () => {
    expect(desde30()).toEqual({ items: [u(31 * MIN), u(40 * MIN), u(59 * MIN)], inicioMs: 30 * MIN, siguienteMs: 90 * MIN });
  });

  it("copia los datos: cambiar la página original no toca la ventana", () => {
    const pagina = { items: [u(1)], siguienteMs: null };
    const v = ventanaDePagina(pagina, 0);
    pagina.items.push(u(2));
    expect(v.items).toHaveLength(1);
  });

  it("está cargado lo que cae entre el principio y la siguiente página (sin incluirla)", () => {
    const v = desde30();
    expect(estaCargado(v, 30 * MIN)).toBe(true);
    expect(estaCargado(v, 75 * MIN)).toBe(true); // un receso dentro de lo cargado: la tira es continua
    expect(estaCargado(v, 29 * MIN)).toBe(false);
    expect(estaCargado(v, 90 * MIN)).toBe(false);
  });

  it("con todo cargado hasta el final, lo posterior también cuenta", () => {
    const v = ventanaDePagina({ items: [u(MIN)], siguienteMs: null }, 0);
    expect(estaCargado(v, 8 * 60 * MIN)).toBe(true);
  });

  it("sin intervenciones no hay nada cargado que enseñar", () => {
    expect(estaCargado(ventanaDePagina({ items: [], siguienteMs: null }, 0), 5)).toBe(false);
  });

  it("lo anterior se pide de 30 min en 30 min y se acaba en el principio", () => {
    expect(anteriorDe(desde30())).toBe(0);
    expect(anteriorDe(ventanaDePagina({ items: [], siguienteMs: null }, 5 * 60 * MIN))).toBe(4 * 60 * MIN + 30 * MIN);
    expect(anteriorDe(ventanaDePagina({ items: [], siguienteMs: null }, 0))).toBeNull();
    expect(anteriorDe(ventanaDePagina({ items: [], siguienteMs: null }, 10 * MIN))).toBe(0);
  });

  it("agregar lo que sigue pone las nuevas después, mueve «siguiente» y no repite", () => {
    const v = agregarDespues(desde30(), { items: [u(59 * MIN), u(95 * MIN)], siguienteMs: null });
    expect(v.items.map((i) => i.startMs)).toEqual([31 * MIN, 40 * MIN, 59 * MIN, 95 * MIN]);
    expect(v.siguienteMs).toBeNull();
    expect(v.inicioMs).toBe(30 * MIN);
  });

  it("agregar lo anterior pone las nuevas antes, mueve el principio y no repite", () => {
    const v = agregarAntes(desde30(), [u(2 * MIN), u(20 * MIN), u(31 * MIN)], 0);
    expect(v.items.map((i) => i.startMs)).toEqual([2 * MIN, 20 * MIN, 31 * MIN, 40 * MIN, 59 * MIN]);
    expect(v.inicioMs).toBe(0);
    expect(v.siguienteMs).toBe(90 * MIN);
  });

  it("agregar una página anterior vacía igual mueve el principio (un receso largo), y nunca lo adelanta", () => {
    const v = agregarAntes(desde30(), [], 0);
    expect(v.items).toHaveLength(3);
    expect(v.inicioMs).toBe(0);
    expect(agregarAntes(desde30(), [], 50 * MIN).inicioMs).toBe(30 * MIN);
  });

  it("no modifica la ventana de partida", () => {
    const v = desde30();
    agregarAntes(v, [u(MIN)], 0);
    agregarDespues(v, { items: [u(100 * MIN)], siguienteMs: null });
    expect(v.items).toHaveLength(3);
    expect(v.inicioMs).toBe(30 * MIN);
  });
});
