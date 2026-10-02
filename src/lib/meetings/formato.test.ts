import { describe, expect, it } from "vitest";
import { aValorLocal, deValorLocal, fechaCorta, fechaLarga, formatearRestante, formatearVelocidad, horaCorta } from "./formato";

// Se construyen con el constructor local para que las pruebas valgan en cualquier zona horaria.
const iso = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const NBSP = " ";

describe("fechaCorta", () => {
  const ahora = new Date(2026, 9, 1);
  it("sin año si es de este año; con año si es de otro", () => {
    expect(fechaCorta(iso(2026, 10, 12), ahora)).toBe(`12${NBSP}oct`);
    expect(fechaCorta(iso(2025, 12, 31), ahora)).toBe(`31${NBSP}dic${NBSP}2025`);
    expect(fechaCorta(iso(2026, 1, 5), ahora)).toBe(`5${NBSP}ene`);
  });
  it("una fecha inválida no rompe la pantalla", () => {
    expect(fechaCorta("basura")).toBe("—");
    expect(fechaCorta("")).toBe("—");
  });
});

describe("fechaLarga", () => {
  it("escribe el mes completo", () => {
    expect(fechaLarga(iso(2026, 10, 12))).toBe("12 de octubre de 2026");
    expect(fechaLarga(iso(2026, 3, 1))).toBe("1 de marzo de 2026");
    expect(fechaLarga("x")).toBe("—");
  });
});

describe("horaCorta", () => {
  it("usa a. m. / p. m. y las 12 son 12", () => {
    expect(horaCorta(iso(2026, 10, 12, 19, 0))).toBe(`7:00${NBSP}p.${NBSP}m.`);
    expect(horaCorta(iso(2026, 10, 12, 0, 5))).toBe(`12:05${NBSP}a.${NBSP}m.`);
    expect(horaCorta(iso(2026, 10, 12, 12, 30))).toBe(`12:30${NBSP}p.${NBSP}m.`);
    expect(horaCorta(iso(2026, 10, 12, 9, 7))).toBe(`9:07${NBSP}a.${NBSP}m.`);
    expect(horaCorta("x")).toBe("—");
  });
});

describe("valor de datetime-local", () => {
  it("va y viene sin perder la hora", () => {
    const d = new Date(2026, 9, 12, 19, 5);
    expect(aValorLocal(d)).toBe("2026-10-12T19:05");
    expect(deValorLocal("2026-10-12T19:05")?.getTime()).toBe(d.getTime());
    expect(deValorLocal(aValorLocal(d))?.getTime()).toBe(d.getTime());
  });
  it("rechaza vacío y formatos raros", () => {
    for (const v of ["", "2026-10-12", "12/10/2026 19:05", "2026-10-12T19:05:30", "no"]) expect(deValorLocal(v), v).toBeNull();
  });
});

describe("formatearVelocidad", () => {
  it("KB/s por debajo de 1 MB/s y MB/s con un decimal desde ahí", () => {
    expect(formatearVelocidad(512 * 1024)).toBe("512 KB/s");
    expect(formatearVelocidad(1.5 * 1024 * 1024)).toBe("1.5 MB/s");
    expect(formatearVelocidad(24 * 1024 * 1024)).toBe("24.0 MB/s");
    expect(formatearVelocidad(300)).toBe("1 KB/s");
  });
  it("sin velocidad fiable, nada", () => {
    for (const v of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) expect(formatearVelocidad(v), String(v)).toBe("");
  });
});

describe("formatearRestante", () => {
  it("redondea hacia arriba y no muestra segundos", () => {
    expect(formatearRestante(0)).toBe("menos de 1 min");
    expect(formatearRestante(45)).toBe("menos de 1 min");
    expect(formatearRestante(60)).toBe("menos de 1 min");
    expect(formatearRestante(61)).toBe("2 min");
    expect(formatearRestante(134)).toBe("3 min");
    expect(formatearRestante(3599)).toBe("1 h"); // 59 min 59 s sube a 60 min = 1 h
    expect(formatearRestante(3600)).toBe("1 h");
    expect(formatearRestante(3900)).toBe("1 h 5 min");
    expect(formatearRestante(8 * 3600 + 1)).toBe("8 h 1 min");
  });
  it("sin dato, nada", () => {
    for (const v of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatearRestante(v), String(v)).toBe("");
  });
});
