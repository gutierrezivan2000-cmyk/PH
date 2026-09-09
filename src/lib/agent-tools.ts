import type Anthropic from "@anthropic-ai/sdk";
import {
  construirExcel,
  construirWord,
  construirPdf,
  type ArchivoGenerado,
  type SeccionDocumento,
  type HojaCalculo,
} from "@/lib/agent-files";

/**
 * Herramientas que se le ofrecen al modelo en el chat.
 *
 * El chat solo sabía devolver texto: podía redactar un presupuesto perfecto y
 * el administrador tenía que copiarlo a mano a Excel. Con estas herramientas el
 * propio agente produce el archivo y el usuario lo descarga.
 *
 * Las descripciones son parte del producto, no comentarios: son lo único que el
 * modelo lee para decidir CUÁNDO usar cada una, así que dicen explícitamente
 * que no hay que pedir permiso y que el contenido va completo.
 */
export const HERRAMIENTAS_ARCHIVO: Anthropic.Tool[] = [
  {
    name: "generar_hoja_de_calculo",
    description:
      "Genera una hoja de cálculo (.xlsx) descargable y se la entrega al usuario. Úsala SIEMPRE que " +
      "el usuario pida un cuadro, una tabla, un presupuesto, una relación de cartera, un listado de " +
      "unidades o cualquier dato que se trabaje en Excel. No pidas permiso: genera el archivo y " +
      "explica brevemente qué contiene. Incluye TODAS las filas, no un ejemplo.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del archivo, sin extensión. Ej: 'Presupuesto 2026'" },
        hojas: {
          type: "array",
          description: "Una o más hojas. La PRIMERA fila de cada una son los encabezados.",
          items: {
            type: "object",
            properties: {
              nombre: { type: "string", description: "Nombre de la pestaña" },
              filas: {
                type: "array",
                description: "Filas; cada fila es un arreglo de celdas. Los números van como número, no como texto.",
                items: { type: "array", items: { type: ["string", "number", "null"] } },
              },
            },
            required: ["filas"],
          },
        },
      },
      required: ["nombre", "hojas"],
    },
  },
  {
    name: "generar_documento_word",
    description:
      "Genera un documento de Word (.docx) descargable y editable. Úsala cuando el usuario pida un " +
      "acta, una carta, un comunicado, un reglamento, una convocatoria o cualquier texto que vaya a " +
      "editar o firmar después. No pidas permiso: genera el documento con el contenido completo.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del archivo, sin extensión" },
        titulo: { type: "string", description: "Título que encabeza el documento" },
        secciones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              parrafos: {
                type: "array",
                description: "Párrafos. Empieza un párrafo con '- ' para que salga como viñeta.",
                items: { type: "string" },
              },
              tabla: {
                type: "array",
                description: "Tabla opcional; la primera fila son los encabezados.",
                items: { type: "array", items: { type: ["string", "number"] } },
              },
            },
          },
        },
      },
      required: ["nombre", "titulo", "secciones"],
    },
  },
  {
    name: "generar_pdf",
    description:
      "Genera un PDF descargable, listo para imprimir o enviar. Úsala cuando el usuario pida un " +
      "informe, un certificado, un estado de cuenta o algo que se vaya a compartir sin editar. Si el " +
      "documento se va a EDITAR, usa generar_documento_word en su lugar.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del archivo, sin extensión" },
        titulo: { type: "string" },
        secciones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              parrafos: { type: "array", items: { type: "string" } },
              tabla: { type: "array", items: { type: "array", items: { type: ["string", "number"] } } },
            },
          },
        },
      },
      required: ["nombre", "titulo", "secciones"],
    },
  },
];

export const NOMBRES_HERRAMIENTAS = HERRAMIENTAS_ARCHIVO.map((h) => h.name);

/**
 * Ejecuta una herramienta. Devuelve el archivo o un error legible: lo que se le
 * devuelve al modelo como `tool_result` para que pueda explicarlo o reintentar.
 */
export async function ejecutarHerramienta(
  nombre: string,
  entrada: unknown
): Promise<{ archivo?: ArchivoGenerado; error?: string }> {
  const a = (entrada || {}) as {
    nombre?: string;
    titulo?: string;
    hojas?: HojaCalculo[];
    secciones?: SeccionDocumento[];
  };

  try {
    switch (nombre) {
      case "generar_hoja_de_calculo": {
        const hojas = Array.isArray(a.hojas) ? a.hojas : [];
        if (hojas.length === 0 || hojas.every((h) => !h?.filas?.length)) {
          return { error: "No enviaste ninguna fila. Vuelve a llamar la herramienta con los datos completos." };
        }
        return { archivo: await construirExcel(a.nombre || "documento", hojas) };
      }
      case "generar_documento_word": {
        const secciones = Array.isArray(a.secciones) ? a.secciones : [];
        if (secciones.length === 0) {
          return { error: "No enviaste ninguna sección. Vuelve a llamarla con el contenido completo." };
        }
        return { archivo: await construirWord(a.nombre || "documento", a.titulo || "", secciones) };
      }
      case "generar_pdf": {
        const secciones = Array.isArray(a.secciones) ? a.secciones : [];
        if (secciones.length === 0) {
          return { error: "No enviaste ninguna sección. Vuelve a llamarla con el contenido completo." };
        }
        return { archivo: await construirPdf(a.nombre || "documento", a.titulo || "", secciones) };
      }
      default:
        return { error: `Herramienta desconocida: ${nombre}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[agent-tools] ${nombre} falló:`, msg);
    return { error: `No se pudo generar el archivo: ${msg}` };
  }
}
