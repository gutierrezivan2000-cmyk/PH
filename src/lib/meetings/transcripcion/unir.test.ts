import { describe, expect, it } from "vitest";
import { rangoDeBytes } from "../audio";
import { elegirVoces } from "./hablantes";
import { audioSintetico, crearProveedorSintetico, generarGuion, personaDeAudio, type Intervencion } from "./sintetico";
import type { ReferenciaElegida, Segmento } from "./tipos";
import { aAbsolutos, planificarTramos } from "./tramos";
import {
  UMBRAL_SILENCIO_MS, calcularCobertura, detectarSilencios, eliminarRepetidosDeBorde, formatearTranscripcion, fusionarContiguos, unirTramos,
  type TramoParaUnir,
} from "./unir";

const S = 1000;
const MIN = 60_000;
const seg = (hablante: string, inicioMs: number, finMs: number, texto = "dijo algo"): Segmento => ({ inicioMs, finMs, hablante, texto });

describe("calcularCobertura", () => {
  const nucleos = planificarTramos(25 * MIN).map((t) => ({ desdeMs: t.nucleoDesdeMs, hastaMs: t.nucleoHastaMs }));

  it("con todos los núcleos hechos da exactamente 1", () => {
    expect(calcularCobertura(nucleos, 25 * MIN)).toBe(1);
  });

  it("si falta un tramo, es la parte que sí se hizo", () => {
    expect(calcularCobertura([nucleos[0], nucleos[2]], 25 * MIN)).toBeCloseTo(15 / 25, 10);
    expect(calcularCobertura([], 25 * MIN)).toBe(0);
  });

  it("no cuenta dos veces lo que se solapa ni lo que se sale de la reunión", () => {
    expect(calcularCobertura([{ desdeMs: 0, hastaMs: 20 * MIN }, { desdeMs: 10 * MIN, hastaMs: 40 * MIN }], 25 * MIN)).toBe(1);
    expect(calcularCobertura([{ desdeMs: 0, hastaMs: 10 * MIN }, { desdeMs: 5 * MIN, hastaMs: 10 * MIN }], 20 * MIN)).toBe(0.5);
  });

  it("sin duración no hay cobertura", () => {
    expect(calcularCobertura(nucleos, 0)).toBe(0);
  });
});

describe("detectarSilencios", () => {
  it("marca los huecos de 2 min o más, incluidos el del principio y el del final", () => {
    const s = detectarSilencios([seg("V1", 150 * S, 160 * S), seg("V2", 170 * S, 180 * S), seg("V1", 700 * S, 710 * S)], 1_000 * S);
    expect(s).toEqual([
      { desdeMs: 0, hastaMs: 150 * S },
      { desdeMs: 180 * S, hastaMs: 700 * S },
      { desdeMs: 710 * S, hastaMs: 1_000 * S },
    ]);
  });

  it("una pausa corta no es un silencio", () => {
    expect(detectarSilencios([seg("V1", 5 * S, 60 * S), seg("V2", 170 * S - 1, 200 * S)], 200 * S + 100)).toEqual([]);
    expect(UMBRAL_SILENCIO_MS).toBe(120_000);
  });

  it("si dos voces se pisan, el hueco cuenta desde el final más lejano", () => {
    const s = detectarSilencios([seg("V1", 0, 500 * S), seg("V2", 10 * S, 20 * S), seg("V1", 700 * S, 710 * S)], 710 * S);
    expect(s).toEqual([{ desdeMs: 500 * S, hastaMs: 700 * S }]);
  });

  it("una grabación entera sin voz es un solo silencio", () => {
    expect(detectarSilencios([], 10 * MIN)).toEqual([{ desdeMs: 0, hastaMs: 10 * MIN }]);
    expect(detectarSilencios([], 30 * S)).toEqual([]);
  });
});

describe("fusionarContiguos", () => {
  it("junta las intervenciones seguidas de la misma voz con menos de 1 s de hueco", () => {
    const r = fusionarContiguos([seg("V1", 0, 4 * S, "Primero."), seg("V1", 4_500, 8 * S, "Segundo."), seg("V1", 8_900, 12 * S, "Tercero.")]);
    expect(r).toEqual([{ inicioMs: 0, finMs: 12 * S, hablante: "V1", texto: "Primero. Segundo. Tercero." }]);
  });

  it("no junta si el hueco es de 1 s o más, ni si habla otra voz en medio", () => {
    expect(fusionarContiguos([seg("V1", 0, 4 * S), seg("V1", 5 * S, 8 * S)])).toHaveLength(2);
    expect(fusionarContiguos([seg("V1", 0, 4 * S), seg("V2", 4 * S, 6 * S), seg("V1", 6 * S, 9 * S)])).toHaveLength(3);
  });

  it("no hace intervenciones de un minuto o más", () => {
    const seguidas = Array.from({ length: 8 }, (_, k) => seg("V1", k * 10 * S, (k + 1) * 10 * S, `parte ${k}`));
    const r = fusionarContiguos(seguidas);
    expect(r.length).toBeGreaterThan(1);
    expect(r.every((x) => x.finMs - x.inicioMs < 60 * S)).toBe(true);
    expect(r.map((x) => x.texto).join(" ")).toBe(seguidas.map((x) => x.texto).join(" "));
  });

  it("ordena por tiempo y no toca la entrada", () => {
    const entrada = [seg("V2", 10 * S, 12 * S, "dos"), seg("V1", 0, 2 * S, "uno")];
    const copia = structuredClone(entrada);
    expect(fusionarContiguos(entrada).map((x) => x.texto)).toEqual(["uno", "dos"]);
    expect(entrada).toEqual(copia);
  });
});

describe("eliminarRepetidosDeBorde", () => {
  const cuenta = (r: Segmento[]) => r.map((s) => s.texto);

  it("quita el texto que el tramo siguiente repite entero dentro de una intervención más larga del anterior", () => {
    const r = eliminarRepetidosDeBorde([
      { i: 0, segmentos: [seg("V1", 595 * S, 620 * S, "alfa beta gamma delta epsilon zeta eta theta")] },
      { i: 1, segmentos: [seg("V1", 600 * S, 610 * S, "gamma delta epsilon zeta")] },
    ]);
    expect(cuenta(r)).toEqual(["alfa beta gamma delta epsilon zeta eta theta"]);
  });

  it("si lo contenido es lo del tramo anterior, se queda la versión completa del siguiente", () => {
    const r = eliminarRepetidosDeBorde([
      { i: 0, segmentos: [seg("V1", 595 * S, 602 * S, "alfa beta gamma")] },
      { i: 1, segmentos: [seg("V1", 595 * S, 620 * S, "alfa beta gamma delta epsilon zeta eta theta iota kappa")] },
    ]);
    expect(cuenta(r)).toEqual(["alfa beta gamma delta epsilon zeta eta theta iota kappa"]);
  });

  it("no toca a dos personas que hablan a la vez y dicen cosas distintas", () => {
    const r = eliminarRepetidosDeBorde([
      { i: 0, segmentos: [seg("V1", 595 * S, 605 * S, "estoy de acuerdo con la propuesta del consejo")] },
      { i: 1, segmentos: [seg("V2", 598 * S, 606 * S, "yo creo que todavía falta una cotización")] },
    ]);
    expect(r).toHaveLength(2);
  });

  it("no toca la misma frase dicha en otro momento (sin coincidir en el tiempo)", () => {
    const r = eliminarRepetidosDeBorde([
      { i: 0, segmentos: [seg("V1", 100 * S, 104 * S, "sí estoy de acuerdo con eso")] },
      { i: 1, segmentos: [seg("V1", 700 * S, 704 * S, "sí estoy de acuerdo con eso")] },
    ]);
    expect(r).toHaveLength(2);
  });

  it("no decide por frases de menos de tres palabras distintas", () => {
    const r = eliminarRepetidosDeBorde([
      { i: 0, segmentos: [seg("V1", 598 * S, 600 * S, "Sí, sí.")] },
      { i: 1, segmentos: [seg("V2", 598 * S, 600 * S, "Sí, sí.")] },
    ]);
    expect(r).toHaveLength(2);
  });

  it("ignora tildes, mayúsculas y signos al comparar", () => {
    const r = eliminarRepetidosDeBorde([
      { i: 0, segmentos: [seg("V1", 595 * S, 620 * S, "El Administrador presentó: la cotización, ¿sí?")] },
      { i: 1, segmentos: [seg("V1", 600 * S, 610 * S, "el administrador presento la cotizacion")] },
    ]);
    expect(r).toHaveLength(1);
  });
});

describe("formatearTranscripcion", () => {
  it("una línea por intervención: [hh:mm:ss] etiqueta (nombre): texto", () => {
    const t = formatearTranscripcion(
      [
        { inicioMs: 5_025_000, hablante: "V1", texto: "Buenas noches." },
        { inicioMs: 5_100_000, hablante: "H5", texto: "Gracias." },
      ],
      { V1: "Martha López" },
    );
    expect(t).toBe("[01:23:45] V1 (Martha López): Buenas noches.\n[01:25:00] H5: Gracias.");
  });

  it("las horas siempre llevan horas y los saltos de línea del texto no rompen el formato", () => {
    expect(formatearTranscripcion([{ inicioMs: 5_000, hablante: "V2", texto: "Una\nlínea  partida" }], { V2: "  Jorge\nPardo " })).toBe(
      "[00:00:05] V2 (Jorge Pardo): Una línea partida",
    );
  });

  it("intercala los silencios largos donde empiezan", () => {
    const t = formatearTranscripcion(
      [{ inicioMs: 10 * S, hablante: "V1", texto: "antes" }, { inicioMs: 2_461 * S, hablante: "V1", texto: "después" }],
      {},
      [{ desdeMs: 1_820 * S, hastaMs: 2_460 * S }],
    );
    expect(t.split("\n")).toEqual(["[00:00:10] V1: antes", "[00:30:20] (Sin voz hasta 00:41:00)", "[00:41:01] V1: después"]);
  });

  it("sin intervenciones da un texto vacío", () => {
    expect(formatearTranscripcion([])).toBe("");
  });
});

/* ════════════════════════════════════════════════════════════════════
   Unir tramos
   ════════════════════════════════════════════════════════════════════ */

describe("unirTramos con tramos hechos a mano", () => {
  const D = 25 * MIN;
  const [t0, t1, t2] = planificarTramos(D);
  const rel = (t: { desdeMs: number }, s: Segmento): Segmento => ({ ...s, inicioMs: s.inicioMs - t.desdeMs, finMs: s.finMs - t.desdeMs });

  it("una frase que cruza el borde sale una sola vez y completa, aunque los dos tramos la oigan", () => {
    const frase = "alfa beta gamma delta epsilon zeta eta theta iota kappa";
    const tramos: TramoParaUnir[] = [
      { tramo: t0, segmentos: [rel(t0, seg("A", 595 * S, 620 * S, frase))] }, // punto medio 10:07,5: no es de este tramo
      { tramo: t1, segmentos: [rel(t1, seg("A", 595 * S, 620 * S, frase))] },
      { tramo: t2, segmentos: [] },
    ];
    expect(unirTramos(tramos, D, []).segmentos.map((s) => s.texto)).toEqual([frase]);
  });

  it("una frase que el audio de un tramo corta por el final no queda a medias: la deja completa el tramo siguiente", () => {
    // El audio del tramo 0 termina en 10:30; la frase va de 10:25 a 10:50, así que ese tramo solo oye el principio.
    const tramos: TramoParaUnir[] = [
      { tramo: t0, segmentos: [rel(t0, seg("A", 625 * S, 630 * S, "alfa beta"))] },
      { tramo: t1, segmentos: [rel(t1, seg("A", 625 * S, 650 * S, "alfa beta gamma delta epsilon zeta eta theta"))] },
      { tramo: t2, segmentos: [] },
    ];
    expect(unirTramos(tramos, D, []).segmentos.map((s) => s.texto)).toEqual(["alfa beta gamma delta epsilon zeta eta theta"]);
  });

  it("cuando cada tramo parte la frase de otra manera, el texto no queda repetido", () => {
    const completa = "alfa beta gamma delta epsilon zeta eta theta iota kappa";
    const tramos: TramoParaUnir[] = [
      {
        tramo: t0,
        segmentos: [
          rel(t0, seg("A", 595 * S, 602 * S, "alfa beta gamma")),
          rel(t0, seg("A", 602 * S, 620 * S, "delta epsilon zeta eta theta iota kappa")),
        ],
      },
      { tramo: t1, segmentos: [rel(t1, seg("A", 595 * S, 620 * S, completa))] },
      { tramo: t2, segmentos: [] },
    ];
    expect(unirTramos(tramos, D, []).segmentos.map((s) => s.texto)).toEqual([completa]);
  });

  it("la voz de referencia se llama igual en todos los tramos, y una sin muestra se sigue por el solape (A ↔ V1, H5, H6)", () => {
    const referencias: ReferenciaElegida[] = [{ nombre: "V1", etiquetaLocal: "A", desdeMs: 100 * S, hastaMs: 106 * S }];
    const tramos: TramoParaUnir[] = [
      {
        tramo: t0,
        segmentos: [
          rel(t0, seg("A", 100 * S, 110 * S, "texto de la voz de referencia en el tramo cero")),
          rel(t0, seg("B", 565 * S, 585 * S, "frase uno de la otra persona")),
          rel(t0, seg("B", 595 * S, 615 * S, "frase dos de la otra persona")), // punto medio 605 s: es del tramo 1
        ],
      },
      {
        tramo: t1,
        segmentos: [
          // Aquí el proveedor llamó «A» a la OTRA persona (las etiquetas locales no se conservan entre tramos).
          rel(t1, seg("A", 570 * S, 585 * S, "uno de la otra persona")),
          rel(t1, seg("A", 595 * S, 615 * S, "frase dos de la otra persona")),
          rel(t1, seg("V1", 700 * S, 710 * S, "la voz de referencia vuelve a hablar")),
        ],
      },
      {
        tramo: t2,
        segmentos: [
          // Alguien que no habló en el solape: sin pareja, recibe una etiqueta nueva.
          rel(t2, seg("A", 1_300 * S, 1_310 * S, "una voz nueva sin pareja")),
          // La otra persona vuelve a hablar, pero tampoco en el solape: no hay forma de saber que es la misma.
          rel(t2, seg("B", 1_350 * S, 1_360 * S, "la otra persona vuelve a hablar")),
        ],
      },
    ];
    const r = unirTramos(tramos, D, referencias);
    expect(r.segmentos.map((s) => [s.hablante, s.texto])).toEqual([
      ["V1", "texto de la voz de referencia en el tramo cero"],
      ["H5", "frase uno de la otra persona"],
      ["H5", "frase dos de la otra persona"],
      ["V1", "la voz de referencia vuelve a hablar"],
      ["H6", "una voz nueva sin pareja"],
      ["H7", "la otra persona vuelve a hablar"],
    ]);
    expect(r.etiquetas.map((e) => e.etiqueta).sort()).toEqual(["H5", "H6", "H7", "V1"]);
    expect(r.etiquetas.find((e) => e.etiqueta === "V1")?.referencia).toBe(true);
    expect(r.etiquetas.find((e) => e.etiqueta === "H5")?.referencia).toBe(false);
  });

  it("no ofrece a una voz sin muestra la etiqueta de una voz de referencia que el proveedor ya identificó en ese tramo", () => {
    const referencias: ReferenciaElegida[] = [{ nombre: "V1", etiquetaLocal: "A", desdeMs: 100 * S, hastaMs: 106 * S }];
    const tramos: TramoParaUnir[] = [
      {
        tramo: t0,
        segmentos: [
          rel(t0, seg("A", 580 * S, 590 * S, "habla la primera voz")),
          // En este tramo el proveedor la confundió con la primera voz.
          rel(t0, seg("A", 595 * S, 610 * S, "dice otra persona algo distinto")),
        ],
      },
      {
        tramo: t1,
        segmentos: [
          rel(t1, seg("V1", 580 * S, 590 * S, "habla la primera voz")),
          // Aquí la distingue: «A» habló a la vez que V1 en el tramo anterior, pero V1 ya está identificada en este tramo
          // (el segmento de arriba), así que «A» no puede ser V1.
          rel(t1, seg("A", 595 * S, 610 * S, "dice otra persona algo distinto")),
        ],
      },
      { tramo: t2, segmentos: [] },
    ];
    const r = unirTramos(tramos, D, referencias);
    expect(r.segmentos.map((s) => [s.hablante, s.texto])).toEqual([
      ["V1", "habla la primera voz"],
      ["H5", "dice otra persona algo distinto"],
    ]);
  });

  it("con un tramo sin hacer, la cobertura es menor que 1", () => {
    const r = unirTramos([{ tramo: t0, segmentos: [] }, { tramo: t2, segmentos: [] }], D, []);
    expect(r.cobertura).toBeCloseTo(15 / 25, 10);
  });

  it("un tramo sin nadie hablando cuenta como cubierto y su silencio se detecta", () => {
    const r = unirTramos(
      [
        { tramo: t0, segmentos: [rel(t0, seg("A", 5 * S, 15 * S, "arranca la reunión"))] },
        { tramo: t1, segmentos: [] }, // un receso largo: nadie habla en todo el tramo
        { tramo: t2, segmentos: [rel(t2, seg("A", 1_320 * S, 1_330 * S, "se reanuda la reunión"))] },
      ],
      D,
      [],
    );
    expect(r.cobertura).toBe(1);
    expect(r.silencios).toEqual([{ desdeMs: 15 * S, hastaMs: 1_320 * S }, { desdeMs: 1_330 * S, hastaMs: D }]);
  });

  it("el habla de cada voz y su muestra salen de lo ya unido", () => {
    const r = unirTramos(
      [
        { tramo: t0, segmentos: [rel(t0, seg("A", 0, 30 * S, "uno ".repeat(10))), rel(t0, seg("B", 40 * S, 46 * S, "dos ".repeat(4)))] },
        { tramo: t1, segmentos: [] },
        { tramo: t2, segmentos: [] },
      ],
      D,
      [],
    );
    const [h5, h6] = r.etiquetas;
    expect([h5.etiqueta, h5.talkMs]).toEqual(["H5", 30 * S]);
    expect([h6.etiqueta, h6.talkMs]).toEqual(["H6", 6 * S]);
    expect(h5.muestra).toEqual({ desdeMs: 11_000, hastaMs: 19_000 }); // el centro de 8 s de un trozo de 29,4 s
    expect(h6.muestra).toEqual({ desdeMs: 40 * S + 300, hastaMs: 46 * S - 300 }); // 5,4 s: cabe entero menos los bordes
  });
});

/* ════════════════════════════════════════════════════════════════════
   Una reunión inventada de principio a fin
   ════════════════════════════════════════════════════════════════════ */

const PERSONAS = ["Martha", "Jorge", "Carolina", "Hernán", "Andrés"];
const PESOS = [4, 3, 3, 3, 0.15];
/** Casi 50 min de MP3 normalizado (múltiplo de 36 ms): son 5 tramos. */
const DURACION = 2_999_952;

/** Lo que hacen los manejadores, sin cola ni base de datos: tramo 0 → voces → resto de tramos → unir. */
async function transcribirTodo(guion: Intervencion[], opciones: { partirFrases?: boolean } = {}) {
  const proveedor = crearProveedorSintetico({ guion, personas: PERSONAS, ...opciones });
  const audio = audioSintetico(guion, PERSONAS, DURACION);
  const corte = (desde: number, hasta: number) => {
    const r = rangoDeBytes(desde, hasta, audio.length);
    return audio.slice(r.desde, r.hasta + 1);
  };
  const tramos = planificarTramos(DURACION);
  const llamar = (t: (typeof tramos)[number], referencias: Parameters<typeof proveedor.transcribirTramo>[1]["referencias"]) =>
    proveedor.transcribirTramo(corte(t.desdeMs, t.hastaMs), { referencias, desdeMs: t.desdeMs, duracionMs: t.hastaMs - t.desdeMs, timeoutMs: 1_000 });

  const hechos: TramoParaUnir[] = [{ tramo: tramos[0], segmentos: await llamar(tramos[0], []) }];
  const referencias = elegirVoces(aAbsolutos(tramos[0], hechos[0].segmentos));
  const voces = referencias.map((r) => ({ nombre: r.nombre, audio: corte(r.desdeMs, r.hastaMs), mime: "audio/mpeg" }));
  for (const t of tramos.slice(1)) hechos.push({ tramo: t, segmentos: await llamar(t, voces) });
  return { proveedor, referencias, voces, tramos: hechos, union: unirTramos(hechos, DURACION, referencias) };
}

describe("una reunión de 50 min contada por un proveedor sintético", () => {
  const guion = generarGuion({ duracionMs: DURACION, personas: PERSONAS, pesos: PESOS, semilla: 11, silencios: [[1_500 * S, 1_700 * S]] });

  it("el guion es lo que se quiere probar: una frase cruza cada borde, y hay una voz que habla poco", () => {
    expect(guion.length).toBeGreaterThan(150);
    for (let b = 10 * MIN; b < DURACION - 15 * S; b += 10 * MIN) {
      expect(guion.some((g) => g.inicioMs < b && g.finMs > b && g.finMs - g.inicioMs >= 17_000)).toBe(true);
    }
    // Entre una y otra siempre hay más de un segundo (si no, al fusionar se juntarían).
    for (let k = 1; k < guion.length; k++) expect(guion[k].inicioMs - guion[k - 1].finMs).toBeGreaterThanOrEqual(1_200);
  });

  it("cada frase sale una sola vez, completa y en su minuto", async () => {
    const { union, tramos } = await transcribirTodo(guion);
    expect(tramos).toHaveLength(5);
    expect(union.cobertura).toBe(1);
    expect(union.segmentos.map((s) => s.texto)).toEqual(guion.map((g) => g.texto));
    expect(union.segmentos.map((s) => [s.inicioMs, s.finMs])).toEqual(guion.map((g) => [g.inicioMs, g.finMs]));
  });

  it("las cuatro voces con más habla son V1…V4 en toda la reunión y la que habla poco recibe etiquetas H", async () => {
    const { union, referencias, proveedor } = await transcribirTodo(guion);
    expect(referencias.map((r) => r.nombre)).toEqual(["V1", "V2", "V3", "V4"]);
    // Con voces conocidas, a partir del tramo 1 el proveedor recibe las cuatro.
    expect(proveedor.llamadas.slice(1).every((l) => l.referencias.join() === "V1,V2,V3,V4")).toBe(true);
    expect(proveedor.llamadas[0].referencias).toEqual([]);

    const etiquetasDe = new Map<string, Set<string>>();
    union.segmentos.forEach((s, k) => {
      const p = guion[k].quien;
      etiquetasDe.set(p, (etiquetasDe.get(p) ?? new Set()).add(s.hablante));
    });
    const referencia = PERSONAS.slice(0, 4).map((p) => [...(etiquetasDe.get(p) ?? [])]);
    expect(referencia.every((e) => e.length === 1 && /^V[1-4]$/.test(e[0]))).toBe(true);
    expect(new Set(referencia.map((e) => e[0])).size).toBe(4);

    const andres = [...(etiquetasDe.get("Andrés") ?? [])];
    expect(andres.length).toBeGreaterThan(0);
    expect(andres.every((e) => /^H\d+$/.test(e))).toBe(true);
    // Una etiqueta nunca mezcla a dos personas.
    const duenos = new Map<string, string>();
    union.segmentos.forEach((s, k) => {
      const previo = duenos.get(s.hablante);
      if (previo) expect(previo).toBe(guion[k].quien);
      duenos.set(s.hablante, guion[k].quien);
    });
  });

  it("la muestra de cada voz de referencia es de verdad de esa persona (el recorte de audio cae donde debe)", async () => {
    const { referencias, voces } = await transcribirTodo(guion);
    const quienEs = voces.map((v) => personaDeAudio(v.audio, PERSONAS));
    expect([...quienEs].sort()).toEqual(PERSONAS.slice(0, 4).sort());
    for (const r of referencias) {
      expect(r.hastaMs - r.desdeMs).toBeGreaterThanOrEqual(4_000);
      expect(r.hastaMs - r.desdeMs).toBeLessThanOrEqual(8_000);
    }
  });

  it("el receso de 3 min queda como un silencio y los tramos sin voz cuentan como cubiertos", async () => {
    const { union } = await transcribirTodo(guion);
    expect(union.silencios.some((s) => s.desdeMs <= 1_500 * S + 10_000 && s.hastaMs >= 1_700 * S - 10_000)).toBe(true);
    expect(union.cobertura).toBe(1);
  });

  it("cuando el proveedor parte las frases largas distinto en cada tramo, no se pierde ni se repite ni una palabra", async () => {
    const { union } = await transcribirTodo(guion, { partirFrases: true });
    expect(union.segmentos.map((s) => s.texto)).toEqual(guion.map((g) => g.texto));
    expect(union.segmentos.map((s) => [s.inicioMs, s.finMs])).toEqual(guion.map((g) => [g.inicioMs, g.finMs]));
  });

  it("lo mismo con varias reuniones inventadas distintas", async () => {
    for (const semilla of [1, 2, 3, 12, 13, 14, 21, 22]) {
      const otro = generarGuion({ duracionMs: DURACION, personas: PERSONAS, pesos: PESOS, semilla });
      for (const partirFrases of [false, true]) {
        const { union } = await transcribirTodo(otro, { partirFrases });
        expect(union.segmentos.map((s) => s.texto), `semilla ${semilla}, partirFrases ${partirFrases}`).toEqual(otro.map((g) => g.texto));
      }
    }
  });
});
