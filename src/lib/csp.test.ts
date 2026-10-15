import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import {
  MAX_BYTES_INFORME,
  RUTA_INFORMES_CSP,
  construirCabecerasCsp,
  construirCspEstricta,
  construirCspForzada,
  extraerViolaciones,
  hostBloqueado,
  lineaDeInforme,
} from "./csp";

/** Separa una política en {directiva → valores}. Falla si una directiva aparece dos veces (el navegador ignoraría la segunda). */
function leer(politica: string): Record<string, string[]> {
  const directivas: Record<string, string[]> = {};
  for (const trozo of politica.split(";")) {
    const [nombre, ...valores] = trozo.trim().split(/\s+/);
    if (!nombre) throw new Error(`directiva vacía en: ${politica}`);
    if (nombre in directivas) throw new Error(`directiva repetida: ${nombre}`);
    directivas[nombre] = valores;
  }
  return directivas;
}

const PRODUCCION = { desarrollo: false };
const DESARROLLO = { desarrollo: true };

describe("política FORZADA", () => {
  const forzada = leer(construirCspForzada());

  it("solo lleva directivas que no deciden de dónde se cargan los recursos", () => {
    expect(Object.keys(forzada).sort()).toEqual(
      ["base-uri", "form-action", "frame-ancestors", "object-src", "report-uri"].sort()
    );
  });

  it("no tiene script-src ni ninguna directiva de carga (no puede romper el pintado)", () => {
    const politica = construirCspForzada();
    for (const prohibida of [
      "default-src",
      "script-src",
      "style-src",
      "img-src",
      "font-src",
      "media-src",
      "connect-src",
      "frame-src",
      "child-src",
      "worker-src",
      "manifest-src",
      "upgrade-insecure-requests",
      "unsafe-inline",
      "unsafe-eval",
    ]) {
      expect(politica).not.toContain(prohibida);
    }
  });

  it("cierra objetos, <base> y marcos", () => {
    expect(forzada["object-src"]).toEqual(["'none'"]);
    expect(forzada["base-uri"]).toEqual(["'self'"]);
    expect(forzada["frame-ancestors"]).toEqual(["'none'"]);
  });

  it("form-action admite el propio sitio, Google y ePayco, y nada más", () => {
    expect(forzada["form-action"]).toEqual(["'self'", "https://accounts.google.com", "https://*.epayco.co"]);
  });

  it("informa por report-uri (y no por report-to: con los dos, Chrome ignora report-uri y la Reporting API no se pudo comprobar)", () => {
    expect(forzada["report-uri"]).toEqual([RUTA_INFORMES_CSP]);
    expect(forzada["report-to"]).toBeUndefined();
    expect(construirCspEstricta(PRODUCCION)).not.toContain("report-to");
  });

  it("es idéntica en desarrollo y en producción", () => {
    expect(construirCabecerasCsp(DESARROLLO)[0]).toEqual(construirCabecerasCsp(PRODUCCION)[0]);
  });
});

describe("política ESTRICTA (solo informe)", () => {
  const prod = leer(construirCspEstricta(PRODUCCION));
  const dev = leer(construirCspEstricta(DESARROLLO));

  it("en producción no admite 'unsafe-eval' en ninguna directiva", () => {
    expect(construirCspEstricta(PRODUCCION)).not.toContain("unsafe-eval");
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("en desarrollo admite 'unsafe-eval' solo en script-src (React lo usa para las trazas de error)", () => {
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    const conEval = Object.entries(dev).filter(([, v]) => v.includes("'unsafe-eval'"));
    expect(conEval.map(([n]) => n)).toEqual(["script-src"]);
  });

  it("solo difiere entre entornos en 'unsafe-eval'", () => {
    expect(construirCspEstricta(DESARROLLO).replace(" 'unsafe-eval'", "")).toBe(construirCspEstricta(PRODUCCION));
  });

  it("default-src es el propio sitio", () => {
    expect(prod["default-src"]).toEqual(["'self'"]);
  });

  it("script-src: propio, en línea (hidratación de Next), Turnstile y el script de checkout de ePayco", () => {
    expect(prod["script-src"]).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://challenges.cloudflare.com",
      "https://checkout.epayco.co",
    ]);
  });

  it("style-src y font-src: Google Fonts (hojas en googleapis, archivos en gstatic)", () => {
    expect(prod["style-src"]).toEqual(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]);
    expect(prod["font-src"]).toEqual(["'self'", "data:", "https://fonts.gstatic.com"]);
  });

  it("img-src admite cualquier imagen https, data: y blob: (logos, avatares, QR y vistas previas)", () => {
    expect(prod["img-src"]).toEqual(["'self'", "data:", "blob:", "https:"]);
  });

  it("media-src: el propio sitio, blob: (grabadora) y los almacenes de Vercel Blob", () => {
    expect(prod["media-src"]).toEqual(["'self'", "blob:", "https://*.blob.vercel-storage.com"]);
  });

  it("connect-src: Vercel Blob (API con barra final, que es lo que hace que cubra /?pathname= y /mpu), ePayco y Turnstile", () => {
    expect(prod["connect-src"]).toEqual([
      "'self'",
      "https://vercel.com/api/blob/",
      "https://*.blob.vercel-storage.com",
      "https://*.epayco.co",
      "https://challenges.cloudflare.com",
    ]);
  });

  it("frame-src: solo ePayco (modal de pago) y Turnstile", () => {
    expect(prod["frame-src"]).toEqual(["https://*.epayco.co", "https://challenges.cloudflare.com"]);
  });

  it("repite las directivas seguras de la forzada, para poder promoverla tal cual", () => {
    const forzada = leer(construirCspForzada());
    for (const nombre of ["object-src", "base-uri", "frame-ancestors", "form-action", "report-uri"]) {
      expect(prod[nombre]).toEqual(forzada[nombre]);
    }
  });

  it("no admite comodines abiertos ni http plano en ninguna directiva de carga de scripts, estilos o conexiones", () => {
    for (const nombre of ["script-src", "style-src", "connect-src", "frame-src"]) {
      expect(prod[nombre]).not.toContain("*");
      expect(prod[nombre]).not.toContain("https:");
      expect(prod[nombre]).not.toContain("http:");
    }
  });
});

describe("forma de las políticas", () => {
  const todas = [
    construirCspForzada(),
    construirCspEstricta(PRODUCCION),
    construirCspEstricta(DESARROLLO),
  ];

  it("son una sola línea, sin saltos, comas ni punto y coma final, y sin directivas repetidas ni vacías", () => {
    for (const politica of todas) {
      expect(politica).not.toMatch(/[\n\r,]/);
      expect(politica.endsWith(";")).toBe(false);
      expect(() => leer(politica)).not.toThrow();
    }
  });

  it("toda directiva con valores los lleva entre comillas simples o como origen/esquema (ninguna palabra clave sin comillas)", () => {
    const claves = ["self", "none", "unsafe-inline", "unsafe-eval"];
    for (const politica of todas) {
      for (const valores of Object.values(leer(politica))) {
        for (const v of valores) {
          expect(claves).not.toContain(v);
        }
      }
    }
  });

  it("caben de sobra en una cabecera (los proxies suelen cortar hacia los 8 KB)", () => {
    for (const politica of todas) expect(politica.length).toBeLessThan(2000);
  });
});

describe("construirCabecerasCsp", () => {
  it("devuelve la forzada y la estricta en modo solo-informe, y nada más", () => {
    const cabeceras = construirCabecerasCsp(PRODUCCION);
    expect(cabeceras.map((c) => c.key)).toEqual(["Content-Security-Policy", "Content-Security-Policy-Report-Only"]);
    expect(cabeceras[0].value).toBe(construirCspForzada());
    expect(cabeceras[1].value).toBe(construirCspEstricta(PRODUCCION));
  });

  it("la cabecera forzada no es la estricta: la que bloquea nunca lleva script-src", () => {
    const [forzada, soloInforme] = construirCabecerasCsp(PRODUCCION);
    expect(forzada.value).not.toContain("script-src");
    expect(soloInforme.value).toContain("script-src");
  });
});

describe("next.config.ts", () => {
  type Regla = { source: string; headers: Array<{ key: string; value: string }> };
  const reglas = async (): Promise<Regla[]> => (await nextConfig.headers!()) as Regla[];

  it("conserva EXACTAMENTE las cinco cabeceras de seguridad de siempre, para todas las rutas", async () => {
    const [primera] = await reglas();
    expect(primera.source).toBe("/:path*");
    expect(primera.headers).toEqual([
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(self), usb=(), microphone=(self)" },
    ]);
  });

  it("añade las cabeceras de CSP en las páginas, no en la API ni en /_next/", async () => {
    const [, csp] = await reglas();
    expect(csp.headers.map((h) => h.key)).toEqual(["Content-Security-Policy", "Content-Security-Policy-Report-Only"]);
    const patron = new RegExp(`^${csp.source}$`);
    for (const ruta of ["/", "/login", "/legal/terminos", "/portal", "/dashboard", "/dashboard/suscripcion", "/u/abc123", "/admin"]) {
      expect(patron.test(ruta), ruta).toBe(true);
    }
    for (const ruta of ["/api/health", "/api/csp-report", "/api/download/1/pdf", "/_next/static/chunks/a.js", "/_next/image"]) {
      expect(patron.test(ruta), ruta).toBe(false);
    }
  });

  it("no hay ninguna otra regla", async () => {
    expect(await reglas()).toHaveLength(2);
  });
});

describe("hostBloqueado", () => {
  it("deja solo el host: sin ruta, consulta, fragmento ni credenciales", () => {
    expect(hostBloqueado("https://cdn.ejemplo.com/ruta/archivo.js?token=SECRETO&x=1#frag")).toBe("cdn.ejemplo.com");
    expect(hostBloqueado("https://usuario:clave@ejemplo.com/a")).toBe("ejemplo.com");
    expect(hostBloqueado("https://Ejemplo.COM:8443/a?b=c")).toBe("ejemplo.com:8443");
  });

  it("conserva las palabras clave del navegador", () => {
    for (const clave of ["inline", "eval", "data", "blob", "self", "wasm-eval"]) {
      expect(hostBloqueado(clave)).toBe(clave);
    }
  });

  it("reduce data:, blob: y javascript: a su esquema (el contenido puede llevar datos)", () => {
    expect(hostBloqueado("data:image/png;base64,AAAA")).toBe("data");
    expect(hostBloqueado("blob:https://app.ejemplo.com/3f9a")).toBe("blob");
    expect(hostBloqueado("javascript:alert(1)")).toBe("javascript");
  });

  it("no se fía de lo que no es una URL", () => {
    expect(hostBloqueado("")).toBe("vacio");
    expect(hostBloqueado(undefined)).toBe("vacio");
    expect(hostBloqueado(42)).toBe("vacio");
    expect(hostBloqueado("ejemplo.com/ruta?token=SECRETO")).toBe("invalido");
    expect(hostBloqueado("not a url\nforjada")).toBe("invalido");
  });

  it("no deja pasar caracteres de control ni nada fuera de un host", () => {
    expect(hostBloqueado("https://ejemplo.com\u0000\n[csp-report] falsa")).toMatch(/^[a-z0-9.:*-]*$/);
    expect(hostBloqueado("https://" + "a".repeat(500) + ".com/")).toHaveLength(100);
  });
});

describe("extraerViolaciones", () => {
  it("lee el formato de report-uri (application/csp-report)", () => {
    const cuerpo = JSON.stringify({
      "csp-report": {
        "document-uri": "https://app.ejemplo.com/u/TOKEN-SECRETO?x=1",
        "blocked-uri": "https://fonts.ejemplo.com/f.woff2?k=SECRETO",
        "effective-directive": "font-src",
        "violated-directive": "font-src 'self'",
        disposition: "report",
      },
    });
    expect(extraerViolaciones(cuerpo)).toEqual([{ directiva: "font-src", bloqueado: "fonts.ejemplo.com", forzada: false }]);
  });

  it("usa violated-directive cuando falta effective-directive y recorta los valores", () => {
    const cuerpo = JSON.stringify({ "csp-report": { "blocked-uri": "inline", "violated-directive": "script-src 'self' https:" } });
    expect(extraerViolaciones(cuerpo)).toEqual([{ directiva: "script-src", bloqueado: "inline", forzada: false }]);
  });

  it("lee el formato de report-to (application/reports+json), con varios informes", () => {
    const cuerpo = JSON.stringify([
      {
        type: "csp-violation",
        age: 10,
        url: "https://app.ejemplo.com/dashboard",
        body: { effectiveDirective: "img-src", blockedURL: "https://img.ejemplo.com/a.png?t=SECRETO", disposition: "report" },
      },
      { type: "csp-violation", body: { effectiveDirective: "frame-ancestors", blockedURL: "https://malo.com/", disposition: "enforce" } },
      { type: "deprecation", body: { id: "x" } },
    ]);
    expect(extraerViolaciones(cuerpo)).toEqual([
      { directiva: "img-src", bloqueado: "img.ejemplo.com", forzada: false },
      { directiva: "frame-ancestors", bloqueado: "malo.com", forzada: true },
    ]);
  });

  it("devuelve [] ante JSON inválido o con otra forma, sin lanzar", () => {
    for (const cuerpo of ["", "no es json", "null", "42", '"texto"', "{}", '{"csp-report": 5}', "[1, 2, null]", '[{"type":"csp-violation"}]']) {
      expect(extraerViolaciones(cuerpo), cuerpo).toEqual([]);
    }
  });

  it("limita cuántas violaciones lee de una sola petición", () => {
    const uno = { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://a.com/" } };
    expect(extraerViolaciones(JSON.stringify(Array(500).fill(uno)))).toHaveLength(20);
  });

  it("una directiva con caracteres raros se reemplaza por «desconocida»", () => {
    const cuerpo = JSON.stringify({ "csp-report": { "blocked-uri": "inline", "effective-directive": "img-src\n[falso] x" } });
    expect(extraerViolaciones(cuerpo)[0].directiva).toBe("img-src");
    const raro = JSON.stringify({ "csp-report": { "blocked-uri": "inline", "effective-directive": "'; DROP TABLE" } });
    expect(extraerViolaciones(raro)[0].directiva).toBe("desconocida");
  });
});

describe("lineaDeInforme", () => {
  it("una sola línea con la directiva y el host, nunca la URL", () => {
    const linea = lineaDeInforme([{ directiva: "img-src", bloqueado: "img.ejemplo.com", forzada: false }]);
    expect(linea).toBe("[csp-report] directiva=img-src bloqueado=img.ejemplo.com modo=informe");
  });

  it("si venían más, lo indica en la misma línea", () => {
    const linea = lineaDeInforme([
      { directiva: "img-src", bloqueado: "a.com", forzada: false },
      { directiva: "font-src", bloqueado: "b.com", forzada: false },
      { directiva: "font-src", bloqueado: "c.com", forzada: false },
    ]);
    expect(linea).toBe("[csp-report] directiva=img-src bloqueado=a.com modo=informe (+2 más)");
  });

  it("marca las violaciones de la política forzada", () => {
    expect(lineaDeInforme([{ directiva: "frame-ancestors", bloqueado: "malo.com", forzada: true }])).toContain("modo=forzada");
  });

  it("sin violaciones no hay línea", () => {
    expect(lineaDeInforme([])).toBeNull();
  });

  it("de punta a punta, un informe hostil no deja saltos de línea ni fragmentos de la URL en el log", () => {
    const cuerpo = JSON.stringify({
      "csp-report": {
        "blocked-uri": "https://evil.com/\n[csp-report] directiva=falsa?token=ABC#frag",
        "effective-directive": "script-src",
      },
    });
    const linea = lineaDeInforme(extraerViolaciones(cuerpo))!;
    expect(linea).not.toMatch(/[\n\r]/);
    expect(linea).not.toContain("token");
    expect(linea).not.toContain("ABC");
    expect(linea).not.toContain("frag");
  });
});

describe("constantes", () => {
  it("el tope del cuerpo del informe es de 8 KB", () => {
    expect(MAX_BYTES_INFORME).toBe(8192);
  });
});
