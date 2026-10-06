/** El motor del audio con un `<audio>` falso: lo que hace al reproducir, saltar, cortar una muestra y fallar. */
import { describe, expect, it, vi } from "vitest";
import {
  SALTO_MS, VELOCIDADES, crearMotor, esVelocidad, intervencionEnCurso, intervencionMasCercana, mensajeDeErrorDeAudio, textoDeVelocidad,
  type AudioLike, type Velocidad,
} from "./motor-audio";

class AudioFalso implements AudioLike {
  src = "";
  currentTime = 0;
  playbackRate = 1;
  preload = "";
  error: { code: number } | null = null;
  jugado = 0;
  pausas = 0;
  cargas = 0;
  /** Lo que hace `play()`: sonar, o fallar con este error. */
  falla: { name: string } | null = null;
  private oyentes = new Map<string, Set<() => void>>();

  play() {
    this.jugado++;
    if (this.falla) return Promise.reject(this.falla);
    this.emitir("play");
    this.emitir("playing");
    return Promise.resolve();
  }
  pause() {
    this.pausas++;
    this.emitir("pause");
  }
  load() {
    this.cargas++;
  }
  removeAttribute(nombre: string) {
    if (nombre === "src") this.src = "";
  }
  addEventListener(tipo: string, fn: () => void) {
    if (!this.oyentes.has(tipo)) this.oyentes.set(tipo, new Set());
    this.oyentes.get(tipo)!.add(fn);
  }
  removeEventListener(tipo: string, fn: () => void) {
    this.oyentes.get(tipo)?.delete(fn);
  }
  emitir(tipo: string) {
    for (const f of [...(this.oyentes.get(tipo) ?? [])]) f();
  }
  /** El tiempo avanza (como lo haría el reproductor). */
  avanzarA(segundos: number) {
    this.currentTime = segundos;
    this.emitir("timeupdate");
  }
  get oyentesActivos(): number {
    return [...this.oyentes.values()].reduce((s, c) => s + c.size, 0);
  }
}

const HORA = 3_600_000;
const URL_AUDIO = "/api/meetings/m1/audio";

function montar(duracionMs = 8 * HORA) {
  const creados: AudioFalso[] = [];
  const motor = crearMotor({ url: URL_AUDIO, duracionMs, crearAudio: () => { const a = new AudioFalso(); creados.push(a); return a; } });
  return { motor, creados, ultimo: () => creados[creados.length - 1] };
}

describe("crear el reproductor", () => {
  it("no crea el <audio> (ni pide nada al servidor) hasta que hace falta sonar", () => {
    const { motor, creados } = montar();
    motor.buscar(5 * HORA);
    motor.fijarVelocidad(1.5);
    motor.saltar(SALTO_MS);
    expect(creados).toHaveLength(0);
    expect(motor.estado().tiempoMs).toBe(5 * HORA + SALTO_MS);
  });

  it("al reproducir por primera vez crea el <audio> ya en la posición y la velocidad que la persona dejó", () => {
    const { motor, creados } = montar();
    motor.buscar(5 * HORA + 12 * 60_000 + 40_000);
    motor.fijarVelocidad(1.5);
    motor.alternar();
    expect(creados).toHaveLength(1);
    const a = creados[0];
    expect(a.src).toBe(URL_AUDIO);
    expect(a.preload).toBe("metadata");
    expect(a.currentTime).toBe(5 * 3600 + 12 * 60 + 40);
    expect(a.playbackRate).toBe(1.5);
    expect(a.jugado).toBe(1);
    expect(motor.estado().reproduciendo).toBe(true);
  });

  it("el estado de partida", () => {
    expect(montar().motor.estado()).toEqual({ tiempoMs: 0, reproduciendo: false, cargando: false, error: null, velocidad: 1, tramo: null });
  });
});

describe("reproducir, pausar y mover", () => {
  it("alternar pausa lo que suena y vuelve a sonar desde donde quedó", () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    ultimo().avanzarA(90);
    motor.alternar();
    expect(ultimo().pausas).toBe(1);
    expect(motor.estado()).toMatchObject({ reproduciendo: false, tiempoMs: 90_000 });
    motor.alternar();
    expect(ultimo().jugado).toBe(2);
    expect(ultimo().currentTime).toBe(90);
    expect(motor.estado().reproduciendo).toBe(true);
  });

  it("reproducirDesde lleva el audio al minuto y suena", () => {
    const { motor, ultimo } = montar();
    motor.reproducirDesde(2 * HORA + 30_000);
    expect(ultimo().currentTime).toBe(2 * 3600 + 30);
    expect(motor.estado()).toMatchObject({ tiempoMs: 2 * HORA + 30_000, reproduciendo: true, error: null });
  });

  it("el minuto avanza con el audio y nunca pasa de la duración ni baja de cero", () => {
    const { motor, ultimo } = montar(60_000);
    motor.alternar();
    ultimo().avanzarA(12.345);
    expect(motor.estado().tiempoMs).toBe(12_345);
    motor.buscar(999_999);
    expect(motor.estado().tiempoMs).toBe(60_000);
    motor.buscar(-5);
    expect(motor.estado().tiempoMs).toBe(0);
    motor.buscar(Number.NaN);
    expect(motor.estado().tiempoMs).toBe(0);
  });

  it("saltar ±15 s parte de donde está el audio ahora, no del último aviso", () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    ultimo().currentTime = 100; // el audio avanzó y todavía no avisó
    motor.saltar(SALTO_MS);
    expect(ultimo().currentTime).toBe(115);
    expect(motor.estado().tiempoMs).toBe(115_000);
    motor.saltar(-2 * SALTO_MS);
    expect(ultimo().currentTime).toBe(85);
    motor.saltar(-HORA);
    expect(ultimo().currentTime).toBe(0);
  });

  it("buscar mientras suena no pausa; mientras está en pausa, tampoco empieza a sonar", () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    motor.buscar(10 * 60_000);
    expect(motor.estado().reproduciendo).toBe(true);
    expect(ultimo().pausas).toBe(0);
    motor.alternar(); // pausa
    const jugadas = ultimo().jugado;
    motor.buscar(20 * 60_000);
    expect(ultimo().jugado).toBe(jugadas);
    expect(motor.estado().reproduciendo).toBe(false);
  });

  it("al terminar la reunión, «reproducir» vuelve a empezar", () => {
    const { motor, ultimo } = montar(60_000);
    motor.alternar();
    ultimo().avanzarA(60);
    ultimo().emitir("ended");
    expect(motor.estado()).toMatchObject({ reproduciendo: false, tiempoMs: 60_000 });
    motor.alternar();
    expect(ultimo().currentTime).toBe(0);
    expect(motor.estado()).toMatchObject({ reproduciendo: true, tiempoMs: 0 });
  });

  it("«cargando» mientras el audio espera datos y se apaga cuando suena", () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    ultimo().emitir("waiting");
    expect(motor.estado().cargando).toBe(true);
    ultimo().emitir("playing");
    expect(motor.estado().cargando).toBe(false);
  });
});

describe("velocidad", () => {
  it("se aplica al audio y se recuerda; lo que no es una velocidad se ignora", () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    for (const v of VELOCIDADES) {
      motor.fijarVelocidad(v);
      expect(ultimo().playbackRate).toBe(v);
      expect(motor.estado().velocidad).toBe(v);
    }
    motor.fijarVelocidad(3 as unknown as Velocidad);
    expect(motor.estado().velocidad).toBe(2);
    expect(esVelocidad(1.25)).toBe(true);
    expect(esVelocidad(0.5)).toBe(false);
  });

  it("se escribe con coma decimal", () => {
    expect(VELOCIDADES.map(textoDeVelocidad)).toEqual(["1×", "1,25×", "1,5×", "2×"]);
  });
});

describe("una muestra de voz", () => {
  it("suena a velocidad normal aunque la persona oiga a 2×, y se corta sola al llegar al final", () => {
    const { motor, ultimo } = montar();
    motor.fijarVelocidad(2);
    motor.alternar();
    expect(ultimo().playbackRate).toBe(2);

    motor.reproducirTramo("V3", 3_723_000, 3_729_000);
    expect(ultimo().currentTime).toBe(3723);
    expect(ultimo().playbackRate).toBe(1);
    expect(motor.estado().tramo).toEqual({ clave: "V3", desdeMs: 3_723_000, hastaMs: 3_729_000 });

    ultimo().avanzarA(3726);
    expect(motor.estado().tramo?.clave).toBe("V3"); // todavía suena
    const pausas = ultimo().pausas;
    ultimo().avanzarA(3729.1);
    expect(ultimo().pausas).toBe(pausas + 1);
    expect(motor.estado()).toMatchObject({ tramo: null, reproduciendo: false });
    expect(ultimo().playbackRate).toBe(2); // la velocidad de la persona vuelve
  });

  it("reproducir otra cosa o mover el reproductor cierra la muestra y devuelve la velocidad", () => {
    const { motor, ultimo } = montar();
    motor.fijarVelocidad(1.5);
    motor.reproducirTramo("V1", 10_000, 16_000);
    motor.reproducirDesde(60_000);
    expect(motor.estado().tramo).toBeNull();
    expect(ultimo().playbackRate).toBe(1.5);

    motor.reproducirTramo("V2", 20_000, 26_000);
    motor.buscar(30_000);
    expect(motor.estado().tramo).toBeNull();
    expect(ultimo().playbackRate).toBe(1.5);
  });

  it("cambiar la velocidad durante la muestra no la acelera: se aplica al terminar", () => {
    const { motor, ultimo } = montar();
    motor.reproducirTramo("V1", 10_000, 16_000);
    motor.fijarVelocidad(2);
    expect(ultimo().playbackRate).toBe(1);
    motor.detener();
    expect(ultimo().playbackRate).toBe(2);
  });

  it("detener pausa y cierra la muestra", () => {
    const { motor, ultimo } = montar();
    motor.reproducirTramo("V1", 10_000, 16_000);
    motor.detener();
    expect(ultimo().pausas).toBe(1);
    expect(motor.estado()).toMatchObject({ tramo: null, reproduciendo: false });
  });

  it("una muestra con el final antes del principio igual dura algo y no se rompe", () => {
    const { motor } = montar();
    motor.reproducirTramo("V1", 10_000, 5_000);
    expect(motor.estado().tramo!.hastaMs).toBeGreaterThan(motor.estado().tramo!.desdeMs);
  });
});

describe("cuando algo falla", () => {
  it("un error de red o de archivo dice qué pasó, en español, y deja de sonar", () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    ultimo().error = { code: 4 };
    ultimo().emitir("error");
    expect(motor.estado()).toMatchObject({ error: "No pudimos cargar el audio de esta reunión.", reproduciendo: false, cargando: false });
    expect(mensajeDeErrorDeAudio(2)).toMatch(/conexión/);
    expect(mensajeDeErrorDeAudio(3)).toMatch(/navegador/);
    expect(mensajeDeErrorDeAudio(99)).toMatch(/No pudimos reproducir/);
  });

  it("un error de «cancelado» (código 1) no es un error para la persona", () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    ultimo().error = { code: 1 };
    ultimo().emitir("error");
    expect(motor.estado().error).toBeNull();
    expect(mensajeDeErrorDeAudio(1)).toBeNull();
  });

  it("si el navegador bloquea el sonido, no se muestra como fallo del audio; una orden interrumpida tampoco", async () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    motor.alternar(); // pausa
    ultimo().falla = { name: "NotAllowedError" };
    motor.alternar();
    await Promise.resolve();
    await Promise.resolve();
    expect(motor.estado()).toMatchObject({ error: null, reproduciendo: false, cargando: false });

    ultimo().falla = { name: "AbortError" };
    motor.alternar();
    await Promise.resolve();
    await Promise.resolve();
    expect(motor.estado().error).toBeNull();
  });

  it("si reproducir falla por otra causa, lo dice", async () => {
    const { motor, ultimo } = montar();
    motor.alternar();
    motor.alternar();
    ultimo().falla = { name: "NotSupportedError" };
    ultimo().error = { code: 4 };
    motor.alternar();
    await Promise.resolve();
    await Promise.resolve();
    expect(motor.estado().error).toBe("No pudimos cargar el audio de esta reunión.");
    expect(motor.estado().reproduciendo).toBe(false);
  });

  it("reintentar suelta el audio dañado, crea otro y sigue desde donde iba", () => {
    const { motor, creados } = montar();
    motor.alternar();
    creados[0].avanzarA(321);
    creados[0].error = { code: 2 };
    creados[0].emitir("error");
    expect(motor.estado().error).not.toBeNull();

    motor.reintentar();
    expect(creados).toHaveLength(2);
    expect(creados[0].src).toBe(""); // soltó la red
    expect(creados[0].oyentesActivos).toBe(0);
    expect(creados[1].currentTime).toBe(321);
    expect(creados[1].src).toBe(URL_AUDIO);
    expect(motor.estado()).toMatchObject({ error: null, reproduciendo: true });

    // lo que diga el audio viejo ya no cuenta
    creados[0].avanzarA(9999);
    expect(motor.estado().tiempoMs).toBe(321_000);
  });
});

describe("destruir", () => {
  it("suelta el audio y la red, y el motor se puede volver a usar (React vuelve a montar en desarrollo)", () => {
    const { motor, creados } = montar();
    motor.alternar();
    creados[0].avanzarA(50);
    motor.destruir();
    expect(creados[0].src).toBe("");
    expect(creados[0].cargas).toBe(1);
    expect(creados[0].oyentesActivos).toBe(0);
    expect(motor.estado()).toMatchObject({ reproduciendo: false, tramo: null, tiempoMs: 50_000 });

    motor.alternar();
    expect(creados).toHaveLength(2);
    expect(creados[1].currentTime).toBe(50);
    expect(motor.estado().reproduciendo).toBe(true);
  });

  it("destruir sin haber sonado no hace nada raro", () => {
    const { motor, creados } = montar();
    motor.destruir();
    expect(creados).toHaveLength(0);
  });
});

describe("avisos a la pantalla", () => {
  it("avisa solo cuando algo cambió y la referencia del estado no cambia si nada cambió", () => {
    const { motor, ultimo } = montar();
    const avisos = vi.fn();
    const baja = motor.suscribir(avisos);
    motor.alternar();
    const despues = motor.estado();
    const vecesInicial = avisos.mock.calls.length;
    expect(vecesInicial).toBeGreaterThan(0);

    ultimo().avanzarA(0); // mismo minuto: nada cambia
    expect(avisos.mock.calls.length).toBe(vecesInicial);
    expect(motor.estado()).toBe(despues);

    ultimo().avanzarA(1);
    expect(avisos.mock.calls.length).toBe(vecesInicial + 1);
    expect(motor.estado()).not.toBe(despues);

    baja();
    ultimo().avanzarA(2);
    expect(avisos.mock.calls.length).toBe(vecesInicial + 1);
  });
});

describe("qué intervención suena", () => {
  const items = [
    { id: "a", startMs: 0, endMs: 4_000 },
    { id: "b", startMs: 5_000, endMs: 9_000 },
    { id: "c", startMs: 8_000, endMs: 12_000 }, // se pisa con la anterior
    { id: "d", startMs: 60_000, endMs: 64_000 },
  ];

  it("la última que empezó, mientras no haya pasado de largo", () => {
    expect(intervencionEnCurso(items, 0)?.id).toBe("a");
    expect(intervencionEnCurso(items, 3_999)?.id).toBe("a");
    expect(intervencionEnCurso(items, 5_000)?.id).toBe("b");
    expect(intervencionEnCurso(items, 8_500)?.id).toBe("c"); // dos hablan a la vez: la que empezó después
    expect(intervencionEnCurso(items, 62_000)?.id).toBe("d");
  });

  it("entre dos hay 2 s de gracia con la anterior marcada; pasado eso, ninguna", () => {
    expect(intervencionEnCurso(items, 4_500)?.id).toBe("a");
    expect(intervencionEnCurso(items, 5_999 - 1_000)?.id).toBe("a");
    expect(intervencionEnCurso(items, 30_000)).toBeNull();
    expect(intervencionEnCurso(items, 66_001)).toBeNull();
    expect(intervencionEnCurso(items, 30_000, 20_000)?.id).toBe("c");
  });

  it("sin intervenciones, o antes de la primera, ninguna", () => {
    expect(intervencionEnCurso([], 5)).toBeNull();
    expect(intervencionEnCurso([{ id: "x", startMs: 1_000, endMs: 2_000 }], 500)).toBeNull();
  });

  it("la más cercana a un minuto: la que suena, si no la siguiente y, al final, la última", () => {
    expect(intervencionMasCercana(items, 2_000)?.id).toBe("a");
    expect(intervencionMasCercana(items, 4_500)?.id).toBe("b"); // en el hueco: la que viene
    expect(intervencionMasCercana(items, 30_000)?.id).toBe("d");
    expect(intervencionMasCercana(items, 999_000)?.id).toBe("d");
    expect(intervencionMasCercana(items, 0)?.id).toBe("a");
    expect(intervencionMasCercana([{ id: "x", startMs: 1_000, endMs: 2_000 }], 10)?.id).toBe("x");
    expect(intervencionMasCercana([], 10)).toBeNull();
  });

  it("recorre una lista de miles sin recorrerla toda (búsqueda binaria)", () => {
    const miles = Array.from({ length: 20_000 }, (_, i) => ({ id: `i${i}`, startMs: i * 1_000, endMs: i * 1_000 + 800 }));
    let lecturas = 0;
    const espiada = new Proxy(miles, { get: (t, p, r) => { if (typeof p === "string" && /^\d+$/.test(p)) lecturas++; return Reflect.get(t, p, r); } });
    expect(intervencionEnCurso(espiada, 12_345_000 - 1_000)?.id).toBe("i12344");
    expect(lecturas).toBeLessThan(60);
  });
});
