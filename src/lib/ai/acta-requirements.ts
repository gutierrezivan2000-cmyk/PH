export interface ActaRequirement {
  item: string;
  status: "completo" | "pendiente";
  detail: string;
}

const ANALYSIS_PROMPT = `Analiza el siguiente acta de reunion de Propiedad Horizontal y evalua si cumple con los requisitos legales segun la Ley 675 de 2001 de Colombia.

Para cada requisito, indica si esta "completo" (la informacion aparece en el acta) o "pendiente" (falta o esta incompleta). En "detail" explica brevemente que encontraste o que falta.

Requisitos a evaluar:
1. Tipo de reunion (ordinaria o extraordinaria)
2. Fecha, hora y lugar de la reunion
3. Convocatoria previa (quien convoco y con cuantos dias de anticipacion)
4. Lista de asistentes con identificacion de unidades
5. Verificacion de quorum (porcentaje de coeficientes presentes)
6. Orden del dia aprobado
7. Desarrollo de cada punto del orden del dia
8. Proposiciones y varios
9. Votaciones con resultados numericos (a favor, en contra, abstenciones)
10. Compromisos y tareas asignadas con responsables
11. Hora de cierre de la reunion
12. Datos para firma del presidente y secretario de la reunion

Responde SOLO con un JSON array valido. Sin explicaciones, sin markdown, sin backticks. Ejemplo:
[{"item":"Tipo de reunion","status":"completo","detail":"Reunion ordinaria del Consejo"},{"item":"Lista de asistentes","status":"pendiente","detail":"No se especifican las unidades de cada asistente"}]`;

export async function analyzeActaRequirements(actaText: string): Promise<ActaRequirement[]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    temperature: 0,
    system: "Eres un analista de documentos legales de Propiedad Horizontal en Colombia. Respondes SOLO con JSON valido, sin backticks ni explicaciones.",
    messages: [{
      role: "user",
      content: `${ANALYSIS_PROMPT}\n\nACTA A ANALIZAR:\n---\n${actaText}\n---`,
    }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch {
    console.error("[acta-requirements] Failed to parse:", text.substring(0, 300));
    return [];
  }
}
