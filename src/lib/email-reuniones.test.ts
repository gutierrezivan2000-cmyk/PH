import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => enviar(...a) };
    batch = { send: vi.fn() };
  },
}));

import { sendMeetingReadyEmail } from "./email";

const params = { to: "ana@ejemplo.com", title: "Consejo de octubre", propertyName: "Conjunto Los Pinos", duration: "2 h 14 min", url: "https://soph.test/dashboard/reuniones/m1" };

beforeEach(() => {
  enviar.mockReset();
  enviar.mockResolvedValue({ data: { id: "e1" }, error: null });
  vi.stubEnv("RESEND_API_KEY", "re_prueba");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendMeetingReadyEmail", () => {
  it("avisa al dueño con el título, la copropiedad, la duración y el enlace, y nada del contenido", async () => {
    expect(await sendMeetingReadyEmail(params)).toEqual({ sent: true });
    expect(enviar).toHaveBeenCalledTimes(1);
    const m = enviar.mock.calls[0][0] as { to: string; from: string; subject: string; html: string };
    expect(m.to).toBe("ana@ejemplo.com");
    expect(m.from).toMatch(/SOPH\.IA/);
    expect(m.subject).toBe("Tu reunión «Consejo de octubre» ya está lista — SOPH.IA");
    expect(m.html).toContain("Consejo de octubre");
    expect(m.html).toContain("Conjunto Los Pinos · 2 h 14 min");
    expect(m.html).toContain('href="https://soph.test/dashboard/reuniones/m1"');
    expect(m.html).toContain("no incluye nada del contenido de la reunión");
  });

  it("escapa lo que escribió la persona: un título con HTML no se vuelve HTML", async () => {
    await sendMeetingReadyEmail({ ...params, title: '<img src=x onerror=alert(1)> "Consejo"', propertyName: "<b>Los Pinos</b>" });
    const m = enviar.mock.calls[0][0] as { html: string };
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).not.toContain("<b>Los Pinos</b>");
    expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt; &quot;Consejo&quot;");
  });

  it("el asunto es una sola línea y no pasa de un largo razonable", async () => {
    await sendMeetingReadyEmail({ ...params, title: `Consejo\r\nBcc: otro@x.com\n${"x".repeat(300)}` });
    const m = enviar.mock.calls[0][0] as { subject: string };
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject.length).toBeLessThan(200);
  });

  it("sin duración no deja un « · » colgando", async () => {
    await sendMeetingReadyEmail({ ...params, duration: "" });
    expect((enviar.mock.calls[0][0] as { html: string }).html).not.toContain("Los Pinos ·");
  });

  it("sin clave de correo, o sin destinatario, no envía nada y no falla", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendMeetingReadyEmail(params)).toEqual({ sent: false });
    vi.stubEnv("RESEND_API_KEY", "re_prueba");
    expect(await sendMeetingReadyEmail({ ...params, to: "" })).toEqual({ sent: false });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si Resend responde con error o se cae, nunca lanza: devuelve que no se envió", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    enviar.mockResolvedValue({ data: null, error: { message: "dominio sin verificar" } });
    expect(await sendMeetingReadyEmail(params)).toEqual({ sent: false });
    enviar.mockRejectedValue(new Error("red caída"));
    expect(await sendMeetingReadyEmail(params)).toEqual({ sent: false });
    expect(consola).toHaveBeenCalledTimes(1);
  });
});
