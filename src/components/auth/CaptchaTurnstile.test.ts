import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CaptchaTurnstile } from "./CaptchaTurnstile";

// Sin DOM no hay efectos: esto comprueba el primer pintado (lo que ve el servidor y lo que lee un lector de pantalla antes de
// que cargue el script), que es donde se juega el alto reservado y la etiqueta.
const pintar = () => renderToStaticMarkup(createElement(CaptchaTurnstile, { siteKey: "1x00000000000000000000AA", onToken: vi.fn() }));

describe("CaptchaTurnstile — primer pintado", () => {
  it("es un grupo con etiqueta que apunta a su título visible", () => {
    const html = pintar();
    expect(html).toContain('role="group"');
    const idEtiqueta = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(idEtiqueta).toBeTruthy();
    expect(html).toMatch(new RegExp(`<p id="${idEtiqueta!.replace(/[:.]/g, "\\$&")}"[^>]*>Verificación de seguridad</p>`));
  });

  it("reserva el alto del widget desde el primer pintado (sin saltos al cargar)", () => {
    expect(pintar()).toContain("min-height:65px");
  });

  it("avisa de lo que falta con un texto de alto fijo y aria-live", () => {
    const html = pintar();
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Completa la verificación para continuar.");
    expect(html).toContain("min-height:18px");
    expect(html).not.toContain("Verificación completada.");
    expect(html).not.toContain('role="alert"');
  });

  it("usa los colores del tema de la aplicación (claro y oscuro), no colores fijos", () => {
    const html = pintar();
    expect(html).toContain("var(--ink-3)");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
