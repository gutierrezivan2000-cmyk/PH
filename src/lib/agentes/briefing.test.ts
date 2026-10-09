import { describe, expect, it } from "vitest";
import { TOPE_DEL_BRIEFING, construirBriefing, construirResumenDeLasDemas, elegirPropiedadEnFoco, type DatosDePropiedad } from "./briefing";

const AHORA = new Date("2026-10-09T15:00:00Z");

const base = (extra: Partial<DatosDePropiedad> = {}): DatosDePropiedad => ({
  propiedad: { id: "p1", nombre: "Conjunto Los Pinos", direccion: "Cra 7 # 12-34", ciudad: "Bogotá", unidades: 120, caracteristicas: ["ascensor", "piscina"] },
  vencimientos: [],
  reuniones: [],
  generaciones: [],
  documentos: [],
  personas: [],
  memoria: [],
  eventos: [],
  ...extra,
});

describe("elegirPropiedadEnFoco", () => {
  const props = [{ id: "a" }, { id: "b" }];
  it("usa la pedida si es de la cuenta, la única si solo hay una, y ninguna si hay varias sin pedir", () => {
    expect(elegirPropiedadEnFoco(props, "b")).toBe("b");
    expect(elegirPropiedadEnFoco(props, "ajena")).toBeNull();
    expect(elegirPropiedadEnFoco(props)).toBeNull();
    expect(elegirPropiedadEnFoco([{ id: "a" }])).toBe("a");
    expect(elegirPropiedadEnFoco([{ id: "a" }], "ajena")).toBe("a");
    expect(elegirPropiedadEnFoco([], "a")).toBeNull();
  });
});

describe("construirBriefing", () => {
  it("dice la fecha de hoy y los datos básicos de la copropiedad", () => {
    const t = construirBriefing(base(), AHORA);
    expect(t).toContain("Conjunto Los Pinos");
    expect(t).toContain("viernes, 9 de octubre de 2026");
    expect(t).toContain("120 unidades");
    expect(t).toContain("ascensor, piscina");
  });

  it("incluye la cartera con la mora, las edades y los mayores morosos", () => {
    const t = construirBriefing(
      base({
        cartera: {
          unidades: 120, deudaTotal: 18_500_000, enMora: 12_300_000, unidadesEnMora: 9, recaudoDelMes: 41_000_000,
          aging: [{ etiqueta: "1-30 días", unidades: 5, monto: 3_000_000 }, { etiqueta: "90+ días", unidades: 0, monto: 0 }],
          morosos: [{ unidad: "Apto 502", enMora: 2_400_000, dias: 75 }],
        },
      }),
      AHORA,
    );
    expect(t).toContain("## Cartera");
    expect(t).toContain("120 unidades");
    expect(t).toMatch(/vencido sin pagar \$12\.300\.000 en 9 unidades/);
    expect(t).toContain("1-30 días: 5");
    expect(t).not.toContain("90+ días"); // una edad sin unidades no se lista
    expect(t).toContain("Apto 502 $2.400.000 (75 d)");
  });

  it("un módulo que no se pasó (la cuenta no lo puede usar) no aparece, ni siquiera como «cero»", () => {
    const t = construirBriefing(base(), AHORA);
    for (const s of ["## Cartera", "## Presupuesto", "## PQRS", "## Asambleas", "## Certificados", "## Comunicados"]) expect(t).not.toContain(s);
  });

  it("avisa cuando no hay presupuesto del año y cuando el fondo de imprevistos está por debajo", () => {
    expect(construirBriefing(base({ sinPresupuesto: true }), AHORA)).toContain("No hay presupuesto de este año cargado.");
    const t = construirBriefing(
      base({ presupuesto: { anio: 2026, ingresos: { presupuestado: 100, ejecutado: 50 }, gastos: { presupuestado: 80, ejecutado: 90 }, fondo: { saldo: 10, requerido: 50, alDia: false }, desviaciones: [{ concepto: "Aseo", presupuestado: 1_000_000, ejecutado: 1_300_000 }] } }),
      AHORA,
    );
    expect(t).toContain("POR DEBAJO");
    expect(t).toContain("Aseo $1.300.000 vs $1.000.000");
    expect(t).toContain("50 %");
  });

  it("lista las PQRS abiertas marcando las vencidas", () => {
    const t = construirBriefing(base({ pqrs: { abiertas: 2, vencidas: 1, porEstado: { radicado: 1, en_proceso: 1 }, lista: [{ codigo: "PQR-AAA111", asunto: "Ruido", estado: "radicado", dias: 30, vencida: true }, { codigo: "PQR-BBB222", asunto: "Fuga", estado: "en_proceso", dias: 2, vencida: false }] } }), AHORA);
    expect(t).toContain("2 abiertas");
    expect(t).toContain("PQR-AAA111 «Ruido» · radicado · 30 d · VENCIDA");
    expect(t).toContain("1 fuera del plazo");
    expect(t).not.toMatch(/PQR-BBB222.*VENCIDA/);
  });

  it("incluye la memoria y los eventos recientes para que el agente sepa lo que se hizo sin que se lo cuenten", () => {
    const t = construirBriefing(
      base({
        memoria: [{ tipo: "decision", contenido: "El consejo aprobó impermeabilizar la terraza en 2027", fecha: "2026-09-01T10:00:00Z", autor: "nomethes" }],
        eventos: [{ fecha: "2026-10-08T14:00:00Z", modulo: "cartera", resumen: "Pago de $1.250.000 registrado en Apto 502 (transferencia)", actor: "usuario" }, { fecha: "2026-10-07T14:00:00Z", modulo: "pqrs", resumen: "PQR-AAA111 radicada", actor: "residente" }],
      }),
      AHORA,
    );
    expect(t).toContain("[decision] El consejo aprobó impermeabilizar la terraza en 2027");
    expect(t).toContain("Pago de $1.250.000 registrado en Apto 502");
    expect(t).toContain("(residente)");
    expect(t).not.toMatch(/registrado en Apto 502 \(transferencia\) \(usuario\)/); // el actor por defecto no se repite
  });

  it("los vencimientos dicen cuántos días faltan o cuántos lleva vencido", () => {
    const t = construirBriefing(base({ vencimientos: [{ titulo: "Póliza de zonas comunes", fecha: "2026-10-20", dias: 11, categoria: "Póliza" }, { titulo: "Certificación del ascensor", fecha: "2026-10-01", dias: -8, categoria: "Ascensor" }, { titulo: "Asamblea", fecha: "2026-10-09", dias: 0, categoria: "x" }] }), AHORA);
    expect(t).toContain("en 11 d");
    expect(t).toContain("vencido hace 8 d");
    expect(t).toContain("hoy");
  });

  it("tiene tope de tamaño y avisa que se recortó", () => {
    const eventos = Array.from({ length: 400 }, (_, i) => ({ fecha: "2026-10-08T14:00:00Z", modulo: "cartera", resumen: `Evento número ${i} ` + "x".repeat(150), actor: "usuario" }));
    const t = construirBriefing(base({ eventos }), AHORA);
    expect(t.length).toBeLessThanOrEqual(TOPE_DEL_BRIEFING + 120);
    expect(t).toContain("briefing recortado");
  });
});

describe("construirResumenDeLasDemas", () => {
  it("una línea por copropiedad con su id para consultarla", () => {
    const t = construirResumenDeLasDemas([{ id: "p1", nombre: "Los Pinos", ciudad: "Bogotá", unidades: 120, pqrsAbiertas: 3, proximaAsamblea: "2026-11-15T15:00:00Z" }, { id: "p2", nombre: "El Roble" }]);
    expect(t).toContain("Los Pinos (id p1) — Bogotá · 120 unidades · 3 PQRS abiertas · próxima asamblea");
    expect(t).toContain("El Roble (id p2)");
    expect(t).toContain("consultar_operacion");
    expect(construirResumenDeLasDemas([])).toBe("");
  });
});
