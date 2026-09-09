import type { AgentId } from "@/lib/agents";

/**
 * Preguntas de arranque por agente.
 *
 * La pantalla vacía mostraba solo el nombre y una descripción: el usuario se
 * quedaba mirando un cursor sin saber qué se le puede pedir. Estas sugerencias
 * son concretas y del oficio —no «hazme una pregunta»— y además enseñan de paso
 * lo que el agente sabe hacer, incluidos los archivos que ahora puede generar.
 */
export const SUGERENCIAS: Record<AgentId, { titulo: string; prompt: string }[]> = {
  themis: [
    {
      titulo: "Mayoría para aprobar el presupuesto",
      prompt: "¿Qué mayoría exige la Ley 675 para aprobar el presupuesto anual en asamblea ordinaria y cómo se calcula el quórum?",
    },
    {
      titulo: "Sancionar a un copropietario moroso",
      prompt: "¿Qué puede y qué no puede hacer la administración frente a un copropietario en mora? Explícame los límites legales.",
    },
    {
      titulo: "Revisar una cláusula del reglamento",
      prompt: "Te voy a pasar una cláusula de nuestro reglamento y quiero que me digas si se ajusta a la Ley 675.",
    },
    {
      titulo: "Convocatoria de asamblea extraordinaria",
      prompt: "Redacta la convocatoria de una asamblea extraordinaria y entrégamela en Word para editarla.",
    },
  ],
  chronos: [
    {
      titulo: "Calendario del año",
      prompt: "Ármame el calendario de obligaciones legales del administrador para este año y entrégamelo en Excel.",
    },
    {
      titulo: "Plazos de una asamblea",
      prompt: "¿Con cuántos días de anticipación debo convocar la asamblea ordinaria y en qué plazo debo publicar el acta?",
    },
    {
      titulo: "Vencimientos del próximo mes",
      prompt: "¿Qué obligaciones y vencimientos debería tener en el radar el próximo mes?",
    },
    {
      titulo: "Plazo para impugnar",
      prompt: "¿Cuánto tiempo tiene un copropietario para impugnar una decisión de la asamblea y desde cuándo cuenta?",
    },
  ],
  metra: [
    { titulo: "Analizar el presupuesto", prompt: "Analiza la ejecución del presupuesto de este mes y dime dónde nos estamos desviando." },
    { titulo: "Estado de la cartera", prompt: "Prepárame un cuadro de la cartera por edades de mora, en Excel." },
    { titulo: "Proyección de cuota", prompt: "¿Cuánto debería subir la cuota de administración el próximo año para cubrir la inflación y el fondo de imprevistos?" },
    { titulo: "Fondo de imprevistos", prompt: "¿Cuánto deberíamos tener en el fondo de imprevistos y cómo se calcula según la Ley 675?" },
  ],
  nomethes: [
    { titulo: "Comparar propuestas", prompt: "Tengo tres cotizaciones para el mantenimiento del ascensor. Ayúdame a compararlas y decidir." },
    { titulo: "Riesgos de una decisión", prompt: "¿Qué riesgos tiene cambiar la empresa de vigilancia a mitad de año?" },
    { titulo: "Cambiar de proveedor", prompt: "¿Conviene contratar el aseo por outsourcing o con personal propio? Compárame las dos opciones." },
    { titulo: "Priorizar obras", prompt: "Tengo presupuesto limitado y tres obras pendientes. Ayúdame a priorizarlas." },
  ],
  hermes: [
    { titulo: "Comunicado de corte de agua", prompt: "Redacta un comunicado para los residentes avisando de un corte de agua programado." },
    { titulo: "Carta de cobro respetuosa", prompt: "Escribe una carta de cobro firme pero respetuosa para un copropietario con tres meses de mora." },
    { titulo: "Responder una queja", prompt: "Un residente se quejó por ruido de obra fuera de horario. Ayúdame a responderle." },
    { titulo: "Circular de convivencia", prompt: "Redacta una circular recordando las normas de uso del salón social y entrégamela en Word." },
  ],
  logistes: [
    { titulo: "Plan de mantenimiento", prompt: "Ármame el plan de mantenimiento preventivo del edificio para el año, en Excel." },
    { titulo: "Checklist de proveedor", prompt: "¿Qué debo exigirle a un proveedor de mantenimiento de ascensores antes de contratarlo?" },
    { titulo: "Inventario de zonas comunes", prompt: "Ayúdame a armar el inventario de zonas comunes con su estado y periodicidad de mantenimiento." },
    { titulo: "Protocolo de emergencia", prompt: "Prepárame un protocolo de emergencia para inundación en sótanos." },
  ],
};
