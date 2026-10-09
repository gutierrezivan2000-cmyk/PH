/**
 * Las herramientas de OPERACIÓN de los agentes (además de las de generar archivos): consultar el detalle de cualquier módulo,
 * guardar en la memoria de la copropiedad y proponer acciones (que la persona aprueba). Las usan los seis agentes por igual.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { MODULO_DE_ACCION, TIPOS_DE_ACCION, ETIQUETA_DE_ACCION } from "./acciones";
import { proponerAccion } from "./acciones-ejecutar";
import type { Visibles } from "./briefing-datos";
import { SECCIONES, TIPOS_DE_NOTA, consultarOperacion, guardarNota } from "./consultas";

export const NOMBRES_DE_OPERACION = ["consultar_operacion", "guardar_en_memoria", "proponer_accion"] as const;
export type NombreDeOperacion = (typeof NOMBRES_DE_OPERACION)[number];
export const esHerramientaDeOperacion = (n: string): n is NombreDeOperacion => (NOMBRES_DE_OPERACION as readonly string[]).includes(n);

export const HERRAMIENTAS_OPERACION: Anthropic.Tool[] = [
  {
    name: "consultar_operacion",
    description:
      "Consulta datos REALES de una copropiedad en la plataforma (cartera, presupuesto, PQRS, reuniones, calendario, reglamento, actividad reciente, memoria, comunicados, asambleas, certificados, bitácora). Úsala siempre que necesites una cifra o un hecho: nunca inventes datos. El briefing del sistema ya trae un resumen; esta herramienta da el detalle.",
    input_schema: {
      type: "object",
      properties: {
        seccion: { type: "string", enum: [...SECCIONES], description: "Qué consultar. «morosos»: lista de unidades en mora. «unidad»: estado de cuenta de una unidad (pide `unidad`). «reglamento»: fragmentos del reglamento relevantes a `consulta`. «reuniones»: lista, o el detalle de una con `reunionId`." },
        propertyId: { type: "string", description: "Id de la copropiedad. Si falta, se usa la que está en foco." },
        unidad: { type: "string", description: "Etiqueta de la unidad, p. ej. «Apto 502» (sección «unidad»)." },
        anio: { type: "integer", description: "Año del presupuesto (por defecto, el actual)." },
        estado: { type: "string", description: "Para «pqrs»: «abiertas» (por defecto) o «todas»." },
        dias: { type: "integer", description: "Ventana en días para «calendario» (7–180) y «actividad» (1–60)." },
        consulta: { type: "string", description: "Para «reglamento»: el tema o pregunta a buscar." },
        reunionId: { type: "string", description: "Id de una reunión para ver sus decisiones, compromisos y votaciones." },
      },
      required: ["seccion"],
    },
  },
  {
    name: "guardar_en_memoria",
    description:
      "Guarda una nota en la memoria de la copropiedad que TODOS los agentes verán. Queda marcada como propuesta de un agente, sin confirmar: no es una decisión del consejo ni una preferencia de la administración hasta que la persona la confirme. Úsala para hechos útiles que no consten ya en los módulos. Una idea por nota, breve y concreta. No guardes datos personales de residentes ni texto copiado de un residente.",
    input_schema: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Id de la copropiedad (por defecto, la que está en foco)." },
        tipo: { type: "string", enum: [...TIPOS_DE_NOTA], description: "Se guarda siempre como nota propuesta; «decision» y «preferencia» se aceptan pero las confirma la persona." },
        contenido: { type: "string", description: "La nota (8–600 caracteres)." },
      },
      required: ["contenido"],
    },
  },
  {
    name: "proponer_accion",
    description:
      `Propone una acción en la plataforma. NO se ejecuta: la persona ve una tarjeta con lo que ocurriría y la aprueba o la rechaza. Úsala cuando la persona te pida hacer algo (registrar un pago, anotar un movimiento, responder una PQRS, agregar una póliza). Antes de proponerla verifica los datos con consultar_operacion. Acciones: ${TIPOS_DE_ACCION.map((t) => `${t} (${ETIQUETA_DE_ACCION[t]}${MODULO_DE_ACCION[t] ? `, módulo ${MODULO_DE_ACCION[t]}` : ""})`).join("; ")}.`,
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: [...TIPOS_DE_ACCION] },
        propertyId: { type: "string", description: "Id de la copropiedad." },
        datos: {
          type: "object",
          description:
            "registrar_pago: {unidad, monto (pesos), metodo (efectivo|transferencia|consignacion|otro), referencia?, fecha? (AAAA-MM-DD)}. registrar_movimiento_presupuesto: {concepto, tipo (ingreso|gasto|fondo_aporte|fondo_retiro), monto, fecha?, rubro?}. responder_pqrs: {codigo (PQR-XXXXXX), respuesta, estado? (en_proceso|resuelto|cerrado)}. agregar_a_bitacora: {nombre, tipo (poliza|zona_comun), fecha (AAAA-MM-DD), proveedor?, referencia?, recurrenciaMeses?}.",
        },
      },
      required: ["tipo", "propertyId", "datos"],
    },
  },
];

export type ContextoDeOperacion = { userId: string; agentId: string; chatId: string | null; visibles: Visibles; enFoco: string | null };

export type PropuestaParaLaInterfaz = { id: string; tipo: string; etiqueta: string; resumen: string; propiedad: string };

/** Ejecuta una herramienta de operación. Devuelve el texto para el modelo y, si propuso una acción, la tarjeta para la persona. */
export async function ejecutarOperacion(nombre: NombreDeOperacion, entrada: Record<string, unknown>, ctx: ContextoDeOperacion): Promise<{ texto: string; esError: boolean; propuesta?: PropuestaParaLaInterfaz }> {
  try {
    if (nombre === "consultar_operacion") return { texto: await consultarOperacion(ctx.userId, ctx.visibles, ctx.enFoco, entrada), esError: false };
    if (nombre === "guardar_en_memoria") {
      const r = await guardarNota(ctx.userId, ctx.agentId, ctx.enFoco, entrada);
      return { texto: r, esError: !r.startsWith("Nota guardada") };
    }
    const r = await proponerAccion(
      { userId: ctx.userId, agentId: ctx.agentId, chatId: ctx.chatId, visibles: ctx.visibles },
      { tipo: entrada.tipo, propertyId: entrada.propertyId ?? ctx.enFoco, datos: entrada.datos },
    );
    if (!r.ok) return { texto: `No se pudo proponer la acción: ${r.error}`, esError: true };
    return {
      texto: `Acción propuesta y mostrada a la persona para su aprobación: «${r.resumen}». Todavía NO se ejecutó. Dile qué propusiste y que la apruebe o la rechace en la tarjeta; no digas que ya está hecha.`,
      esError: false,
      propuesta: { id: r.id, tipo: r.tipo, etiqueta: r.etiqueta, resumen: r.resumen, propiedad: r.propiedad },
    };
  } catch (e) {
    console.error(`[agentes/herramientas] ${nombre}:`, e instanceof Error ? e.message : e);
    return { texto: "No pude completar esa consulta ahora. Intenta de nuevo o dile a la persona que la haga desde el módulo.", esError: true };
  }
}
