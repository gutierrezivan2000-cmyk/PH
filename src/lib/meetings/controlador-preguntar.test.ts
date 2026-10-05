/** La conversación con una reunión en la pantalla, con un respondedor falso: trozos que llegan, detener, repetir, historial y errores. */
import { describe, expect, it, vi } from "vitest";
import { crearControladorDePreguntar, type Respondedor } from "./controlador-preguntar";
import { MAX_PREGUNTA } from "./preguntar-pedido";

const tic = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** Un respondedor que el test maneja a mano: cada llamada espera a que se le diga qué hacer. */
function respondedorManual() {
  const llamadas: Array<{
    pedido: Parameters<Respondedor>[0];
    senal: AbortSignal;
    texto: (t: string) => void;
    terminar: (cortada?: boolean) => void;
    fallar: (mensaje: string) => void;
  }> = [];
  const responder: Respondedor = (pedido, { alTexto, senal }) =>
    new Promise((resolver, rechazar) => {
      llamadas.push({
        pedido, senal, texto: alTexto,
        terminar: (cortada = false) => resolver({ cortada }),
        fallar: (m) => rechazar(new Error(m)),
      });
      senal.addEventListener("abort", () => rechazar(new DOMException("Detenida", "AbortError")));
    });
  return { responder, llamadas };
}
const crear = () => {
  const m = respondedorManual();
  return { ...m, c: crearControladorDePreguntar({ responder: m.responder }) };
};
const ultimo = (c: ReturnType<typeof crear>["c"]) => c.leer().turnos[c.leer().turnos.length - 1];

describe("una pregunta", () => {
  it("agrega la pregunta y la respuesta «escribiendo»; los trozos se van sumando; al terminar queda «lista»", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("  ¿Qué se decidió?  ");
    await tic();
    expect(c.leer().enviando).toBe(true);
    expect(c.leer().turnos).toEqual([
      { id: "t1", rol: "user", texto: "¿Qué se decidió?" },
      { id: "t2", rol: "assistant", texto: "", estado: "escribiendo" },
    ]);
    expect(llamadas[0].pedido).toEqual({ pregunta: "¿Qué se decidió?", historial: [] });
    llamadas[0].texto("Se aprobó ");
    llamadas[0].texto("la prórroga.");
    expect(ultimo(c)).toMatchObject({ texto: "Se aprobó la prórroga.", estado: "escribiendo" });
    llamadas[0].terminar();
    expect(await hecha).toBe(true);
    expect(ultimo(c)).toMatchObject({ texto: "Se aprobó la prórroga.", estado: "lista" });
    expect(c.leer().enviando).toBe(false);
  });

  it("una respuesta que llegó al tope de largo queda «cortada»", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("p");
    await tic();
    llamadas[0].texto("larga");
    llamadas[0].terminar(true);
    await hecha;
    expect(ultimo(c)).toMatchObject({ estado: "cortada", texto: "larga" });
  });

  it("no hace nada con una pregunta vacía, ni mientras se responde otra; recorta la que pasa del largo", async () => {
    const { c, llamadas } = crear();
    expect(await c.preguntar("   ")).toBe(false);
    expect(c.leer().turnos).toEqual([]);
    const primera = c.preguntar("x".repeat(MAX_PREGUNTA + 50));
    await tic();
    expect(llamadas[0].pedido.pregunta).toHaveLength(MAX_PREGUNTA);
    expect(await c.preguntar("otra")).toBe(false);
    expect(llamadas).toHaveLength(1);
    llamadas[0].terminar();
    await primera;
  });

  it("la segunda pregunta manda de historial lo ya contestado", async () => {
    const { c, llamadas } = crear();
    let hecha = c.preguntar("p1");
    await tic();
    llamadas[0].texto("r1");
    llamadas[0].terminar();
    await hecha;
    hecha = c.preguntar("p2");
    await tic();
    expect(llamadas[1].pedido).toEqual({ pregunta: "p2", historial: [{ rol: "user", texto: "p1" }, { rol: "assistant", texto: "r1" }] });
    llamadas[1].terminar();
    await hecha;
  });
});

describe("cuando falla", () => {
  it("antes de empezar a responder (sin cupo, reunión sin terminar…): la respuesta queda en error con el mensaje, sin texto", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("p");
    await tic();
    llamadas[0].fallar("Has alcanzado el límite diario de 30 mensajes. Intenta mañana.");
    await hecha;
    expect(ultimo(c)).toEqual({ id: "t2", rol: "assistant", texto: "", estado: "error", error: "Has alcanzado el límite diario de 30 mensajes. Intenta mañana." });
    expect(c.leer().enviando).toBe(false);
  });

  it("a mitad de la respuesta: se conserva lo que llegó y se dice por qué se interrumpió", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("p");
    await tic();
    llamadas[0].texto("Se aprobó la pró");
    llamadas[0].fallar("El servicio de IA está saturado.");
    await hecha;
    expect(ultimo(c)).toMatchObject({ estado: "error", texto: "Se aprobó la pró", error: "El servicio de IA está saturado." });
  });

  it("un error sin mensaje usa uno claro", async () => {
    const m = respondedorManual();
    const c = crearControladorDePreguntar({ responder: async () => { throw "algo raro"; } });
    await c.preguntar("p");
    expect(ultimo(c)).toMatchObject({ estado: "error", error: "No pudimos responder tu pregunta. Inténtalo de nuevo." });
    expect(m.llamadas).toHaveLength(0);
  });

  it("la pregunta que falló no va en el historial de la siguiente", async () => {
    const { c, llamadas } = crear();
    let hecha = c.preguntar("p1");
    await tic();
    llamadas[0].fallar("x");
    await hecha;
    hecha = c.preguntar("p2");
    await tic();
    expect(llamadas[1].pedido.historial).toEqual([]);
    llamadas[1].terminar();
    await hecha;
  });
});

describe("detener", () => {
  it("corta la respuesta que se escribe: queda «detenida» con lo que ya llegó, y se puede preguntar otra vez", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("p");
    await tic();
    llamadas[0].texto("a medias");
    c.detener();
    await hecha;
    expect(llamadas[0].senal.aborted).toBe(true);
    expect(ultimo(c)).toMatchObject({ estado: "detenida", texto: "a medias" });
    expect(c.leer().enviando).toBe(false);
  });

  it("lo que llegue después de detener no se agrega", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("p");
    await tic();
    llamadas[0].texto("uno");
    c.detener();
    llamadas[0].texto(" tarde");
    await hecha;
    expect(ultimo(c)).toMatchObject({ texto: "uno", estado: "detenida" });
  });

  it("sin nada en curso no hace nada", () => {
    const { c } = crear();
    expect(() => c.detener()).not.toThrow();
  });

  it("una respuesta detenida tampoco entra al historial", async () => {
    const { c, llamadas } = crear();
    let hecha = c.preguntar("p1");
    await tic();
    llamadas[0].texto("parcial");
    c.detener();
    await hecha;
    hecha = c.preguntar("p2");
    await tic();
    expect(llamadas[1].pedido.historial).toEqual([]);
    llamadas[1].terminar();
    await hecha;
  });
});

describe("intentar de nuevo", () => {
  it("repite la última pregunta cuando falló: reemplaza la respuesta (no duplica la pregunta) y no manda la fallida de historial", async () => {
    const { c, llamadas } = crear();
    let hecha = c.preguntar("p1");
    await tic();
    llamadas[0].texto("r1");
    llamadas[0].terminar();
    await hecha;
    hecha = c.preguntar("p2");
    await tic();
    llamadas[1].texto("parc");
    llamadas[1].fallar("saturado");
    await hecha;
    expect(ultimo(c)).toMatchObject({ estado: "error" });

    const otra = c.reintentar();
    await tic();
    expect(ultimo(c)).toMatchObject({ estado: "escribiendo", texto: "" });
    expect(ultimo(c)).not.toHaveProperty("error", "saturado");
    expect(llamadas[2].pedido).toEqual({ pregunta: "p2", historial: [{ rol: "user", texto: "p1" }, { rol: "assistant", texto: "r1" }] });
    llamadas[2].texto("buena");
    llamadas[2].terminar();
    expect(await otra).toBe(true);
    expect(c.leer().turnos.map((t) => [t.rol, t.texto])).toEqual([["user", "p1"], ["assistant", "r1"], ["user", "p2"], ["assistant", "buena"]]);
    expect(ultimo(c)).toMatchObject({ estado: "lista" });
  });

  it("también cuando se detuvo", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("p");
    await tic();
    c.detener();
    await hecha;
    const otra = c.reintentar();
    await tic();
    expect(llamadas[1].pedido.pregunta).toBe("p");
    llamadas[1].terminar();
    expect(await otra).toBe(true);
  });

  it("no hay nada que repetir si la respuesta salió bien, si no hay conversación o si todavía se responde", async () => {
    const { c, llamadas } = crear();
    expect(await c.reintentar()).toBe(false);
    const hecha = c.preguntar("p");
    await tic();
    expect(await c.reintentar()).toBe(false); // se está escribiendo
    llamadas[0].terminar();
    await hecha;
    expect(await c.reintentar()).toBe(false); // salió bien
    expect(llamadas).toHaveLength(1);
  });
});

describe("empezar otra conversación y cerrar", () => {
  it("«limpiar» borra la conversación, pero no mientras se responde", async () => {
    const { c, llamadas } = crear();
    const hecha = c.preguntar("p");
    await tic();
    c.limpiar();
    expect(c.leer().turnos).toHaveLength(2);
    llamadas[0].terminar();
    await hecha;
    c.limpiar();
    expect(c.leer().turnos).toEqual([]);
  });

  it("al desactivar se corta lo que esté en vuelo y ya no se avisa a nadie ni se atienden preguntas", async () => {
    const { c, llamadas } = crear();
    const aviso = vi.fn();
    c.suscribir(aviso);
    void c.preguntar("p");
    await tic();
    aviso.mockClear();
    c.desactivar();
    expect(llamadas[0].senal.aborted).toBe(true);
    await tic();
    expect(aviso).not.toHaveBeenCalled();
    expect(await c.preguntar("otra")).toBe(false);
    expect(await c.reintentar()).toBe(false);
  });

  it("y al volver a activarse (React monta, desmonta y monta de nuevo en desarrollo) todo sigue funcionando", async () => {
    const { c, llamadas } = crear();
    c.activar();
    c.desactivar();
    c.activar();
    const hecha = c.preguntar("p");
    await tic();
    llamadas[0].texto("ok");
    llamadas[0].terminar();
    expect(await hecha).toBe(true);
    expect(ultimo(c)).toMatchObject({ texto: "ok", estado: "lista" });
    // Los que escuchan siguen escuchando después de desactivar y activar.
    const aviso = vi.fn();
    c.suscribir(aviso);
    c.desactivar();
    c.activar();
    const otra = c.preguntar("q");
    await tic();
    expect(aviso).toHaveBeenCalled();
    llamadas[1].terminar();
    await otra;
  });
});

describe("suscripción", () => {
  it("avisa a quien escucha en cada cambio y el estado es estable entre cambios (lo exige useSyncExternalStore)", async () => {
    const { c, llamadas } = crear();
    const aviso = vi.fn();
    const baja = c.suscribir(aviso);
    const antes = c.leer();
    const hecha = c.preguntar("p");
    await tic();
    expect(aviso).toHaveBeenCalled();
    expect(c.leer()).not.toBe(antes);
    expect(c.leer()).toBe(c.leer());
    baja();
    aviso.mockClear();
    llamadas[0].texto("x");
    llamadas[0].terminar();
    await hecha;
    expect(aviso).not.toHaveBeenCalled();
  });
});
