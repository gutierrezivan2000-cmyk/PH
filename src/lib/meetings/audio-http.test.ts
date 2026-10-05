/** La cabecera `Range` y las cabeceras de la respuesta del audio. */
import { describe, expect, it } from "vitest";
import { MAX_BYTES_POR_RESPUESTA, encabezadosDeAudio, leerRango } from "./audio-http";

const TOTAL = 115_200_000; // 8 h a 32 kbps
const MB = 1024 * 1024;

describe("leerRango", () => {
  it("sin cabecera: el archivo entero", () => {
    expect(leerRango(null, TOTAL)).toEqual({ tipo: "completo" });
    expect(leerRango(undefined, TOTAL)).toEqual({ tipo: "completo" });
    expect(leerRango("", TOTAL)).toEqual({ tipo: "completo" });
    expect(leerRango("   ", TOTAL)).toEqual({ tipo: "completo" });
  });

  it("el primer sondeo de Safari («bytes=0-1») da exactamente dos bytes", () => {
    expect(leerRango("bytes=0-1", TOTAL)).toEqual({ tipo: "rango", desde: 0, hasta: 1 });
  });

  it("un rango cerrado se respeta tal cual", () => {
    expect(leerRango("bytes=1000-1999", TOTAL)).toEqual({ tipo: "rango", desde: 1000, hasta: 1999 });
    expect(leerRango("bytes=5-5", TOTAL)).toEqual({ tipo: "rango", desde: 5, hasta: 5 });
  });

  it("«hasta el final» se corta en el tope por respuesta: el navegador pide el siguiente trozo", () => {
    expect(leerRango("bytes=0-", TOTAL)).toEqual({ tipo: "rango", desde: 0, hasta: MAX_BYTES_POR_RESPUESTA - 1 });
    expect(leerRango("bytes=50000000-", TOTAL)).toEqual({ tipo: "rango", desde: 50_000_000, hasta: 50_000_000 + MAX_BYTES_POR_RESPUESTA - 1 });
    expect(leerRango(`bytes=0-${TOTAL}`, TOTAL)).toEqual({ tipo: "rango", desde: 0, hasta: MAX_BYTES_POR_RESPUESTA - 1 });
  });

  it("un rango que pasa del final se acorta al final del archivo", () => {
    expect(leerRango("bytes=1000-999999999999", 5000)).toEqual({ tipo: "rango", desde: 1000, hasta: 4999 });
    expect(leerRango(`bytes=${TOTAL - 100}-`, TOTAL)).toEqual({ tipo: "rango", desde: TOTAL - 100, hasta: TOTAL - 1 });
  });

  it("el tope se puede cambiar", () => {
    expect(leerRango("bytes=0-", 10_000, 100)).toEqual({ tipo: "rango", desde: 0, hasta: 99 });
    expect(leerRango("bytes=9950-", 10_000, 100)).toEqual({ tipo: "rango", desde: 9950, hasta: 9999 });
  });

  it("los últimos n bytes", () => {
    expect(leerRango("bytes=-500", TOTAL)).toEqual({ tipo: "rango", desde: TOTAL - 500, hasta: TOTAL - 1 });
    // más que el archivo: todo el archivo (con tope)
    expect(leerRango("bytes=-9999999", 5000)).toEqual({ tipo: "rango", desde: 0, hasta: 4999 });
    expect(leerRango(`bytes=-${TOTAL}`, TOTAL)).toEqual({ tipo: "rango", desde: 0, hasta: MAX_BYTES_POR_RESPUESTA - 1 });
  });

  it("pedir algo más allá del final es insatisfacible (416), también «los últimos 0 bytes»", () => {
    expect(leerRango(`bytes=${TOTAL}-`, TOTAL)).toEqual({ tipo: "insatisfacible" });
    expect(leerRango(`bytes=${TOTAL + 10}-${TOTAL + 20}`, TOTAL)).toEqual({ tipo: "insatisfacible" });
    expect(leerRango("bytes=-0", TOTAL)).toEqual({ tipo: "insatisfacible" });
    expect(leerRango("bytes=0-10", 0)).toEqual({ tipo: "insatisfacible" });
    expect(leerRango("bytes=99999999999999999999-", TOTAL)).toEqual({ tipo: "insatisfacible" });
  });

  it("lo que no se entiende se ignora y se responde el archivo entero (RFC 9110)", () => {
    expect(leerRango("bytes=10-5", TOTAL)).toEqual({ tipo: "completo" }); // mal escrito
    expect(leerRango("bytes=-", TOTAL)).toEqual({ tipo: "completo" });
    expect(leerRango("items=0-5", TOTAL)).toEqual({ tipo: "completo" }); // otra unidad
    expect(leerRango("bytes=0-5,10-15", TOTAL)).toEqual({ tipo: "completo" }); // varios rangos
    expect(leerRango("bytes=abc-def", TOTAL)).toEqual({ tipo: "completo" });
    expect(leerRango("0-5", TOTAL)).toEqual({ tipo: "completo" });
  });

  it("entiende «Bytes=» en cualquier caso y con espacios alrededor", () => {
    expect(leerRango("  Bytes=0-9  ", TOTAL)).toEqual({ tipo: "rango", desde: 0, hasta: 9 });
  });
});

describe("encabezadosDeAudio", () => {
  it("un 206 lleva Content-Range y un Content-Length que cuadran con los bytes del cuerpo", () => {
    const e = encabezadosDeAudio({ tipo: "rango", desde: 1000, hasta: 1999 }, TOTAL);
    expect(e.status).toBe(206);
    expect(e.headers["Content-Range"]).toBe(`bytes 1000-1999/${TOTAL}`);
    expect(e.headers["Content-Length"]).toBe("1000");
    expect(e.cuerpo).toEqual({ desde: 1000, hasta: 1999 });
  });

  it("un rango de un solo byte mide 1", () => {
    const e = encabezadosDeAudio({ tipo: "rango", desde: 7, hasta: 7 }, 100);
    expect(e.headers["Content-Length"]).toBe("1");
    expect(e.headers["Content-Range"]).toBe("bytes 7-7/100");
  });

  it("sin rango: 200 con el tamaño total y sin Content-Range", () => {
    const e = encabezadosDeAudio({ tipo: "completo" }, 4096);
    expect(e.status).toBe(200);
    expect(e.headers["Content-Length"]).toBe("4096");
    expect(e.headers["Content-Range"]).toBeUndefined();
    expect(e.cuerpo).toEqual({ desde: 0, hasta: 4095 });
  });

  it("un archivo vacío: 200 sin cuerpo", () => {
    const e = encabezadosDeAudio({ tipo: "completo" }, 0);
    expect(e.status).toBe(200);
    expect(e.cuerpo).toBeNull();
  });

  it("416 dice cuánto mide el archivo y no lleva cuerpo", () => {
    const e = encabezadosDeAudio({ tipo: "insatisfacible" }, TOTAL);
    expect(e.status).toBe(416);
    expect(e.headers["Content-Range"]).toBe(`bytes */${TOTAL}`);
    expect(e.headers["Content-Length"]).toBe("0");
    expect(e.cuerpo).toBeNull();
  });

  it("todas dicen que aceptan rangos, que es audio y que la copia es privada", () => {
    for (const r of [{ tipo: "completo" }, { tipo: "rango", desde: 0, hasta: 1 }, { tipo: "insatisfacible" }] as const) {
      const h = encabezadosDeAudio(r, 100).headers;
      expect(h["Accept-Ranges"]).toBe("bytes");
      expect(h["Content-Type"]).toBe("audio/mpeg");
      expect(h["Cache-Control"]).toMatch(/^private,/);
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
    }
  });

  it("el tope por respuesta son 4 MiB: por debajo de los 4,5 MB que Vercel deja en una respuesta", () => {
    expect(MAX_BYTES_POR_RESPUESTA).toBe(4 * MB);
    expect(MAX_BYTES_POR_RESPUESTA).toBeLessThan(4_500_000);
  });
});
