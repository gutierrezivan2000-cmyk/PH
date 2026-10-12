import { describe, expect, it } from "vitest";
import { blobEsDeLaCopropiedad } from "./documento-propiedad";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const ADMIN = "cmadmin1111111111aa";
const OTRO = "cmotro22222222222bb";
const PROP = "cmprop1111111111aa";
const OTRA_PROP = "cmprop9999999999zz";

describe("blobEsDeLaCopropiedad", () => {
  it("acepta el archivo que subió el administrador de la copropiedad", () => {
    expect(blobEsDeLaCopropiedad(`${HOST}/subidas/${ADMIN}/property-docs/${PROP}/reglamento-AbC123.pdf`, PROP, ADMIN)).toBe(true);
    expect(blobEsDeLaCopropiedad(`${HOST}/subidas/${ADMIN}/reglamento-AbC123.pdf`, PROP, ADMIN)).toBe(true);
  });

  it("acepta la carpeta de antes de esta copropiedad (property-docs/<id>/…)", () => {
    expect(blobEsDeLaCopropiedad(`${HOST}/property-docs/${PROP}/1700000-reglamento-AbC123.pdf`, PROP, ADMIN)).toBe(true);
    // También sin administrador conocido: la carpeta de la copropiedad basta para lo guardado antes.
    expect(blobEsDeLaCopropiedad(`${HOST}/property-docs/${PROP}/1700000-reglamento-AbC123.pdf`, PROP, null)).toBe(true);
    expect(blobEsDeLaCopropiedad(`${HOST}/property-docs/${PROP}/1700000-reglamento-AbC123.pdf`, PROP, undefined)).toBe(true);
  });

  it("rechaza el archivo de otra cuenta y la carpeta de antes de otra copropiedad", () => {
    expect(blobEsDeLaCopropiedad(`${HOST}/subidas/${OTRO}/reglamento-AbC123.pdf`, PROP, ADMIN)).toBe(false);
    expect(blobEsDeLaCopropiedad(`${HOST}/property-docs/${OTRA_PROP}/1700000-reglamento.pdf`, PROP, ADMIN)).toBe(false);
  });

  it("sin administrador conocido no vale `subidas/…` de nadie", () => {
    for (const dueno of [null, undefined, ""]) {
      expect(blobEsDeLaCopropiedad(`${HOST}/subidas/${ADMIN}/reglamento.pdf`, PROP, dueno)).toBe(false);
    }
  });

  it("no confunde los insumos mensuales ni otras carpetas con documentos de la copropiedad", () => {
    expect(blobEsDeLaCopropiedad(`${HOST}/monthly/${PROP}/2026-5/1700000-acta.pdf`, PROP, ADMIN)).toBe(false);
    expect(blobEsDeLaCopropiedad(`${HOST}/uploads/1700000-reglamento.pdf`, PROP, ADMIN)).toBe(false);
    expect(blobEsDeLaCopropiedad(`${HOST}/agent-files/${ADMIN}/informe.xlsx`, PROP, ADMIN)).toBe(false);
  });

  it("rechaza los trucos de ruta, los hosts ajenos y lo que no es una URL", () => {
    for (const url of [
      `${HOST}/subidas/${ADMIN}/../${OTRO}/reglamento.pdf`,
      `${HOST}/subidas/${ADMIN}/%2e%2e/${OTRO}/reglamento.pdf`,
      `${HOST}/property-docs/${PROP}/../${OTRA_PROP}/reglamento.pdf`,
      `${HOST}/property-docs/${PROP}/%2e%2e/${OTRA_PROP}/reglamento.pdf`,
      `${HOST}/subidas/${OTRO}/reglamento.pdf?x=/subidas/${ADMIN}/a.pdf`,
      `https://servidor-del-atacante.example/subidas/${ADMIN}/reglamento.pdf`,
      `https://servidor-del-atacante.example/property-docs/${PROP}/reglamento.pdf`,
      `http://abc123.private.blob.vercel-storage.com/subidas/${ADMIN}/reglamento.pdf`,
      "",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(blobEsDeLaCopropiedad(url, PROP, ADMIN), String(url)).toBe(false);
    }
  });

  it("un id de copropiedad vacío o inválido no habilita la carpeta de antes", () => {
    expect(blobEsDeLaCopropiedad(`${HOST}/property-docs/${PROP}/a.pdf`, "", ADMIN)).toBe(false);
    expect(blobEsDeLaCopropiedad(`${HOST}/property-docs/${PROP}/a.pdf`, undefined, ADMIN)).toBe(false);
    expect(blobEsDeLaCopropiedad(`${HOST}/property-docs/${PROP}/a.pdf`, `${PROP}/..`, ADMIN)).toBe(false);
  });
});
