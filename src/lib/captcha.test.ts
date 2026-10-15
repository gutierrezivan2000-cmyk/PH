import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { MENSAJE_CAPTCHA_FALLIDO, URL_VERIFICACION_TURNSTILE, verificarCaptcha } from "./captcha";

const SECRETO = "1x0000000000000000000000000000000AA";
const TOKEN = "token-de-prueba-XYZ";

const respuesta = (cuerpo: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response;

let fetchFalso: ReturnType<typeof vi.fn>;
let errores: MockInstance<typeof console.error>;

beforeEach(() => {
  fetchFalso = vi.fn();
  vi.stubGlobal("fetch", fetchFalso);
  vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETO);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "llave-publica-de-prueba");
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Todo lo que se escribió en console.error, como un solo texto. */
const logs = () => errores.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

describe("verificarCaptcha — apagado", () => {
  it("sin TURNSTILE_SECRET_KEY no verifica nada y deja pasar (omitido)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verificarCaptcha(undefined, "1.2.3.4")).toEqual({ ok: true, omitido: true });
    expect(await verificarCaptcha("cualquier-token", "1.2.3.4")).toEqual({ ok: true, omitido: true });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("con la secreta pero SIN la llave pública (configuración a medias) queda apagado y no bloquea a nadie", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const r = await verificarCaptcha(undefined, "1.2.3.4");
    expect(r).toEqual({ ok: true, omitido: true });
  });

  it("una llave en blanco también cuenta como apagado", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "   ");
    expect(await verificarCaptcha(TOKEN, "1.2.3.4")).toEqual({ ok: true, omitido: true });
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("verificarCaptcha — encendido", () => {
  it.each([undefined, null, "", "   ", 123, {}])("sin token válido (%j) rechaza sin llamar a Cloudflare", async (token) => {
    const r = await verificarCaptcha(token, "1.2.3.4");
    expect(r.ok).toBe(false);
    expect(r.omitido).toBeUndefined();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("un token más largo que el máximo de Turnstile se rechaza sin llamar a Cloudflare", async () => {
    const r = await verificarCaptcha("a".repeat(2049), "1.2.3.4");
    expect(r.ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("con token válido manda secret, response y remoteip por POST y acepta", async () => {
    fetchFalso.mockResolvedValue(respuesta({ success: true }));
    const r = await verificarCaptcha(TOKEN, "203.0.113.7");
    expect(r).toEqual({ ok: true });

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_VERIFICACION_TURNSTILE);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const datos = new URLSearchParams(String(init.body));
    expect(datos.get("secret")).toBe(SECRETO);
    expect(datos.get("response")).toBe(TOKEN);
    expect(datos.get("remoteip")).toBe("203.0.113.7");
  });

  it("no manda remoteip si la IP no es una IP (clientIp devuelve «unknown»)", async () => {
    fetchFalso.mockResolvedValue(respuesta({ success: true }));
    await verificarCaptcha(TOKEN, "unknown");
    await verificarCaptcha(TOKEN, undefined);
    await verificarCaptcha(TOKEN, "");
    for (const [, init] of fetchFalso.mock.calls as [string, RequestInit][]) {
      expect(new URLSearchParams(String(init.body)).has("remoteip")).toBe(false);
    }
  });

  it("acepta IPv6 como remoteip", async () => {
    fetchFalso.mockResolvedValue(respuesta({ success: true }));
    await verificarCaptcha(TOKEN, "2001:db8::1");
    const [, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(String(init.body)).get("remoteip")).toBe("2001:db8::1");
  });

  it("si Cloudflare dice success:false rechaza e informa los códigos", async () => {
    fetchFalso.mockResolvedValue(respuesta({ success: false, "error-codes": ["invalid-input-response"] }));
    const r = await verificarCaptcha(TOKEN, "1.2.3.4");
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("invalid-input-response");
    expect(r.omitido).toBeUndefined();
  });

  it("timeout-or-duplicate (token ya usado o vencido) también se rechaza", async () => {
    fetchFalso.mockResolvedValue(respuesta({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    expect((await verificarCaptcha(TOKEN, "1.2.3.4")).ok).toBe(false);
  });

  it("una llave secreta inválida rechaza pero lo deja muy claro en el log (sin imprimir la llave)", async () => {
    fetchFalso.mockResolvedValue(respuesta({ success: false, "error-codes": ["invalid-input-secret"] }));
    const r = await verificarCaptcha(TOKEN, "1.2.3.4");
    expect(r.ok).toBe(false);
    expect(logs()).toContain("TURNSTILE_SECRET_KEY");
    expect(logs()).not.toContain(SECRETO);
  });
});

describe("verificarCaptcha — Cloudflare caído (falla ABIERTO)", () => {
  it("un error de red deja pasar con motivo y lo registra", async () => {
    fetchFalso.mockRejectedValue(new TypeError("fetch failed"));
    const r = await verificarCaptcha(TOKEN, "1.2.3.4");
    expect(r.ok).toBe(true);
    expect(r.omitido).toBeUndefined();
    expect(r.motivo).toBeTruthy();
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it.each([500, 502, 503])("HTTP %i deja pasar con motivo y lo registra", async (status) => {
    fetchFalso.mockResolvedValue(respuesta({}, status));
    const r = await verificarCaptcha(TOKEN, "1.2.3.4");
    expect(r.ok).toBe(true);
    expect(r.motivo).toContain(String(status));
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it("internal-error de Cloudflare se trata como caída, no como rechazo", async () => {
    fetchFalso.mockResolvedValue(respuesta({ success: false, "error-codes": ["internal-error"] }));
    const r = await verificarCaptcha(TOKEN, "1.2.3.4");
    expect(r.ok).toBe(true);
    expect(r.motivo).toContain("internal-error");
  });

  it("una respuesta que no se puede leer deja pasar", async () => {
    fetchFalso.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("no es JSON"); } } as unknown as Response);
    const r = await verificarCaptcha(TOKEN, "1.2.3.4");
    expect(r.ok).toBe(true);
    expect(r.motivo).toBeTruthy();
  });

  it("una respuesta sin el campo success deja pasar", async () => {
    fetchFalso.mockResolvedValue(respuesta({ algo: "raro" }));
    expect((await verificarCaptcha(TOKEN, "1.2.3.4")).ok).toBe(true);
  });

  it("si Cloudflare no responde en 4 s aborta la petición y deja pasar", async () => {
    vi.useFakeTimers();
    let senalRecibida: AbortSignal | undefined;
    fetchFalso.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resuelve, rechaza) => {
          senalRecibida = init.signal as AbortSignal;
          senalRecibida.addEventListener("abort", () => rechaza(new DOMException("aborted", "AbortError")));
        }),
    );

    const pendiente = verificarCaptcha(TOKEN, "1.2.3.4");
    await vi.advanceTimersByTimeAsync(3_999);
    expect(senalRecibida?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(senalRecibida?.aborted).toBe(true);

    const r = await pendiente;
    expect(r.ok).toBe(true);
    expect(r.motivo).toContain("4 s");
    expect(errores).toHaveBeenCalledTimes(1);
  });

  it("cuando responde a tiempo no deja temporizadores pendientes", async () => {
    vi.useFakeTimers();
    fetchFalso.mockResolvedValue(respuesta({ success: true }));
    await verificarCaptcha(TOKEN, "1.2.3.4");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("verificarCaptcha — no filtra secretos", () => {
  it("ni la llave ni el token aparecen en el log, ni siquiera cuando el fallo de red los trae en el mensaje", async () => {
    fetchFalso.mockRejectedValue(new Error(`fallo con secret=${SECRETO}&response=${TOKEN}`));
    await verificarCaptcha(TOKEN, "1.2.3.4");
    fetchFalso.mockResolvedValue(respuesta({ success: false, "error-codes": ["invalid-input-response"] }));
    await verificarCaptcha(TOKEN, "1.2.3.4");
    fetchFalso.mockResolvedValue(respuesta({}, 503));
    await verificarCaptcha(TOKEN, "1.2.3.4");

    expect(errores).toHaveBeenCalled();
    expect(logs()).not.toContain(SECRETO);
    expect(logs()).not.toContain(TOKEN);
  });

  it("el mensaje para la persona está en español y no revela detalles", () => {
    expect(MENSAJE_CAPTCHA_FALLIDO).toBe("No pudimos verificar que eres una persona. Intenta de nuevo.");
  });
});
