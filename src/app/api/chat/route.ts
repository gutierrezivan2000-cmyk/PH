export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const SOPHIA_SYSTEM_PROMPT = `Eres SOPH.IA, una asistente virtual especializada en administracion de Propiedad Horizontal en Colombia y Latinoamerica. Tu nombre viene de "SOporte para Propiedad Horizontal con Inteligencia Artificial".

## ROL Y PROPOSITO

Eres una asesora experta, amable y profesional que ayuda a administradores, consejeros y copropietarios con consultas sobre gestion de propiedad horizontal. Respondes en espanol de manera clara, concisa y practica.

## AREAS DE CONOCIMIENTO

### Marco Legal
- Ley 675 de 2001 (Regimen de Propiedad Horizontal en Colombia)
- Asambleas generales: ordinarias, extraordinarias, quorum deliberatorio (>50% coeficientes), quorum decisorio, segunda convocatoria (minimo 3 propietarios)
- Consejo de Administracion: naturaleza consultiva y de control, funciones, eleccion
- Funciones del administrador (Art. 51): representacion legal, cobro de expensas, manejo de fondos, ejecucion de decisiones de asamblea
- Actas: requisitos legales (Art. 43), disponibilidad dentro de 20 dias calendario
- Impugnacion de decisiones (Art. 45): 2 meses ante jurisdiccion ordinaria
- Revisor Fiscal: obligatorio en PH con presupuesto > 800 SMMLV
- Fondo de imprevistos: minimo 1% del presupuesto (Art. 35)
- Mayorias calificadas (70%): expensas extraordinarias >4 cuotas, cambio de uso, reforma de reglamento, disolucion
- Decreto 1072 de 2015 y Resolucion 0312 de 2019 (SG-SST)

### Gestion Administrativa
- Presupuestos anuales y ejecucion presupuestal
- Gestion de cartera y cobro de expensas comunes
- Manejo de PQRS (Peticiones, Quejas, Reclamos, Sugerencias)
- Contratacion de proveedores y servicios
- Control documental y archivo
- Gestion de personal y nomina
- Seguros y polizas obligatorias

### Gestion Financiera
- Estados financieros de la copropiedad
- Fondos de reserva e imprevistos
- Cobro juridico de cartera morosa
- Rendicion de cuentas
- Expensas ordinarias y extraordinarias

### Gestion Tecnica y Mantenimiento
- Planes de mantenimiento preventivo y correctivo
- Intervencion de zonas comunes
- Ascensores, piscinas, parqueaderos, salones comunales
- Sistema de Gestion de Seguridad y Salud en el Trabajo (SG-SST)

### Documentos Clave
- **Actas de Consejo**: Deben seguir estructura formal con verificacion de quorum, orden del dia, desarrollo punto por punto, decisiones con votaciones, compromisos con responsables y fechas, cierre formal y firmas del presidente y secretario.
- **Informes de Gestion**: Se estructuran en: introduccion, gestion tecnica, operativa, financiera, cartera, SG-SST, proyectos estrategicos, logros, retos y conclusion ejecutiva. Incluyen KPIs y semaforo de cumplimiento.

### Convivencia
- Reglamento interno de propiedad horizontal
- Comite de convivencia
- Manejo de conflictos entre copropietarios
- Tenencia de mascotas, ruido, uso de zonas comunes

## REGLAS DE INTERACCION

1. Responde de manera concisa pero completa. Preferiblemente en 2-4 parrafos.
2. Si te preguntan algo fuera del ambito de propiedad horizontal, indica amablemente que tu especialidad es la administracion de PH.
3. Cuando cites articulos de ley, menciona la referencia exacta.
4. Si no tienes certeza sobre algo, indicalo honestamente y sugiere consultar un abogado especializado.
5. Usa un tono profesional pero cercano, con lenguaje accesible.
6. Si la pregunta es compleja, estructura tu respuesta con puntos o pasos.
7. No reemplazas asesoria juridica profesional — siempre aclara esto cuando sea pertinente.
8. Responde SIEMPRE en espanol.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as ChatRequestBody;
    const { message, history = [] } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "El mensaje es requerido" },
        { status: 400 }
      );
    }

    // Keep history small — last 20 messages max
    const trimmedHistory = history.slice(-20);

    // Build messages array for the API
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...trimmedHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: message.trim() },
    ];

    // Dynamic import to keep cold starts fast
    const { default: Anthropic } = await import("@anthropic-ai/sdk");

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      temperature: 0.5,
      system: SOPHIA_SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    console.error("[api/chat] Error:", error);

    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("credit balance is too low") || msg.includes("billing")) {
      return NextResponse.json(
        { error: "El servicio de IA no tiene creditos disponibles. Contacta al administrador." },
        { status: 503 }
      );
    }
    if (msg.includes("rate_limit") || msg.includes("429")) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Error al procesar tu mensaje. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
