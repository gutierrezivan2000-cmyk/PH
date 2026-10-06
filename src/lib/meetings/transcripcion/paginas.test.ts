import { describe, expect, it } from "vitest";
import type { IntervencionDTO } from "../dto";
import {
  MAX_COINCIDENCIAS, PAGINA_MS, coincideConBusqueda, leerConsulta, normalizarBusqueda, paginarEnMemoria, siguienteTrasPagina, terminosDeBusqueda,
} from "./paginas";

const consulta = (qs: string) => leerConsulta(new URLSearchParams(qs));
const u = (startMs: number, text = "texto", speaker = "V1"): IntervencionDTO => ({ id: `u${startMs}`, startMs, endMs: startMs + 1000, speaker, text });
const MIN = 60_000;

describe("leerConsulta", () => {
  it("sin nada pide los primeros 30 min", () => {
    expect(consulta("")).toEqual({ ok: true, valor: { desdeMs: 0, hastaMs: PAGINA_MS, q: "" } });
  });

  it("una página nunca pasa de 30 min, aunque pidan más", () => {
    expect(consulta("desde=600000&hasta=99999999")).toEqual({ ok: true, valor: { desdeMs: 600_000, hastaMs: 600_000 + PAGINA_MS, q: "" } });
    expect(consulta("desde=0&hasta=300000")).toEqual({ ok: true, valor: { desdeMs: 0, hastaMs: 300_000, q: "" } });
  });

  it("con búsqueda recorre toda la reunión desde donde se pida, sin final si no se da", () => {
    expect(consulta("q=ascensor")).toEqual({ ok: true, valor: { desdeMs: 0, hastaMs: null, q: "ascensor" } });
    expect(consulta("q=ascensor&desde=3600000&hasta=7200000")).toEqual({ ok: true, valor: { desdeMs: 3_600_000, hastaMs: 7_200_000, q: "ascensor" } });
  });

  it("limpia los espacios de la búsqueda", () => {
    expect(consulta("q=%20%20contrato%20%20%20schindler%20")).toMatchObject({ ok: true, valor: { q: "contrato schindler" } });
  });

  it("rechaza lo que no es válido con un mensaje en español", () => {
    for (const qs of ["desde=-1", "desde=abc", "desde=1.5", "desde=99999999999", `desde=${48 * 3_600_000 + 1}`, "desde=100&hasta=100", "desde=100&hasta=50", "hasta=x", `q=${"a".repeat(101)}`]) {
      const r = consulta(qs);
      expect(r.ok, qs).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/[a-záéíóú]/i);
    }
  });
});

describe("búsqueda", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(normalizarBusqueda("Reunión DEL Año")).toBe("reunion del ano");
    expect(coincideConBusqueda("La Cotización del ASCENSOR", terminosDeBusqueda("cotizacion ascensor"))).toBe(true);
  });

  it("todas las palabras tienen que estar, en cualquier orden", () => {
    const t = terminosDeBusqueda("schindler contrato");
    expect(coincideConBusqueda("El contrato con Schindler vence en octubre", t)).toBe(true);
    expect(coincideConBusqueda("El contrato vence en octubre", t)).toBe(false);
  });

  it("una búsqueda vacía coincide con todo; las palabras repetidas se cuentan una vez", () => {
    expect(coincideConBusqueda("lo que sea", [])).toBe(true);
    expect(terminosDeBusqueda("a  a  b")).toEqual(["a", "b"]);
    expect(terminosDeBusqueda("   ")).toEqual([]);
  });

  it("busca fragmentos de palabra, no solo palabras enteras", () => {
    expect(coincideConBusqueda("administración", terminosDeBusqueda("administra"))).toBe(true);
  });
});

describe("siguienteTrasPagina", () => {
  it("sin más intervenciones no hay siguiente", () => {
    expect(siguienteTrasPagina(30 * MIN, null)).toBeNull();
  });
  it("salta los bloques de 30 min vacíos (un receso largo) hasta donde vuelve la voz", () => {
    expect(siguienteTrasPagina(30 * MIN, 31 * MIN)).toBe(30 * MIN);
    expect(siguienteTrasPagina(30 * MIN, 95 * MIN)).toBe(90 * MIN);
  });
  it("nunca devuelve algo anterior a donde terminó la página", () => {
    expect(siguienteTrasPagina(45 * MIN, 46 * MIN)).toBe(45 * MIN);
  });
});

describe("paginarEnMemoria", () => {
  const todas = [u(5_000), u(10 * MIN), u(29 * MIN + 59_000), u(30 * MIN), u(31 * MIN, "el ascensor de la torre A"), u(95 * MIN, "otra vez el ascensor"), u(2 * 3_600_000)];

  it("una página son las intervenciones que empiezan en su rango, en orden", () => {
    const p = paginarEnMemoria([...todas].reverse(), { desdeMs: 0, hastaMs: PAGINA_MS, q: "" });
    expect(p.items.map((x) => x.startMs)).toEqual([5_000, 10 * MIN, 29 * MIN + 59_000]);
    expect(p.siguienteMs).toBe(30 * MIN);
  });

  it("la segunda página arranca donde terminó la primera y la última no tiene siguiente", () => {
    const p2 = paginarEnMemoria(todas, { desdeMs: 30 * MIN, hastaMs: 60 * MIN, q: "" });
    expect(p2.items.map((x) => x.startMs)).toEqual([30 * MIN, 31 * MIN]);
    expect(p2.siguienteMs).toBe(90 * MIN); // el bloque 60–90 está vacío: se salta
    const ultima = paginarEnMemoria(todas, { desdeMs: 90 * MIN, hastaMs: 120 * MIN, q: "" });
    expect(ultima.items.map((x) => x.startMs)).toEqual([95 * MIN]);
    expect(ultima.siguienteMs).toBe(120 * MIN);
    expect(paginarEnMemoria(todas, { desdeMs: 120 * MIN, hastaMs: 150 * MIN, q: "" })).toEqual({ items: [u(2 * 3_600_000)], siguienteMs: null });
  });

  it("recorriendo las páginas con siguienteMs se ve cada intervención una sola vez", () => {
    const vistas: number[] = [];
    let desde: number | null = 0;
    for (let guardia = 0; desde !== null && guardia < 20; guardia++) {
      const p = paginarEnMemoria(todas, { desdeMs: desde, hastaMs: desde + PAGINA_MS, q: "" });
      vistas.push(...p.items.map((x) => x.startMs));
      desde = p.siguienteMs;
    }
    expect(vistas).toEqual(todas.map((x) => x.startMs));
  });

  it("con búsqueda devuelve las coincidencias de toda la reunión", () => {
    const p = paginarEnMemoria(todas, { desdeMs: 0, hastaMs: null, q: "ASCENSOR" });
    expect(p.items.map((x) => x.startMs)).toEqual([31 * MIN, 95 * MIN]);
    expect(p.siguienteMs).toBeNull();
  });

  it("la búsqueda respeta desde y hasta si se piden", () => {
    expect(paginarEnMemoria(todas, { desdeMs: 60 * MIN, hastaMs: null, q: "ascensor" }).items.map((x) => x.startMs)).toEqual([95 * MIN]);
    expect(paginarEnMemoria(todas, { desdeMs: 0, hastaMs: 60 * MIN, q: "ascensor" }).items.map((x) => x.startMs)).toEqual([31 * MIN]);
  });

  it("con muchas coincidencias entrega 200 y dice dónde seguir", () => {
    const muchas = Array.from({ length: 250 }, (_, k) => u(k * 1000, "palabra repetida"));
    const p = paginarEnMemoria(muchas, { desdeMs: 0, hastaMs: null, q: "repetida" });
    expect(p.items).toHaveLength(MAX_COINCIDENCIAS);
    expect(p.siguienteMs).toBe(200_000);
    const resto = paginarEnMemoria(muchas, { desdeMs: p.siguienteMs as number, hastaMs: null, q: "repetida" });
    expect(resto.items).toHaveLength(50);
    expect(resto.siguienteMs).toBeNull();
  });

  it("sin nada que mostrar da una lista vacía", () => {
    expect(paginarEnMemoria([], { desdeMs: 0, hastaMs: PAGINA_MS, q: "" })).toEqual({ items: [], siguienteMs: null });
    expect(paginarEnMemoria(todas, { desdeMs: 0, hastaMs: null, q: "xyz" })).toEqual({ items: [], siguienteMs: null });
  });
});
