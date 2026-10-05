/** El acta en el modo demo: se redacta de verdad con el motor del acta (modelo simulado), con su avance, su error y su Historial. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_USER, createGeneration, getFileBuffers, getGenerationById, getGenerations, getProperties, reiniciarDemoGeneraciones, updateGeneration,
} from "@/lib/demo-store";
import { avanceDeActaDemo, demoActa, demoIniciarActa, REUNION_DEMO_QUE_FALLA, reiniciarDemoActas } from "./demo-acta";
import { reiniciarDemoReuniones } from "./demo";

const SEPTIEMBRE = "reunion-demo-001";
const AGOSTO = REUNION_DEMO_QUE_FALLA;
const U = DEMO_USER.id;

let ahora = 0;
beforeEach(() => {
  vi.useFakeTimers();
  ahora = new Date("2026-10-05T15:00:00Z").getTime();
  vi.setSystemTime(ahora);
  reiniciarDemoReuniones();
  reiniciarDemoActas();
  reiniciarDemoGeneraciones();
});
afterEach(() => vi.useRealTimers());
const pasar = (ms: number) => {
  ahora += ms;
  vi.setSystemTime(ahora);
};

const iniciar = (id = SEPTIEMBRE, opciones: { reanudar?: string } = {}) => demoIniciarActa(U, id, opciones);
const valor = (r: ReturnType<typeof demoIniciarActa>) => {
  if (!r.ok) throw new Error(`${r.codigo}: ${r.error}`);
  return r.valor;
};

describe("avanceDeActaDemo", () => {
  it("empieza en 0, calentar vale 5 %, las secciones 85 % y armar el 10 % final; nunca baja", () => {
    expect(avanceDeActaDemo(0, 5)).toEqual({ progreso: 0, hechas: 0 });
    expect(avanceDeActaDemo(1_500, 5)).toEqual({ progreso: 5, hechas: 0 });
    expect(avanceDeActaDemo(1_500 + 1_800, 5)).toEqual({ progreso: Math.round(5 + 85 / 5), hechas: 1 });
    expect(avanceDeActaDemo(1_500 + 5 * 1_800, 5)).toEqual({ progreso: 90, hechas: 5 });
    expect(avanceDeActaDemo(1_500 + 5 * 1_800 + 1_500, 5)).toEqual({ progreso: 100, hechas: 5 });
    expect(avanceDeActaDemo(1_000_000, 5)).toEqual({ progreso: 100, hechas: 5 });
    let antes = -1;
    for (let t = 0; t <= 14_000; t += 250) {
      const { progreso } = avanceDeActaDemo(t, 5);
      expect(progreso).toBeGreaterThanOrEqual(antes);
      antes = progreso;
    }
  });
  it("sin secciones (no debería pasar) no se rompe", () => {
    expect(avanceDeActaDemo(5_000, 0).progreso).toBeGreaterThanOrEqual(0);
  });
});

describe("pedir el acta de una reunión de ejemplo", () => {
  it("antes de pedirla no hay acta; al pedirla empieza en «preparando» y queda en el Historial como una generación del acta", () => {
    expect(demoActa(U, SEPTIEMBRE)).toEqual({ acta: null, texto: null });
    const { acta, yaEnCurso } = valor(iniciar());
    expect(yaEnCurso).toBe(false);
    expect(acta).toMatchObject({ estado: "procesando", progreso: 0, etapa: "preparando", error: null, archivos: null, pendientes: [], requisitos: null });
    const generacion = getGenerationById(acta.id, U)!;
    expect(generacion).toMatchObject({
      type: "acta", status: "processing", meetingId: SEPTIEMBRE, month: 9, inputText: "Desde la reunión «Reunión de consejo — septiembre»", outputFiles: null,
      propertyId: "prop-demo-001",
    });
    expect(getGenerations(U).map((g) => g.id)).toContain(acta.id);
  });

  it("avanza con el tiempo: redacta sección por sección y arma el acta", () => {
    const { acta } = valor(iniciar());
    pasar(3_400);
    expect(demoActa(U, SEPTIEMBRE)!.acta).toMatchObject({ estado: "procesando", etapa: "redactando", secciones: { hechas: 1, total: 5 } });
    pasar(5_400);
    const casi = demoActa(U, SEPTIEMBRE)!.acta!;
    expect(casi.progreso).toBeGreaterThan(50);
    expect(casi.progreso).toBeLessThan(100);
    pasar(2_300);
    expect(demoActa(U, SEPTIEMBRE)!.acta).toMatchObject({ estado: "procesando", etapa: "armando" });
    pasar(2_000);
    expect(demoActa(U, SEPTIEMBRE)!.acta).toMatchObject({ id: acta.id, estado: "lista", progreso: 100, etapa: null, secciones: null });
  });

  it("al terminar es un acta de verdad: encabezado, asistentes, desarrollo con minutos, decisiones, votaciones, compromisos, cierre y firmas", () => {
    const { acta } = valor(iniciar());
    pasar(30_000);
    const r = demoActa(U, SEPTIEMBRE, { conTexto: true })!;
    expect(r.acta).toMatchObject({ id: acta.id, estado: "lista", archivos: { html: `/api/download/${acta.id}/acta`, markdown: `/api/download/${acta.id}/acta-markdown` } });
    const texto = r.texto!;
    expect(texto).toContain("## ACTA No. [PENDIENTE DE COMPLETAR] — CONSEJO DE ADMINISTRACIÓN");
    expect(texto).toContain("**Copropiedad:** Conjunto Residencial Los Pinos");
    expect(texto).toContain("- Martha López — Presidente del consejo");
    expect(texto).toContain("**3.3 Mantenimiento de los ascensores**");
    expect(texto).toMatch(/\[\[t=\d{2}:\d{2}:\d{2}\]\]/);
    expect(texto).toContain("| N.º | Compromiso | Responsable | Fecha | Minuto |");
    expect(texto).toContain("FIRMAS");
    // Cada decisión y compromiso de la ficha quedó recogido en el texto.
    for (const id of ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "C5", "C6"]) expect(texto, id).toContain(`[[${id}]]`);
    expect(r.acta!.pendientes.some((p) => /no quedó desarrollad/.test(p))).toBe(false);
    expect(r.acta!.pendientes).toContain("No se mencionó el lugar de la reunión.");
    // La revisión de requisitos: lo que falta por completar queda marcado.
    expect(r.acta!.requisitos).toHaveLength(10);
    expect(r.acta!.requisitos!.find((x) => x.item === "Fecha, hora y lugar de la reunión")).toMatchObject({ status: "pendiente" });
    expect(r.acta!.requisitos!.find((x) => x.item === "Tipo de reunión")).toMatchObject({ status: "completo" });
  });

  it("sin pedir el texto no lo manda; y solo lo manda cuando el acta está lista", () => {
    valor(iniciar());
    expect(demoActa(U, SEPTIEMBRE, { conTexto: true })!.texto).toBeNull();
    pasar(30_000);
    expect(demoActa(U, SEPTIEMBRE)!.texto).toBeNull();
    expect(demoActa(U, SEPTIEMBRE, { conTexto: true })!.texto).toContain("## ACTA No.");
  });

  it("al terminar, el Historial la muestra lista con sus documentos, y se pueden abrir y descargar", () => {
    const { acta } = valor(iniciar());
    pasar(30_000);
    demoActa(U, SEPTIEMBRE);
    const g = getGenerationById(acta.id, U)!;
    expect(g).toMatchObject({ status: "completed", errorMessage: null });
    expect(g.completedAt).toBeInstanceOf(Date);
    expect(g.outputFiles).toMatchObject({ actaHtml: `/api/demo/files/${acta.id}/acta`, actaMarkdown: `/api/demo/files/${acta.id}/acta-markdown` });
    const archivos = getFileBuffers(acta.id)!;
    expect(archivos.actaHtml).toContain("<!DOCTYPE html>");
    expect(archivos.actaHtml).toContain("ACTA No.");
    expect(archivos.actaHtml).not.toContain("[[");
    expect(archivos.actaMarkdown).toContain("## ACTA No. [PENDIENTE DE COMPLETAR]");
    expect(archivos.actaMarkdown).not.toContain("[[");
    expect(g.tokensUsed).toBeGreaterThan(0);
  });

  it("pedirla otra vez mientras se redacta devuelve la misma y no crea otra", () => {
    const a = valor(iniciar());
    pasar(2_000);
    const b = valor(iniciar());
    expect(b).toMatchObject({ yaEnCurso: true });
    expect(b.acta.id).toBe(a.acta.id);
    expect(getGenerations(U).filter((g) => g.type === "acta")).toHaveLength(1);
  });

  it("ya terminada, se puede pedir otra (otra generación): la más reciente es la que se ve", () => {
    const a = valor(iniciar());
    pasar(30_000);
    const b = valor(iniciar());
    expect(b.yaEnCurso).toBe(false);
    expect(b.acta.id).not.toBe(a.acta.id);
    expect(demoActa(U, SEPTIEMBRE)!.acta!.id).toBe(b.acta.id);
    expect(getGenerations(U).filter((g) => g.type === "acta")).toHaveLength(2);
  });

  it("si la ficha no trae a los asistentes (la reunión de agosto), salen de las voces con nombre confirmado", () => {
    const { acta } = valor(iniciar(AGOSTO));
    pasar(6_000);
    valor(iniciar(AGOSTO, { reanudar: acta.id })); // esa reunión falla la primera vez: se retoma
    pasar(30_000);
    const texto = demoActa(U, AGOSTO, { conTexto: true })!.texto!;
    expect(texto).toContain("- Martha López — Presidente del consejo");
    expect(texto).toContain("- Hernán Sierra — Revisor fiscal");
    expect(texto).not.toContain("Listar asistentes");
  });
});

describe("lo que no se puede pedir", () => {
  it("una reunión que no existe, de otra persona o sin terminar", () => {
    expect(demoIniciarActa(U, "no-existe")).toMatchObject({ ok: false, codigo: "no_existe" });
    expect(demoIniciarActa("otro-usuario", SEPTIEMBRE)).toMatchObject({ ok: false, codigo: "no_existe" });
    expect(demoActa("otro-usuario", SEPTIEMBRE)).toBeNull();
    expect(demoActa(U, "no-existe")).toBeNull();
    for (const [id, quien] of [["reunion-demo-002", "procesando"], ["reunion-demo-003", "borrador"], ["reunion-demo-004", "error"], ["reunion-demo-005", "sin cupo"]]) {
      expect(demoIniciarActa(U, id), quien).toMatchObject({ ok: false, codigo: "no_lista", error: "Esta reunión todavía se está procesando." });
    }
    expect(getGenerations(U).filter((g) => g.type === "acta")).toHaveLength(0);
  });
});

describe("la reunión de ejemplo cuyo acta falla la primera vez (para ver el error y «Intentar de nuevo»)", () => {
  it("se detiene en una sección, con el mensaje de la cola, en 0 % y con la generación en «failed»", () => {
    const { acta } = valor(iniciar(AGOSTO));
    pasar(6_000);
    const r = demoActa(U, AGOSTO)!.acta!;
    expect(r).toMatchObject({ id: acta.id, estado: "error", progreso: 0, etapa: null, archivos: null });
    expect(r.error).toBe("No pudimos redactar la sección «Informe de cartera y recaudo» del acta después de 3 intentos. Reintenta: solo se vuelve a procesar ese paso.");
    expect(getGenerationById(acta.id, U)).toMatchObject({ status: "failed", errorMessage: r.error });
  });

  it("«Intentar de nuevo» retoma desde donde se quedó (lo hecho se conserva), sin volver a fallar, y termina", () => {
    const { acta } = valor(iniciar(AGOSTO));
    pasar(6_000);
    expect(demoActa(U, AGOSTO)!.acta!.estado).toBe("error");
    const r = valor(iniciar(AGOSTO, { reanudar: acta.id }));
    expect(r.acta).toMatchObject({ id: acta.id, estado: "procesando", error: null });
    // Conserva lo hecho: no vuelve a cero.
    expect(r.acta.progreso).toBeGreaterThan(5);
    expect(r.acta.secciones!.hechas).toBeGreaterThanOrEqual(1);
    expect(getGenerationById(acta.id, U)).toMatchObject({ status: "processing", errorMessage: null });
    pasar(30_000);
    expect(demoActa(U, AGOSTO)!.acta).toMatchObject({ id: acta.id, estado: "lista", progreso: 100 });
    expect(getGenerationById(acta.id, U)!.status).toBe("completed");
    expect(getGenerations(U).filter((g) => g.type === "acta")).toHaveLength(1);
  });

  it("solo falla la primera vez: la siguiente acta de esa reunión sale bien", () => {
    valor(iniciar(AGOSTO));
    pasar(6_000);
    demoActa(U, AGOSTO);
    const otra = valor(iniciar(AGOSTO));
    expect(otra.yaEnCurso).toBe(false);
    pasar(30_000);
    expect(demoActa(U, AGOSTO)!.acta!.estado).toBe("lista");
  });

  it("solo se retoma un acta con error", () => {
    const { acta } = valor(iniciar(SEPTIEMBRE));
    expect(demoIniciarActa(U, SEPTIEMBRE, { reanudar: acta.id })).toMatchObject({ ok: false, codigo: "no_en_error" }); // en curso
    pasar(30_000);
    expect(demoIniciarActa(U, SEPTIEMBRE, { reanudar: acta.id })).toMatchObject({ ok: false, codigo: "no_en_error" }); // lista
    expect(demoIniciarActa(U, SEPTIEMBRE, { reanudar: "otra" })).toMatchObject({ ok: false, codigo: "no_en_error" });
  });
});

describe("el cupo del plan (demo: 3 generaciones por día)", () => {
  it("con el cupo gastado no se pide otra acta (y tampoco se retoma una con error)", () => {
    const prop = getProperties(U)[0];
    for (let i = 0; i < 3; i++) {
      const g = createGeneration({ userId: U, propertyId: prop.id, type: "informe", status: "processing", month: 10, year: 2026, inputFiles: [], inputText: null, outputFiles: null, tokensUsed: 0, costUsd: 0, errorMessage: null, property: prop });
      updateGeneration(g.id, { status: "completed" });
    }
    expect(demoIniciarActa(U, SEPTIEMBRE)).toMatchObject({ ok: false, codigo: "sin_cupo", error: "Has alcanzado el límite diario de 3 generaciones." });
    expect(getGenerations(U).filter((g) => g.type === "acta")).toHaveLength(0);
  });
});
