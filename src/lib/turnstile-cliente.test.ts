import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  URL_API_TURNSTILE,
  cargarTurnstile,
  olvidarCargaTurnstile,
  siteKeyTurnstile,
  temaDelDocumento,
  type ApiTurnstile,
} from "./turnstile-cliente";

/** Un <script> de mentira: guarda los oyentes para poder disparar «load» o «error» a mano. */
class ScriptFalso {
  id = "";
  src = "";
  async = false;
  defer = false;
  quitado = false;
  oyentes: Record<string, () => void> = {};
  addEventListener(tipo: string, fn: () => void) {
    this.oyentes[tipo] = fn;
  }
  remove() {
    this.quitado = true;
  }
  disparar(tipo: "load" | "error") {
    this.oyentes[tipo]?.();
  }
}

function crearEntorno() {
  const scripts: ScriptFalso[] = [];
  const doc = {
    head: { appendChild: (s: ScriptFalso) => void scripts.push(s) },
    createElement: () => new ScriptFalso(),
    // Como el DOM real: solo encuentra los scripts que siguen puestos.
    getElementById: (id: string) => scripts.find((s) => s.id === id && !s.quitado) ?? null,
  } as unknown as Document;
  const api: ApiTurnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
  const win = {
    turnstile: undefined as ApiTurnstile | undefined,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id),
  } as unknown as Window;
  return { doc, win, scripts, api };
}

beforeEach(() => olvidarCargaTurnstile());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("siteKeyTurnstile", () => {
  it("sin la variable (o en blanco) el captcha queda apagado", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(siteKeyTurnstile()).toBe("");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "   ");
    expect(siteKeyTurnstile()).toBe("");
  });

  it("con la variable devuelve la llave sin espacios", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", " 1x00000000000000000000AA ");
    expect(siteKeyTurnstile()).toBe("1x00000000000000000000AA");
  });
});

describe("temaDelDocumento", () => {
  const doc = (theme?: string) => ({ documentElement: { dataset: { theme } } }) as unknown as Document;

  it("usa el tema que ya resolvió la aplicación", () => {
    expect(temaDelDocumento(doc("dark"))).toBe("dark");
    expect(temaDelDocumento(doc("light"))).toBe("light");
  });

  it("sin tema (o con uno raro) deja que el widget siga al sistema", () => {
    expect(temaDelDocumento(doc(undefined))).toBe("auto");
    expect(temaDelDocumento(doc("sepia"))).toBe("auto");
  });
});

describe("cargarTurnstile", () => {
  it("si la API ya está en la página, la devuelve sin añadir otro script", async () => {
    const { doc, win, scripts, api } = crearEntorno();
    win.turnstile = api;
    await expect(cargarTurnstile(doc, win)).resolves.toBe(api);
    expect(scripts).toHaveLength(0);
  });

  it("añade UN script (async, defer, render=explicit) aunque se pida varias veces a la vez", async () => {
    const { doc, win, scripts, api } = crearEntorno();
    const a = cargarTurnstile(doc, win);
    const b = cargarTurnstile(doc, win);
    expect(a).toBe(b);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({ src: URL_API_TURNSTILE, async: true, defer: true });
    expect(URL_API_TURNSTILE).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");

    win.turnstile = api;
    scripts[0].disparar("load");
    await expect(a).resolves.toBe(api);
  });

  it("si ya hay un script de una carga anterior en la página, no pone otro", async () => {
    const { doc, win, scripts, api } = crearEntorno();
    const primera = cargarTurnstile(doc, win);
    win.turnstile = api;
    scripts[0].disparar("load");
    await primera;

    win.turnstile = undefined; // p. ej. la API se perdió; el script sigue puesto
    olvidarCargaTurnstile();
    const otra = cargarTurnstile(doc, win);
    expect(scripts).toHaveLength(1);
    win.turnstile = api;
    scripts[0].disparar("load");
    await expect(otra).resolves.toBe(api);
  });

  it("si el script falla, rechaza, lo quita y el siguiente intento empieza de cero", async () => {
    const { doc, win, scripts, api } = crearEntorno();
    const fallida = cargarTurnstile(doc, win);
    scripts[0].disparar("error");
    await expect(fallida).rejects.toThrow(/Turnstile/);
    expect(scripts[0].quitado).toBe(true);

    const reintento = cargarTurnstile(doc, win);
    expect(scripts).toHaveLength(2);
    win.turnstile = api;
    scripts[1].disparar("load");
    await expect(reintento).resolves.toBe(api);
  });

  it("si el script carga pero no expone la API, rechaza", async () => {
    const { doc, win, scripts } = crearEntorno();
    const p = cargarTurnstile(doc, win);
    scripts[0].disparar("load");
    await expect(p).rejects.toThrow(/no expuso la API/);
  });

  it("si no carga ni falla en 15 s, rechaza por tiempo", async () => {
    vi.useFakeTimers();
    const { doc, win, scripts } = crearEntorno();
    const p = cargarTurnstile(doc, win);
    const resultado = expect(p).rejects.toThrow(/tardó demasiado/);
    await vi.advanceTimersByTimeAsync(15_000);
    await resultado;
    expect(scripts[0].quitado).toBe(true);
  });

  it("al cargar a tiempo no deja el temporizador pendiente", async () => {
    vi.useFakeTimers();
    const { doc, win, scripts, api } = crearEntorno();
    const p = cargarTurnstile(doc, win);
    win.turnstile = api;
    scripts[0].disparar("load");
    await p;
    expect(vi.getTimerCount()).toBe(0);
  });
});
