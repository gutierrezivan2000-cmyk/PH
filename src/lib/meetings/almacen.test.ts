import { beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const del = vi.fn();
vi.mock("@vercel/blob", () => ({ list: (...a: unknown[]) => list(...a), del: (...a: unknown[]) => del(...a) }));

import {
  borrarArchivosDeReunion, borrarPrefijo, esRutaDeFuente, nombreSeguro, prefijoDeReunion, rutaDeFuente, sufijoAleatorio,
  urlCorrespondeARuta,
} from "./almacen";

const blob = (n: number) => ({ url: `https://x.private.blob.vercel-storage.com/meetings/m1abcdefg/${n}.mp3` });

beforeEach(() => {
  list.mockReset();
  del.mockReset();
});

describe("prefijoDeReunion", () => {
  it("construye meetings/<id>/", () => {
    expect(prefijoDeReunion("cmabc12345xyz")).toBe("meetings/cmabc12345xyz/");
    expect(prefijoDeReunion("reunion-demo-001")).toBe("meetings/reunion-demo-001/");
  });
  it("rechaza ids que podrían salirse de su carpeta", () => {
    for (const id of ["", "a", "../otra", "meetings/x/y", "id con espacio", "x".repeat(65), "abc/def12345"]) {
      expect(() => prefijoDeReunion(id), id).toThrow();
    }
  });
});

describe("borrarPrefijo", () => {
  it("nunca borra con un prefijo vacío, corto o ajeno (vaciaría todo el almacenamiento)", async () => {
    for (const p of ["", "/", "meetings/", "meetings", "documents/abc12345/", "meetings/abc/", "meetings/abc12345", "meetings/../abc12345/"]) {
      await expect(borrarPrefijo(p), p).rejects.toThrow(/no permitido/);
    }
    expect(list).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("recorre todas las páginas y borra por lotes", async () => {
    list
      .mockResolvedValueOnce({ blobs: [blob(1), blob(2)], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [blob(3)], hasMore: false });
    del.mockResolvedValue(undefined);
    const n = await borrarPrefijo("meetings/m1abcdefg/");
    expect(n).toBe(3);
    expect(list).toHaveBeenNthCalledWith(1, { prefix: "meetings/m1abcdefg/", cursor: undefined, limit: 1000 });
    expect(list).toHaveBeenNthCalledWith(2, { prefix: "meetings/m1abcdefg/", cursor: "c1", limit: 1000 });
    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenNthCalledWith(1, [blob(1).url, blob(2).url]);
    expect(del).toHaveBeenNthCalledWith(2, [blob(3).url]);
  });

  it("si no hay nada no llama a del (con un arreglo vacío fallaría)", async () => {
    list.mockResolvedValueOnce({ blobs: [], hasMore: false });
    expect(await borrarPrefijo("meetings/m1abcdefg/")).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });

  it("si el borrado falla, el error sube (la reunión no se elimina a medias sin avisar)", async () => {
    list.mockResolvedValueOnce({ blobs: [blob(1)], hasMore: false });
    del.mockRejectedValueOnce(new Error("blob caído"));
    await expect(borrarPrefijo("meetings/m1abcdefg/")).rejects.toThrow("blob caído");
  });
});

describe("borrarArchivosDeReunion", () => {
  it("borra la carpeta de esa reunión", async () => {
    list.mockResolvedValueOnce({ blobs: [blob(1)], hasMore: false });
    del.mockResolvedValue(undefined);
    expect(await borrarArchivosDeReunion("m1abcdefg")).toBe(1);
    expect(list).toHaveBeenCalledWith({ prefix: "meetings/m1abcdefg/", cursor: undefined, limit: 1000 });
  });
});

describe("nombreSeguro", () => {
  it("quita tildes, espacios y símbolos, y conserva la extensión", () => {
    expect(nombreSeguro("Reunión consejo (1).m4a")).toBe("Reunion-consejo-1.m4a");
    expect(nombreSeguro("  grabación   final!!.MP3 ")).toBe("grabacion-final.MP3");
    expect(nombreSeguro("ñandú — acta.wav")).toBe("nandu-acta.wav");
  });
  it("lo que no deja nada utilizable da un nombre por defecto", () => {
    for (const n of ["", "   ", "!!!", "...", "—"]) expect(nombreSeguro(n), n).toBe("grabacion");
  });
  it("no deja pasar rutas ni puntos peligrosos", () => {
    expect(nombreSeguro("../../etc/passwd")).toBe("etc-passwd");
    expect(nombreSeguro("a/b\\c.mp3")).toBe("a-b-c.mp3");
    expect(nombreSeguro("..hidden.mp3")).toBe("hidden.mp3");
  });
  it("cualquier nombre, por hostil que sea, da una ruta que esRutaDeFuente acepta", () => {
    const hostiles = [
      "a..b.mp3", "....", "../../x", "x/../../y.mp3", "con espacio y ñ.m4a", "%2e%2e/x.mp3", "\u0000nulo.mp3", "😀.mp3",
      "a".repeat(500), ".mp3", "-.-.-", "C:\\Windows\\x.wav", "grabación—larga…final.m4a",
    ];
    for (const n of hostiles) expect(esRutaDeFuente("m1abcdefg", rutaDeFuente("m1abcdefg", n, "ab12cd34")), JSON.stringify(n)).toBe(true);
  });
  it("recorta los nombres largos sin perder la extensión", () => {
    const largo = nombreSeguro(`${"a".repeat(300)}.m4a`);
    expect(largo.length).toBe(120);
    expect(largo.endsWith(".m4a")).toBe(true);
    expect(nombreSeguro("b".repeat(300)).length).toBe(120);
  });
});

describe("rutaDeFuente / esRutaDeFuente", () => {
  const ruta = rutaDeFuente("m1abcdefg", "Reunión 1.m4a", "ab12cd34");
  it("construye meetings/<id>/fuentes/<sufijo>-<nombre>", () => {
    expect(ruta).toBe("meetings/m1abcdefg/fuentes/ab12cd34-Reunion-1.m4a");
    expect(esRutaDeFuente("m1abcdefg", ruta)).toBe(true);
  });
  it("rechaza sufijos que no son de 8 caracteres [a-z0-9]", () => {
    for (const s of ["", "abc", "ABCDEFGH", "ab12cd3!", "ab12cd345"]) expect(() => rutaDeFuente("m1abcdefg", "x.mp3", s), s).toThrow();
  });
  it("solo acepta rutas de ESTA reunión, con la forma exacta", () => {
    expect(esRutaDeFuente("otra12345", ruta)).toBe(false);
    for (const mala of [
      "meetings/m1abcdefg/fuentes/", "meetings/m1abcdefg/fuentes/x.mp3", "meetings/m1abcdefg/norm/ab12cd34-x.mp3",
      "meetings/m1abcdefg/fuentes/ab12cd34-../x.mp3", "meetings/m1abcdefg/fuentes/ab12cd34-a/b.mp3",
      "documents/m1abcdefg/fuentes/ab12cd34-x.mp3", "meetings/m1abcdefg/fuentes/AB12CD34-x.mp3",
      "meetings/m1abcdefg/fuentes/ab12cd34-" + "x".repeat(121), "", null, undefined, 5,
    ]) expect(esRutaDeFuente("m1abcdefg", mala), String(mala)).toBe(false);
  });
  it("una ruta con la forma de otra reunión no pasa aunque el id coincida por prefijo", () => {
    expect(esRutaDeFuente("m1abcdefg", "meetings/m1abcdefgXX/fuentes/ab12cd34-x.mp3")).toBe(false);
  });
});

describe("sufijoAleatorio", () => {
  it("son 8 caracteres [a-z0-9] y casi nunca se repiten", () => {
    const vistos = new Set(Array.from({ length: 200 }, sufijoAleatorio));
    for (const s of vistos) expect(s).toMatch(/^[a-z0-9]{8}$/);
    expect(vistos.size).toBeGreaterThan(195);
  });
});

describe("urlCorrespondeARuta", () => {
  const ruta = "meetings/m1abcdefg/fuentes/ab12cd34-Reunion-1.m4a";
  it("la URL del blob lleva la ruta tras el dominio", () => {
    expect(urlCorrespondeARuta(`https://abc.private.blob.vercel-storage.com/${ruta}`, ruta)).toBe(true);
  });
  it("rechaza otra ruta, otra carpeta o una URL rota", () => {
    expect(urlCorrespondeARuta("https://abc.private.blob.vercel-storage.com/meetings/otra/fuentes/ab12cd34-x.mp3", ruta)).toBe(false);
    expect(urlCorrespondeARuta(`https://abc.private.blob.vercel-storage.com/${ruta}.extra`, ruta)).toBe(false);
    expect(urlCorrespondeARuta("no es una url", ruta)).toBe(false);
  });
});
