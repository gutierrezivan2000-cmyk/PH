import type { Metadata } from "next";
import { Brain, TriangleAlert, UserCheck, Scale, Database, Megaphone } from "lucide-react";
import { LegalPage, Section, Item, Correo, Ir, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Uso de Inteligencia Artificial — SOPH.IA",
  description: "Alcance, límites y proveedores de los documentos, resúmenes y respuestas asistidos por inteligencia artificial en SOPH.IA.",
};


export default function IaPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Uso de Inteligencia Artificial"
      intro="SOPH.IA usa modelos de inteligencia artificial para ayudarte a redactar, resumir, transcribir y responder. Es una ayuda potente, pero no infalible. Este documento explica sus límites y cómo usarla con responsabilidad."
    >
      <Section number="01" title="Qué hace la IA en la plataforma" icon={Brain}>
        <p>
          Redacta borradores de actas, informes y comunicados; extrae datos de archivos; transcribe y resume reuniones;
          responde preguntas de los asistentes virtuales y del asistente del reglamento. Los modelos son de terceros
          (Anthropic y OpenAI) y se acceden por API; ver la <Ir a="/legal/privacidad">Política de Privacidad</Ir>.
        </p>
      </Section>

      <Section number="02" title="Límites que debes conocer" icon={TriangleAlert}>
        <ul className="space-y-2">
          <Item>La IA puede equivocarse: inventar datos, omitir información, confundir cifras, nombres o fechas, o malinterpretar un texto.</Item>
          <Item>Las referencias a normas (por ejemplo, la Ley 675 de 2001) son orientativas y pueden estar incompletas o desactualizadas.</Item>
          <Item>Las respuestas del asistente del reglamento se basan en el texto que se cargó; si ese texto es incompleto, la respuesta también lo será.</Item>
          <Item>La transcripción de audio puede fallar con ruido, acentos o voces superpuestas.</Item>
        </ul>
      </Section>

      <Section number="03" title="Siempre hay una persona a cargo" icon={UserCheck}>
        <p>
          Todo resultado es un borrador. Revísalo, corrígelo y valídalo antes de firmarlo, publicarlo, enviarlo o cobrarlo.
          SOPH.IA no presta asesoría jurídica, contable ni financiera y no reemplaza a un abogado, contador u otro profesional.
          La responsabilidad por el uso del resultado es de quien lo usa (ver los{" "}
          <Ir a="/legal/terminos">Términos y Condiciones</Ir>).
        </p>
      </Section>

      <Section number="04" title="Decisiones que afectan a personas" icon={Scale}>
        <p>
          No uses la IA como único fundamento para imponer sanciones, multas, restricciones o cobros a residentes. Esas
          decisiones deben respetar el debido proceso, el reglamento de propiedad horizontal y la ley, y ser tomadas y
          motivadas por la persona o el órgano competente, después de verificar los hechos.
        </p>
      </Section>

      <Section number="05" title="Tus datos y la IA" icon={Database}>
        <p>
          Enviamos a los modelos solo lo necesario para cada función. Los proveedores de IA se contratan por API y, según
          sus condiciones vigentes, no usan por defecto esos datos para entrenar sus modelos; SOPH.IA tampoco usa tu contenido
          para entrenar modelos propios. Evita cargar datos sensibles o innecesarios.
        </p>
      </Section>

      <Section number="06" title="Transparencia y reportes" icon={Megaphone}>
        <p>
          Cuando corresponda, indica a los destinatarios que un documento fue elaborado con ayuda de inteligencia artificial.
          Si detectas un error grave, un contenido inapropiado o un uso indebido, escríbenos a <Correo /> y lo revisaremos.
        </p>
      </Section>
    </LegalPage>
  );
}
