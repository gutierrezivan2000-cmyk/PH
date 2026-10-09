import { describe, expect, it } from "vitest";
import { MODULO_DE_ACCION, TIPOS_DE_ACCION, aMonto, fechaIso, validarAccion } from "./acciones";
import { moduloPermitido } from "./acciones-ejecutar";
import { agentePausadoAbierto } from "./acceso";
import { filaDeEvento, limpiarResumen, TOPE_DEL_RESUMEN } from "./eventos";
import { fragmentosRelevantes, validarNota } from "./consultas";
import { HERRAMIENTAS_OPERACION } from "./herramientas";
import type { Visibles } from "./briefing-datos";

const HOY = "2026-10-09";
const todos = (v: boolean): Visibles => ({ cartera: v, presupuesto: v, certificados: v, asambleas: v, comunicados: v, pqrs: v });

describe("validación de acciones", () => {
  it("un pago válido se normaliza y se describe para la persona", () => {
    const a = validarAccion("registrar_pago", { unidad: "  Apto  502 ", monto: "1.250.000", metodo: "transferencia", referencia: "TR-889" }, HOY);
    expect(a).toMatchObject({ ok: true, tipo: "registrar_pago", datos: { unidad: "Apto 502", monto: 1_250_000, metodo: "transferencia", fecha: HOY, referencia: "TR-889" } });
    expect(a.ok && a.resumen).toContain("$1.250.000");
    expect(a.ok && a.resumen).toContain("Apto 502");
  });
  it("rechaza pagos con monto cero, negativo, absurdo o método inventado, y fechas que no existen", () => {
    for (const monto of [0, -5, "abc", 5_000_000_000]) expect(validarAccion("registrar_pago", { unidad: "A1", monto }, HOY).ok, String(monto)).toBe(false);
    expect(validarAccion("registrar_pago", { unidad: "A1", monto: 10, metodo: "cripto" }, HOY).ok).toBe(false);
    expect(validarAccion("registrar_pago", { unidad: "A1", monto: 10, fecha: "2026-02-31" }, HOY).ok).toBe(false);
    expect(validarAccion("registrar_pago", { monto: 10 }, HOY).ok).toBe(false);
  });
  it("aMonto entiende cómo se escribe un monto en Colombia y rechaza lo ambiguo o inválido", () => {
    expect(aMonto(1250000)).toBe(1_250_000);
    expect(aMonto("1250000")).toBe(1_250_000);
    expect(aMonto("1.250.000")).toBe(1_250_000);
    expect(aMonto("$ 1.250.000,50")).toBe(1_250_001);
    expect(aMonto("85000")).toBe(85_000);
    expect(aMonto("12abc")).toBeNull();
    expect(aMonto("")).toBeNull();
    expect(aMonto(null)).toBeNull();
    expect(aMonto(0)).toBeNull();
    expect(aMonto(2_000_000_000)).toBeNull();
  });
  it("fechaIso usa hoy si falta y exige calendario real", () => {
    expect(fechaIso(undefined, HOY)).toBe(HOY);
    expect(fechaIso("2026-12-31", HOY)).toBe("2026-12-31");
    expect(fechaIso("2026-13-01", HOY)).toBeNull();
    expect(fechaIso(20261231, HOY)).toBeNull();
  });
  it("el movimiento del presupuesto exige tipo válido y concepto", () => {
    expect(validarAccion("registrar_movimiento_presupuesto", { concepto: "Aseo de octubre", tipo: "gasto", monto: 850_000, rubro: "Aseo" }, HOY)).toMatchObject({ ok: true, datos: { tipo: "gasto", monto: 850_000, rubro: "Aseo" } });
    expect(validarAccion("registrar_movimiento_presupuesto", { concepto: "x", tipo: "gasto", monto: 1 }, HOY).ok).toBe(false);
    expect(validarAccion("registrar_movimiento_presupuesto", { concepto: "Aseo", tipo: "regalo", monto: 1 }, HOY).ok).toBe(false);
  });
  it("la respuesta a una PQRS pide un código bien formado y un estado válido; el código se normaliza a mayúsculas", () => {
    expect(validarAccion("responder_pqrs", { codigo: "pqr-ab12cd", respuesta: "Ya revisamos y programamos la reparación.", estado: "resuelto" }, HOY)).toMatchObject({ ok: true, datos: { codigo: "PQR-AB12CD", estado: "resuelto" } });
    expect(validarAccion("responder_pqrs", { codigo: "123", respuesta: "Respuesta suficiente" }, HOY).ok).toBe(false);
    expect(validarAccion("responder_pqrs", { codigo: "PQR-AB12CD", respuesta: "corta" }, HOY).ok).toBe(false);
    expect(validarAccion("responder_pqrs", { codigo: "PQR-AB12CD", respuesta: "Respuesta suficiente", estado: "borrada" }, HOY).ok).toBe(false);
  });
  it("la bitácora pide nombre, tipo y fecha; la recurrencia, entre 1 y 60 meses", () => {
    expect(validarAccion("agregar_a_bitacora", { nombre: "Póliza todo riesgo", tipo: "poliza", fecha: "2027-03-01", recurrenciaMeses: 12 }, HOY).ok).toBe(true);
    expect(validarAccion("agregar_a_bitacora", { nombre: "Póliza todo riesgo", tipo: "poliza" }, HOY).ok).toBe(false);
    expect(validarAccion("agregar_a_bitacora", { nombre: "Ascensor", tipo: "zona_comun", fecha: "2027-03-01", recurrenciaMeses: 100 }, HOY).ok).toBe(false);
  });
  it("una acción que no existe se rechaza diciendo cuáles hay", () => {
    const a = validarAccion("borrar_todo", {}, HOY);
    expect(a.ok).toBe(false);
    expect(!a.ok && a.error).toContain("registrar_pago");
  });
  it("cada acción del catálogo tiene su módulo definido y sus datos se validan", () => {
    for (const t of TIPOS_DE_ACCION) expect(t in MODULO_DE_ACCION, t).toBe(true);
    expect(validarAccion("registrar_pago", "no es un objeto", HOY).ok).toBe(false);
    expect(validarAccion("registrar_pago", null, HOY).ok).toBe(false);
  });
});

describe("módulos en piloto y acciones", () => {
  it("una acción de un módulo que la cuenta no puede usar no se permite; la bitácora sí", () => {
    expect(moduloPermitido("registrar_pago", todos(false))).toBe(false);
    expect(moduloPermitido("registrar_pago", todos(true))).toBe(true);
    expect(moduloPermitido("agregar_a_bitacora", todos(false))).toBe(true);
    expect(moduloPermitido("responder_pqrs", { ...todos(false), pqrs: true })).toBe(true);
  });
  it("los agentes pausados se abren con el módulo que les corresponde", () => {
    expect(agentePausadoAbierto("metra", { ...todos(false), cartera: true })).toBe(true);
    expect(agentePausadoAbierto("metra", { ...todos(false), pqrs: true })).toBe(false);
    expect(agentePausadoAbierto("hermes", { ...todos(false), comunicados: true })).toBe(true);
    expect(agentePausadoAbierto("nomethes", todos(false))).toBe(false);
    expect(agentePausadoAbierto("themis", todos(true))).toBe(false); // Themis no es un agente pausado
  });
});

describe("eventos", () => {
  it("el resumen es una línea con tope", () => {
    expect(limpiarResumen("  Pago \n de   $1.000  ")).toBe("Pago de $1.000");
    expect(limpiarResumen("x".repeat(500)).length).toBe(TOPE_DEL_RESUMEN);
  });
  it("la fila lleva el módulo, el actor por defecto y topes", () => {
    expect(filaDeEvento({ userId: "u", propertyId: "p", modulo: "cartera", accion: "pago_registrado", resumen: "Pago" })).toMatchObject({ module: "cartera", actor: "usuario", refType: null });
    expect(filaDeEvento({ userId: "u", propertyId: "p", modulo: "pqrs", accion: "a".repeat(100), resumen: "x", actor: "residente" })).toMatchObject({ actor: "residente" });
    expect(filaDeEvento({ userId: "u", propertyId: "p", modulo: "pqrs", accion: "a".repeat(100), resumen: "x" }).action.length).toBe(60);
  });
});

describe("memoria", () => {
  it("una nota válida se limpia; muy corta, muy larga o con tipo raro se rechaza", () => {
    expect(validarNota({ contenido: "  El consejo   aprobó impermeabilizar en 2027 ", tipo: "decision" })).toEqual({ ok: true, tipo: "decision", contenido: "El consejo aprobó impermeabilizar en 2027" });
    expect(validarNota({ contenido: "corta" }).ok).toBe(false);
    expect(validarNota({ contenido: "x".repeat(601) }).ok).toBe(false);
    expect(validarNota({ contenido: "Una nota suficientemente larga", tipo: "secreto" }).ok).toBe(false);
    expect(validarNota({ contenido: "Una nota suficientemente larga" })).toMatchObject({ ok: true, tipo: "nota" });
  });
});

describe("fragmentosRelevantes", () => {
  const reglamento = ["Artículo 10. Las mascotas deben ir con correa en las zonas comunes.", "Artículo 11. El horario de la piscina es de 8 a 20 horas.", "Artículo 12. Las obras en los apartamentos solo se hacen de lunes a sábado en horario diurno."].join("\n\n");
  it("devuelve los párrafos que comparten palabras con la consulta, en su orden original", () => {
    const t = fragmentosRelevantes(reglamento, "¿Puedo tener mascotas en la piscina?");
    expect(t).toContain("mascotas");
    expect(t).toContain("piscina");
    expect(t).not.toContain("obras");
    expect(t.indexOf("mascotas")).toBeLessThan(t.indexOf("piscina"));
  });
  it("respeta el tope y, sin palabras útiles, devuelve el comienzo", () => {
    expect(fragmentosRelevantes(reglamento, "de la", 60).length).toBeLessThanOrEqual(60);
    expect(fragmentosRelevantes("a".repeat(100), "xyz", 50).length).toBeLessThanOrEqual(50);
  });
});

describe("herramientas de operación", () => {
  it("definen las tres herramientas con su esquema; la de acciones lista todas las del catálogo", () => {
    expect(HERRAMIENTAS_OPERACION.map((h) => h.name)).toEqual(["consultar_operacion", "guardar_en_memoria", "proponer_accion"]);
    const propuesta = HERRAMIENTAS_OPERACION.find((h) => h.name === "proponer_accion")!;
    expect((propuesta.input_schema as { properties: { tipo: { enum: string[] } } }).properties.tipo.enum).toEqual([...TIPOS_DE_ACCION]);
    for (const h of HERRAMIENTAS_OPERACION) expect(h.description?.length ?? 0).toBeGreaterThan(40);
  });
});
