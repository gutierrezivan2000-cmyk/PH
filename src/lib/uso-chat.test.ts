import { describe, expect, it } from "vitest";
import { estadoDeUso, inicioDelDiaBogota, LIMITES_DEL_ASISTENTE_DEL_PORTAL, limitesDelAsistenteDelPortal, mensajeDeAgotado, nivelDeAviso, periodoMensualBogota, topeDelAsistenteDelPortal } from "./uso-chat";

const ahora = new Date("2026-10-15T15:00:00Z");
const periodo = periodoMensualBogota(ahora);
const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000);

describe("estadoDeUso", () => {
  it("sin consumo, queda el 100 %", () => {
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [], ahora });
    expect(e).toMatchObject({ porcentajeRestante: 100, agotado: false });
  });

  it("baja con el costo real de cada mensaje, no con la cuenta de mensajes", () => {
    // 0,5 USD en total: en un plan de 5 USD al mes son 10 % del mes, y en la sesión de 5 h (cap 1 USD) son 50 %.
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [{ fecha: hace(1), costUsd: 0.5 }], ahora });
    expect(e.porcentajeRestante).toBe(50);
    expect(e.ventana).toBe("sesion");
    expect(e.agotado).toBe(false);
  });

  it("la sesión de 5 horas se agota antes que el mes, y se libera cuando sale su consumo más antiguo", () => {
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [{ fecha: hace(4), costUsd: 1 }], ahora });
    expect(e).toMatchObject({ porcentajeRestante: 0, ventana: "sesion", agotado: true });
    expect(e.renovaEn.getTime()).toBe(hace(4).getTime() + 5 * 3_600_000);
  });

  it("un consumo de hace más de 5 horas no cuenta en la sesión", () => {
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [{ fecha: hace(6), costUsd: 1 }], ahora });
    // Fuera de la sesión, pero dentro de la semana (cap 40 % de 5 USD = 2 USD): 1 − 1/2 = 50 %. El mes daría 80 %.
    expect(e.porcentajeRestante).toBe(50);
    expect(e.ventana).toBe("semana");
  });

  it("la semana tiene 40 % del presupuesto: 2 USD en 6 días la agotan", () => {
    const e = estadoDeUso({
      presupuestoUsd: 5,
      periodo,
      consumos: [{ fecha: hace(6 * 24), costUsd: 1 }, { fecha: hace(5 * 24), costUsd: 1 }],
      ahora,
    });
    expect(e).toMatchObject({ porcentajeRestante: 0, ventana: "semana", agotado: true });
  });

  it("lo gastado antes del inicio del periodo no cuenta", () => {
    const antes = new Date(periodo.inicio.getTime() - 3_600_000);
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [{ fecha: antes, costUsd: 4 }], ahora });
    expect(e.porcentajeRestante).toBe(100);
  });

  it("un presupuesto de cero deja el chat agotado", () => {
    expect(estadoDeUso({ presupuestoUsd: 0, periodo, consumos: [], ahora })).toMatchObject({ porcentajeRestante: 0, agotado: true });
  });

  it("ignora costos no numéricos o cero", () => {
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [{ fecha: hace(1), costUsd: Number.NaN }, { fecha: hace(1), costUsd: 0 }], ahora });
    expect(e.porcentajeRestante).toBe(100);
  });
});

describe("periodoMensualBogota", () => {
  it("el mes va de medianoche en Bogotá a medianoche en Bogotá", () => {
    const p = periodoMensualBogota(new Date("2026-10-31T23:00:00-05:00"));
    expect(p.inicio.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(p.fin.toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });

  it("a las 00:30 del 1 de noviembre en Bogotá ya es noviembre", () => {
    const p = periodoMensualBogota(new Date("2026-11-01T00:30:00-05:00"));
    expect(p.inicio.toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });
});

describe("nivelDeAviso", () => {
  it("avisa al 20 % y al 5 %", () => {
    expect(nivelDeAviso(100)).toBe("ok");
    expect(nivelDeAviso(21)).toBe("ok");
    expect(nivelDeAviso(20)).toBe("poco");
    expect(nivelDeAviso(5)).toBe("casi_agotado");
    expect(nivelDeAviso(0)).toBe("agotado");
  });
});

describe("mensajeDeAgotado", () => {
  it("si se agota la sesión, dice cuándo vuelve el uso, con la hora de Bogotá", () => {
    // Consumo a las 12:00 (Bogotá) de hoy: la sesión se libera a las 17:00 de Bogotá.
    const ahoraB = new Date("2026-10-15T13:00:00-05:00");
    const consumo = new Date("2026-10-15T12:00:00-05:00");
    const e = estadoDeUso({ presupuestoUsd: 5, periodo: periodoMensualBogota(ahoraB), consumos: [{ fecha: consumo, costUsd: 1 }], ahora: ahoraB });
    const m = mensajeDeAgotado(e, ahoraB);
    expect(m).toContain("sesión de 5 horas");
    expect(m).toContain("a las 5:00 p. m.");
  });

  it("si se agota el mes, dice la fecha de renovación", () => {
    const ahoraB = new Date("2026-10-15T13:00:00-05:00");
    const e = estadoDeUso({
      presupuestoUsd: 1,
      periodo: periodoMensualBogota(ahoraB),
      consumos: [{ fecha: new Date("2026-10-02T12:00:00-05:00"), costUsd: 1 }],
      ahora: ahoraB,
    });
    expect(e.ventana).toBe("mes");
    expect(mensajeDeAgotado(e, ahoraB)).toContain("Se renueva el 1 de noviembre");
  });
});

describe("asistente del reglamento (portal de residentes): tope por administrador y por plan", () => {
  const pro = LIMITES_DEL_ASISTENTE_DEL_PORTAL.pro;

  it("sin preguntas, puede preguntar", () => {
    expect(topeDelAsistenteDelPortal({ hoy: 0, mes: 0 }, pro)).toBeNull();
  });

  it("al llegar al tope del día, no puede; el tope del mes también corta", () => {
    expect(topeDelAsistenteDelPortal({ hoy: pro.porDia, mes: 10 }, pro)).toContain("hoy");
    expect(topeDelAsistenteDelPortal({ hoy: 1, mes: pro.porMes }, pro)).toContain("este mes");
  });

  it("el tope sube con el plan: 300 al mes en Pro, 600 en Business y 1.000 en Élite", () => {
    expect([limitesDelAsistenteDelPortal("pro").porMes, limitesDelAsistenteDelPortal("business").porMes, limitesDelAsistenteDelPortal("elite").porMes]).toEqual([300, 600, 1000]);
    // 300 preguntas ya cortan a Pro, pero no a Business.
    expect(topeDelAsistenteDelPortal({ hoy: 1, mes: 300 }, limitesDelAsistenteDelPortal("pro"))).not.toBeNull();
    expect(topeDelAsistenteDelPortal({ hoy: 1, mes: 300 }, limitesDelAsistenteDelPortal("business"))).toBeNull();
  });

  it("las cuentas beta y la fase de pruebas (sin plan) llevan un techo de seguridad, no ninguno", () => {
    expect(limitesDelAsistenteDelPortal(null)).toEqual({ porDia: 120, porMes: 1200 });
    expect(topeDelAsistenteDelPortal({ hoy: 120, mes: 1 }, limitesDelAsistenteDelPortal(null))).not.toBeNull();
  });

  it("el día que cuenta es el de Bogotá: a las 8 p. m. ya es el mismo día, no el siguiente", () => {
    // 10 de octubre, 8 p. m. en Bogotá = 11 de octubre en UTC: el día empieza a las 00:00 de Bogotá (05:00 UTC).
    expect(inicioDelDiaBogota(new Date("2026-10-11T01:00:00Z")).toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });
});

describe("las ventanas móviles no se cortan al cambiar de mes", () => {
  const ahoraB = (iso: string) => new Date(iso);

  it("US$2 el 30 de octubre agotan la semana también el 3 de noviembre (la semana cruza el mes)", () => {
    const ahora3 = ahoraB("2026-11-03T10:00:00-05:00");
    const e = estadoDeUso({
      presupuestoUsd: 5,
      periodo: periodoMensualBogota(ahora3),
      consumos: [{ fecha: ahoraB("2026-10-30T10:00:00-05:00"), costUsd: 2 }],
      ahora: ahora3,
    });
    expect(e).toMatchObject({ porcentajeRestante: 0, ventana: "semana", agotado: true });
    expect(e.renovaEn.toISOString()).toBe(ahoraB("2026-11-06T10:00:00-05:00").toISOString());
  });

  it("US$1 a las 23:30 del 31 de octubre agotan la sesión a las 00:10 del 1 de noviembre", () => {
    const ahora1 = ahoraB("2026-11-01T00:10:00-05:00");
    const e = estadoDeUso({
      presupuestoUsd: 5,
      periodo: periodoMensualBogota(ahora1),
      consumos: [{ fecha: ahoraB("2026-10-31T23:30:00-05:00"), costUsd: 1 }],
      ahora: ahora1,
    });
    expect(e).toMatchObject({ porcentajeRestante: 0, ventana: "sesion", agotado: true });
  });
});

describe("cuándo vuelve el uso (renovaEn)", () => {
  it("con la sesión y la semana agotadas, manda la que tarda más en liberarse", () => {
    // US$1 hace 1 h (agota la sesión) y US$1 hace 3 días (junto con el primero agota la semana).
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [{ fecha: hace(1), costUsd: 1 }, { fecha: hace(72), costUsd: 1 }], ahora });
    expect(e).toMatchObject({ porcentajeRestante: 0, ventana: "semana", agotado: true });
    // La semana vuelve a tener uso cuando sale el consumo de hace 3 días: dentro de 4 días.
    expect(e.renovaEn.getTime()).toBe(hace(72).getTime() + 7 * 24 * 3_600_000);
  });

  it("un gasto pequeño antiguo no adelanta la hora: hay que esperar a que salga el grande", () => {
    // US$0,01 hace 4,9 h y US$1 hace 1 h: el primero sale en 6 min, pero la sesión sigue agotada hasta que salga el segundo.
    const e = estadoDeUso({ presupuestoUsd: 5, periodo, consumos: [{ fecha: hace(4.9), costUsd: 0.01 }, { fecha: hace(1), costUsd: 1 }], ahora });
    expect(e).toMatchObject({ porcentajeRestante: 0, ventana: "sesion", agotado: true });
    expect(e.renovaEn.getTime()).toBe(hace(1).getTime() + 5 * 3_600_000);
  });

  it("el mensaje no termina con doble punto", () => {
    const ahoraB = new Date("2026-10-15T13:00:00-05:00");
    const e = estadoDeUso({ presupuestoUsd: 5, periodo: periodoMensualBogota(ahoraB), consumos: [{ fecha: new Date("2026-10-15T12:00:00-05:00"), costUsd: 1 }], ahora: ahoraB });
    expect(mensajeDeAgotado(e, ahoraB)).not.toMatch(/\.\.$/);
    expect(mensajeDeAgotado(e, ahoraB)).toMatch(/p\. m\.$/);
  });
});

