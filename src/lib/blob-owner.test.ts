import { describe, it, expect } from "vitest";
import {
  PREFIJO_SUBIDAS,
  blobAutorizado,
  blobLegadoDePropiedad,
  blobPerteneceA,
  nombreSeguroDeArchivo,
  primerBlobAjeno,
  rutaDeBlob,
  rutaDeSubida,
} from "./blob-owner";

const HOST = "https://abc123.private.blob.vercel-storage.com";
const U1 = "cmabc1234567890xyz";
const U2 = "cmzzz9876543210abc";

describe("blobPerteneceA", () => {
  it("acepta la URL y la ruta de un blob del propio usuario", () => {
    expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads/acta-lk3j2a9f.pdf`, U1)).toBe(true);
    expect(blobPerteneceA(`subidas/${U1}/uploads/acta-lk3j2a9f.pdf`, U1)).toBe(true);
    // El almacenamiento añade un sufijo aleatorio antes de la extensión: la ruta sigue siendo la misma.
    expect(blobPerteneceA(`${HOST}/subidas/${U1}/agent-files/foto-AbC123xYz9.png`, U1)).toBe(true);
    // También las rutas de una sola carpeta bajo el dueño.
    expect(blobPerteneceA(`${HOST}/subidas/${U1}/archivo.pdf`, U1)).toBe(true);
  });

  it("rechaza el blob de otro usuario", () => {
    expect(blobPerteneceA(`${HOST}/subidas/${U2}/uploads/acta.pdf`, U1)).toBe(false);
    expect(blobPerteneceA(`subidas/${U2}/uploads/acta.pdf`, U1)).toBe(false);
  });

  it("rechaza lo que no cuelga de `subidas/<dueño>/<archivo>`", () => {
    // Rutas de antes del cambio y de otras áreas del almacenamiento.
    expect(blobPerteneceA(`${HOST}/uploads/123-acta.pdf`, U1)).toBe(false);
    expect(blobPerteneceA(`${HOST}/monthly/prop1/2026-5/123-acta.pdf`, U1)).toBe(false);
    expect(blobPerteneceA(`${HOST}/generations/gen1/informe.html`, U1)).toBe(false);
    expect(blobPerteneceA(`${HOST}/agent-files/${U1}/informe.xlsx`, U1)).toBe(false);
    // Solo el prefijo y el dueño, sin archivo: no es un blob.
    expect(blobPerteneceA(`${HOST}/subidas/${U1}`, U1)).toBe(false);
    expect(blobPerteneceA(`${HOST}/subidas/${U1}/`, U1)).toBe(false);
    expect(blobPerteneceA(`subidas/${U1}`, U1)).toBe(false);
  });

  it("el dueño debe coincidir EXACTO: ni prefijos del id ni el id como subcadena", () => {
    expect(blobPerteneceA(`${HOST}/subidas/${U1}extra/uploads/a.pdf`, U1)).toBe(false);
    expect(blobPerteneceA(`${HOST}/subidas/${U1.slice(0, 8)}/uploads/a.pdf`, U1)).toBe(false);
    expect(blobPerteneceA(`${HOST}/subidas/x/${U1}/a.pdf`, U1)).toBe(false);
    expect(blobPerteneceA(`${HOST}/otra/subidas/${U1}/a.pdf`, U1)).toBe(false);
  });

  it("un id de usuario vacío o raro no autoriza nada", () => {
    for (const id of ["", ".", "..", "a/b", "a%2Fb", "a b", null, undefined, 42, {}]) {
      expect(blobPerteneceA(`${HOST}/subidas/${String(id)}/uploads/a.pdf`, id)).toBe(false);
    }
    // Aunque el segmento de la ruta fuera `..` o vacío, y el id coincidiera literalmente.
    expect(blobPerteneceA(`${HOST}/subidas/../uploads/a.pdf`, "..")).toBe(false);
    expect(blobPerteneceA(`${HOST}/subidas//uploads/a.pdf`, "")).toBe(false);
  });

  describe("recorridos de ruta", () => {
    it("rechaza `..` aunque el resultado normalizado sería del usuario", () => {
      // Normalizada apunta a U1, pero lo que se evalúa no es una ruta limpia: se rechaza en vez de «arreglarla».
      expect(blobPerteneceA(`${HOST}/subidas/${U2}/../${U1}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/../${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`subidas/${U1}/../${U1}/a.pdf`, U1)).toBe(false);
    });

    it("rechaza `..` para colarse en la carpeta de otro", () => {
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/../${U2}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/../${U2}/uploads/a.pdf`, U2)).toBe(false);
      expect(blobPerteneceA(`subidas/${U1}/../${U2}/a.pdf`, U1)).toBe(false);
    });

    it("rechaza el punto simple y los segmentos de solo puntos", () => {
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/./uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/.../a.pdf`, U1)).toBe(true); // `...` es un nombre, no un salto
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/../`, U1)).toBe(false);
    });

    it("rechaza las dobles barras y la barra final", () => {
      expect(blobPerteneceA(`${HOST}/subidas//${U1}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}//uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}//subidas/${U1}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads/a.pdf/`, U1)).toBe(false);
      expect(blobPerteneceA(`/subidas/${U1}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`//evil.example/subidas/${U1}/uploads/a.pdf`, U1)).toBe(false);
    });

    it("rechaza las barras invertidas", () => {
      expect(blobPerteneceA(`${HOST}/subidas\\${U1}\\uploads\\a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}\\..\\${U2}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`subidas\\${U1}\\a.pdf`, U1)).toBe(false);
    });
  });

  describe("codificaciones", () => {
    it("rechaza la barra codificada en cualquier forma", () => {
      expect(blobPerteneceA(`${HOST}/subidas%2F${U1}%2Fuploads%2Fa.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}%2Fuploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}%2fuploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads%5Ca.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`subidas/${U1}%2Fa.pdf`, U1)).toBe(false);
    });

    it("rechaza el punto codificado (`%2e%2e`) y la doble codificación", () => {
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/%2e%2e/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/%2E%2E/${U2}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/.%2e/${U2}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/%252e%252e/${U2}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/%252fx/a.pdf`, U1)).toBe(false);
    });

    it("rechaza codificaciones malformadas y caracteres que no son de un nombre limpio", () => {
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/%E0%A4%A/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/%/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/a%00.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/a%0d%0a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/mi%20archivo.pdf`, U1)).toBe(false);
    });

    it("decodifica una vez lo inofensivo y compara sobre la ruta decodificada", () => {
      // `%2D` es «-» y `%73` es «s»: la ruta decodificada es la del propio usuario.
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads/acta%2D1.pdf`, U1)).toBe(true);
      expect(blobPerteneceA(`${HOST}/%73ubidas/${U1}/uploads/a.pdf`, U1)).toBe(true);
      // ...y si lo decodificado es de otro, no es del usuario.
      expect(blobPerteneceA(`${HOST}/%73ubidas/${U2}/uploads/a.pdf`, U1)).toBe(false);
    });
  });

  describe("mayúsculas y unicode", () => {
    it("distingue mayúsculas: ni el prefijo ni el dueño se normalizan", () => {
      expect(blobPerteneceA(`${HOST}/Subidas/${U1}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/SUBIDAS/${U1}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1.toUpperCase()}/uploads/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads/a.pdf`, U1.toUpperCase())).toBe(false);
    });

    it("el host sí es insensible a mayúsculas (así lo define la URL)", () => {
      expect(blobPerteneceA(`https://ABC123.Private.Blob.Vercel-Storage.COM/subidas/${U1}/a.pdf`, U1)).toBe(true);
      expect(blobPerteneceA(`HTTPS://abc123.private.blob.vercel-storage.com/subidas/${U1}/a.pdf`, U1)).toBe(true);
    });

    it("rechaza homoglifos y caracteres unicode que imitan la barra o letras", () => {
      expect(blobPerteneceA(`${HOST}/subidas／${U1}／a.pdf`, U1)).toBe(false); // barra de ancho completo
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/․․/${U2}/a.pdf`, U1)).toBe(false); // «․․» (punto de enlace)
      expect(blobPerteneceA(`${HOST}/ſubidas/${U1}/a.pdf`, U1)).toBe(false); // «ſ» (s larga)
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/a\u202Efdp.exe`, U1)).toBe(false); // anulación de derecha a izquierda
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/a\u200B.pdf`, U1)).toBe(false); // espacio de ancho cero
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/señora.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/mi archivo.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/a.pdf\n`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/su\tbidas/${U1}/a.pdf`, U1)).toBe(false);
    });
  });

  describe("consultas, fragmentos y partes de la URL", () => {
    it("rechaza consulta y fragmento: una URL de blob legítima no los lleva", () => {
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads/a.pdf?download=1`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads/a.pdf?`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U1}/uploads/a.pdf#x`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/subidas/${U2}/a.pdf?/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/otra/a.pdf?x=/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`subidas/${U1}/uploads/a.pdf?x=1`, U1)).toBe(false);
    });

    it("rechaza credenciales y puerto en la URL", () => {
      expect(blobPerteneceA(`https://usuario:clave@abc123.private.blob.vercel-storage.com/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`https://abc123.private.blob.vercel-storage.com:8443/subidas/${U1}/a.pdf`, U1)).toBe(false);
    });

    it("una URL sin ruta no pertenece a nadie", () => {
      expect(blobPerteneceA(HOST, U1)).toBe(false);
      expect(blobPerteneceA(`${HOST}/`, U1)).toBe(false);
    });
  });

  describe("URLs que no son del almacenamiento", () => {
    it("rechaza otros hosts aunque la ruta sea la del usuario", () => {
      expect(blobPerteneceA(`https://servidor-del-atacante.example/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`https://blob.vercel-storage.com.atacante.example/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`https://atacante.example/?x=.blob.vercel-storage.com/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`https://abc123.private.blob.vercel-storage.com@atacante.example/subidas/${U1}/a.pdf`, U1)).toBe(false);
    });

    it("exige https", () => {
      expect(blobPerteneceA(`http://abc123.private.blob.vercel-storage.com/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`ftp://abc123.private.blob.vercel-storage.com/subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`file:///subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`javascript:alert(1)//subidas/${U1}/a.pdf`, U1)).toBe(false);
      expect(blobPerteneceA(`data:text/plain,subidas/${U1}/a.pdf`, U1)).toBe(false);
    });

    it("aguanta basura sin lanzar", () => {
      for (const v of [null, undefined, "", " ", "no es una url", 42, {}, [], true, "a".repeat(5000), "/".repeat(100)]) {
        expect(blobPerteneceA(v, U1)).toBe(false);
      }
    });
  });
});

describe("rutaDeBlob", () => {
  it("devuelve la ruta canónica, sin barra inicial", () => {
    expect(rutaDeBlob(`${HOST}/subidas/${U1}/uploads/a.pdf`)).toBe(`subidas/${U1}/uploads/a.pdf`);
    expect(rutaDeBlob(`subidas/${U1}/uploads/a.pdf`)).toBe(`subidas/${U1}/uploads/a.pdf`);
  });

  it("devuelve null para lo que no es una ruta limpia", () => {
    expect(rutaDeBlob(`${HOST}/a/../b.pdf`)).toBeNull();
    expect(rutaDeBlob(`${HOST}/a//b.pdf`)).toBeNull();
    expect(rutaDeBlob(`${HOST}/a/%2e%2e/b.pdf`)).toBeNull();
    expect(rutaDeBlob(`${HOST}/a?b`)).toBeNull();
    expect(rutaDeBlob("https://otro.example/a/b.pdf")).toBeNull();
    expect(rutaDeBlob(`${HOST}/${"a/".repeat(20)}b.pdf`)).toBeNull();
  });
});

describe("blobLegadoDePropiedad", () => {
  it("reconoce los insumos mensuales de antes por la copropiedad", () => {
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop1/2026-5/1700000-acta-AbC123.pdf`, "prop1")).toBe(true);
  });

  it("no sirve para otra copropiedad ni para otras rutas, ni con trucos", () => {
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop2/2026-5/a.pdf`, "prop1")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/uploads/prop1/a.pdf`, "prop1")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/subidas/${U1}/monthly/prop1/a.pdf`, "prop1")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop1/../prop2/a.pdf`, "prop1")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop1%2F..%2Fprop2/a.pdf`, "prop1")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/Monthly/prop1/2026-5/a.pdf`, "prop1")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop1`, "prop1")).toBe(false);
    expect(blobLegadoDePropiedad("https://otro.example/monthly/prop1/2026-5/a.pdf", "prop1")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop1/2026-5/a.pdf`, "")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop1/2026-5/a.pdf`, undefined)).toBe(false);
  });

  it("los documentos de la copropiedad de antes se reconocen solo si se pide esa carpeta", () => {
    const doc = `${HOST}/property-docs/prop1/1700000-reglamento-AbC123.pdf`;
    expect(blobLegadoDePropiedad(doc, "prop1", "property-docs")).toBe(true);
    expect(blobLegadoDePropiedad(doc, "prop1")).toBe(false); // por omisión, solo lo mensual
    expect(blobLegadoDePropiedad(doc, "prop2", "property-docs")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/monthly/prop1/2026-5/a.pdf`, "prop1", "property-docs")).toBe(false);
    expect(blobLegadoDePropiedad(`${HOST}/property-docs/prop1/../prop2/a.pdf`, "prop1", "property-docs")).toBe(false);
  });
});

describe("blobAutorizado y primerBlobAjeno", () => {
  const propio = { name: "a.pdf", url: `${HOST}/subidas/${U1}/uploads/a.pdf` };
  const ajeno = { name: "b.pdf", url: `${HOST}/subidas/${U2}/uploads/b.pdf` };
  const legado = { name: "c.pdf", url: `${HOST}/monthly/prop1/2026-5/c.pdf` };

  it("acepta cualquiera de los ids del usuario", () => {
    expect(blobAutorizado(propio.url, U1)).toBe(true);
    expect(blobAutorizado(propio.url, [U2, U1])).toBe(true);
    expect(blobAutorizado(propio.url, [U2])).toBe(false);
    expect(blobAutorizado(propio.url, [])).toBe(false);
  });

  it("los insumos de antes solo valen si se indica la copropiedad ya verificada", () => {
    expect(blobAutorizado(legado.url, U1)).toBe(false);
    expect(blobAutorizado(legado.url, U1, { propertyId: "prop1" })).toBe(true);
    expect(blobAutorizado(legado.url, U1, { propertyId: "prop2" })).toBe(false);
  });

  it("devuelve el primer archivo ajeno, o null si todos son propios", () => {
    expect(primerBlobAjeno([], U1)).toBeNull();
    expect(primerBlobAjeno([propio], U1)).toBeNull();
    expect(primerBlobAjeno([propio, ajeno, legado], U1)).toBe(ajeno);
    expect(primerBlobAjeno([propio, legado], U1)).toBe(legado);
    expect(primerBlobAjeno([propio, legado], U1, { propertyId: "prop1" })).toBeNull();
  });

  it("un elemento que no es un archivo con url cuenta como ajeno", () => {
    expect(primerBlobAjeno([propio, null], U1)).toEqual({});
    expect(primerBlobAjeno([undefined], U1)).toEqual({});
    expect(primerBlobAjeno(["texto"], U1)).toEqual({});
    expect(primerBlobAjeno([{ name: "x" }], U1)).toEqual({ name: "x" });
    expect(primerBlobAjeno([{ url: 42 }], U1)).toEqual({ url: 42 });
  });
});

describe("rutaDeSubida", () => {
  it("construye `subidas/<id>/<carpeta>/<nombre>-<único>.<ext>` y es una ruta que el dueño reconoce", () => {
    const ruta = rutaDeSubida(U1, "Acta Asamblea 2026.PDF", "uploads");
    expect(ruta.startsWith(`${PREFIJO_SUBIDAS}/${U1}/uploads/Acta_Asamblea_2026-`)).toBe(true);
    expect(ruta.endsWith(".pdf")).toBe(true);
    expect(blobPerteneceA(ruta, U1)).toBe(true);
    expect(blobPerteneceA(ruta, U2)).toBe(false);
  });

  it("no repite la ruta para el mismo archivo", () => {
    const rutas = new Set(Array.from({ length: 200 }, () => rutaDeSubida(U1, "acta.pdf", "uploads")));
    expect(rutas.size).toBe(200);
  });

  it("acepta carpetas anidadas y las sanea", () => {
    const ruta = rutaDeSubida(U1, "reglamento.pdf", "property-docs/cm1prop");
    expect(ruta.startsWith(`subidas/${U1}/property-docs/cm1prop/reglamento-`)).toBe(true);
    expect(blobPerteneceA(ruta, U1)).toBe(true);

    const hostil = rutaDeSubida(U1, "a.pdf", "../../otro//x y/%2e%2e/./z");
    expect(rutaDeBlob(hostil)).not.toBeNull();
    expect(hostil.startsWith(`subidas/${U1}/`)).toBe(true);
    expect(hostil.split("/")).not.toContain("..");
    expect(blobPerteneceA(hostil, U1)).toBe(true);
    // Sin carpeta: el archivo cuelga directo del dueño.
    expect(rutaDeSubida(U1, "a.pdf").split("/")).toHaveLength(3);
  });

  it("un nombre hostil no puede salirse de la carpeta del dueño", () => {
    for (const nombre of ["../../../etc/passwd", "..\\..\\x.pdf", "%2e%2e%2fx.pdf", "a/b/c.pdf", "..", ".", "...", "", "   ", ".pdf", "x".repeat(500) + ".pdf"]) {
      const ruta = rutaDeSubida(U1, nombre, "uploads");
      expect(blobPerteneceA(ruta, U1), nombre).toBe(true);
      expect(blobPerteneceA(ruta, U2), nombre).toBe(false);
      expect(ruta.split("/").slice(0, 3).join("/")).toBe(`subidas/${U1}/uploads`);
      expect(ruta.split("/")).toHaveLength(4);
      expect(ruta.length).toBeLessThan(300);
    }
  });

  it("conserva la extensión (el tope por tipo se decide con ella)", () => {
    expect(rutaDeSubida(U1, "grabación asamblea.MP3", "uploads").endsWith(".mp3")).toBe(true);
    expect(rutaDeSubida(U1, "informe.final.v2.xlsx", "uploads").endsWith(".xlsx")).toBe(true);
    expect(rutaDeSubida(U1, "sin-extension", "uploads")).not.toMatch(/\.[a-z0-9]+$/);
  });

  it("se niega a construir una ruta con un id que no sirve como segmento", () => {
    for (const id of ["", "..", "a/b", "a b", "a%2Fb", undefined as unknown as string]) {
      expect(() => rutaDeSubida(id, "a.pdf", "uploads"), String(id)).toThrow(/sesión/);
    }
  });
});

describe("nombreSeguroDeArchivo", () => {
  it("quita acentos y símbolos, y conserva la extensión en minúsculas", () => {
    expect(nombreSeguroDeArchivo("Señora Peña — Acta #3.PDF")).toBe("Senora_Pena_Acta_3.pdf");
    expect(nombreSeguroDeArchivo("C:\\Users\\yo\\informe.docx")).toBe("informe.docx");
    expect(nombreSeguroDeArchivo("/tmp/a/b/foto.JPG")).toBe("foto.jpg");
  });

  it("nunca devuelve un nombre vacío ni de solo puntos", () => {
    for (const n of ["", "...", "..", "   ", "###", null, undefined]) {
      expect(nombreSeguroDeArchivo(n)).toMatch(/^archivo/);
    }
  });
});
