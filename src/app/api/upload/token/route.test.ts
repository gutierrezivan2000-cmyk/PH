import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesion } = vi.hoisted(() => ({ sesion: { actual: null as { user?: { id?: string } } | null } }));
vi.mock("@/lib/auth", () => ({ auth: async () => sesion.actual }));

import { POST } from "./route";

// Token de lectura/escritura falso con la forma real (`vercel_blob_rw_<tienda>_<secreto>`): el SDK firma el token de cliente
// en local, sin llamar a la red, así que la prueba recorre el `handleUpload` de verdad.
const TOKEN_FALSO = "vercel_blob_rw_tienda123_secretoDePrueba456";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";

const pedir = (pathname: unknown, multipart = false) =>
  POST(
    new Request("http://localhost:3000/api/upload/token", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart } }),
    }) as never
  );

/** Lo que el SDK mete dentro del token de cliente (la parte firmada que lee el almacenamiento al recibir el archivo). */
function cargaDelToken(clientToken: string): { pathname: string; maximumSizeInBytes?: number; addRandomSuffix?: boolean } {
  const [, , , , codificado] = clientToken.split("_");
  const interior = Buffer.from(codificado ?? "", "base64").toString().split(".")[1] ?? "";
  return JSON.parse(Buffer.from(interior, "base64").toString());
}

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", TOKEN_FALSO);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  sesion.actual = { user: { id: U1 } };
});

describe("POST /api/upload/token", () => {
  it("autoriza una ruta del prefijo del propio usuario y la ata al token", async () => {
    const pathname = `subidas/${U1}/uploads/acta-lk3j2a9f.pdf`;
    const r = await pedir(pathname);
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.type).toBe("blob.generate-client-token");
    const carga = cargaDelToken(json.clientToken);
    // El token queda atado a ESA ruta: el navegador no puede subir a otra con él.
    expect(carga.pathname).toBe(pathname);
    expect(carga.addRandomSuffix).toBe(true);
  });

  it("mantiene el tope por tipo: 200 MB para audio, 50 MB para documentos", async () => {
    const audio = cargaDelToken((await (await pedir(`subidas/${U1}/uploads/asamblea-x1.mp3`, true)).json()).clientToken);
    const doc = cargaDelToken((await (await pedir(`subidas/${U1}/uploads/acta-x1.pdf`)).json()).clientToken);
    expect(audio.maximumSizeInBytes).toBe(200 * 1024 * 1024);
    expect(doc.maximumSizeInBytes).toBe(50 * 1024 * 1024);
  });

  it("rechaza (403) una ruta del prefijo de OTRO usuario y no emite token", async () => {
    const r = await pedir(`subidas/${U2}/uploads/acta.pdf`);
    expect(r.status).toBe(403);
    const json = await r.json();
    expect(json.error).toMatch(/Ruta de subida no permitida/);
    expect(json.clientToken).toBeUndefined();
  });

  it("rechaza (403) las rutas de antes, sin dueño, que cualquiera podía pedir", async () => {
    for (const pathname of [
      "uploads/123-acta.pdf",
      "corrections/123-acta.pdf",
      "agent-files/123-acta.pdf",
      `agent-files/${U1}/acta.pdf`,
      "branding/logo-123.png",
      `monthly/prop1/2026-5/123-acta.pdf`,
      `property-docs/prop1/123-reglamento.pdf`,
      "generations/gen1/informe.html",
      "meetings/m1/audio.mp3",
      "acta.pdf",
    ]) {
      const r = await pedir(pathname);
      expect(r.status, pathname).toBe(403);
      expect((await r.json()).clientToken, pathname).toBeUndefined();
    }
  });

  it("rechaza (403) los trucos de ruta que apuntan a la carpeta de otro", async () => {
    for (const pathname of [
      `subidas/${U1}/../${U2}/acta.pdf`,
      `subidas/${U1}/%2e%2e/${U2}/acta.pdf`,
      `subidas/${U1}%2F..%2F${U2}/acta.pdf`,
      `subidas//${U2}/acta.pdf`,
      `/subidas/${U1}/acta.pdf`,
      `Subidas/${U1}/acta.pdf`,
      `subidas/${U1.toUpperCase()}/acta.pdf`,
      `subidas/${U1}`,
      `subidas/${U1}/`,
      `subidas/${U1}/acta.pdf?x=1`,
      `subidas\\${U1}\\acta.pdf`,
    ]) {
      const r = await pedir(pathname);
      expect(r.status, pathname).toBe(403);
    }
  });

  it("rechaza lo que no es una ruta (tipos raros en el cuerpo)", async () => {
    for (const pathname of [undefined, null, 42, {}, [], ""]) {
      const r = await pedir(pathname);
      expect([400, 403], String(pathname)).toContain(r.status);
      expect((await r.json()).clientToken).toBeUndefined();
    }
  });

  it("sin sesión responde 401 y no emite token, ni siquiera para una ruta bien formada", async () => {
    sesion.actual = null;
    const r = await pedir(`subidas/${U1}/uploads/acta.pdf`);
    expect(r.status).toBe(401);
    const json = await r.json();
    expect(json.error).toBe("No autorizado");
    expect(json.clientToken).toBeUndefined();
  });

  it("una sesión sin id tampoco emite token", async () => {
    sesion.actual = { user: {} };
    expect((await pedir(`subidas/${U1}/uploads/acta.pdf`)).status).toBe(401);
    sesion.actual = { user: { id: "" } };
    expect((await pedir(`subidas/${U1}/uploads/acta.pdf`)).status).toBe(401);
  });

  it("un cuerpo que no es JSON responde 400 en vez de reventar", async () => {
    const r = await POST(new Request("http://localhost:3000/api/upload/token", { method: "POST", body: "no es json" }) as never);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("Cuerpo inválido");
  });

  it("un evento desconocido sigue respondiendo 400", async () => {
    const r = await POST(new Request("http://localhost:3000/api/upload/token", { method: "POST", body: JSON.stringify({ type: "otro" }) }) as never);
    expect(r.status).toBe(400);
  });
});
