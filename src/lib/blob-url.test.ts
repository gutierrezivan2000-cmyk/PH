import { describe, it, expect } from "vitest";
import { isAllowedBlobUrl } from "./blob-url";

describe("isAllowedBlobUrl", () => {
  it("acepta las URLs legítimas del almacenamiento", () => {
    expect(isAllowedBlobUrl("https://abc123.public.blob.vercel-storage.com/uploads/x.pdf")).toBe(true);
    expect(isAllowedBlobUrl("https://xyz.blob.vercel-storage.com/generations/1/informe.html")).toBe(true);
  });

  it("rechaza cualquier host ajeno: por ahí se fugaba el token de escritura", () => {
    expect(isAllowedBlobUrl("http://servidor-del-atacante/x.pdf")).toBe(false);
    expect(isAllowedBlobUrl("https://servidor-del-atacante/x.pdf")).toBe(false);
    expect(isAllowedBlobUrl("https://blob.vercel-storage.com.atacante.com/x.pdf")).toBe(false);
    expect(isAllowedBlobUrl("https://atacante.com/?a=.blob.vercel-storage.com")).toBe(false);
  });

  it("exige https: en http el token viajaría además en claro", () => {
    expect(isAllowedBlobUrl("http://abc.blob.vercel-storage.com/x.pdf")).toBe(false);
  });

  it("rechaza esquemas que apuntan a la propia máquina o al disco", () => {
    expect(isAllowedBlobUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedBlobUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedBlobUrl("http://localhost:9977/x.pdf")).toBe(false);
  });

  it("aguanta basura sin lanzar", () => {
    for (const v of [null, undefined, "", "no es una url", 42, {}, []]) {
      expect(isAllowedBlobUrl(v)).toBe(false);
    }
  });
});
