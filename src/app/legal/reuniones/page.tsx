import type { Metadata } from "next";
import { Mic, Megaphone, ScrollText, Database, TriangleAlert, Users, Ban } from "lucide-react";
import { LegalPage, Section, Item, Correo, Ir, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Reuniones: grabación, transcripción y consentimiento — SOPH.IA",
  description: "Qué debes informar a los asistentes antes de grabar una reunión y qué hace SOPH.IA con el audio y la transcripción.",
};

const fuerte = { color: "var(--ink)" } as const;

export default function ReunionesLegalPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Reuniones: grabación, transcripción y consentimiento"
      intro="La función Reuniones graba o recibe el audio de una reunión, lo transcribe y genera resúmenes, actas y respuestas. Como la voz es un dato personal, estas condiciones explican qué debes informar a los asistentes y qué hacemos con el audio."
    >
      <Section number="01" title="Qué hace la función" icon={Mic}>
        <p>
          Puedes grabar desde tu dispositivo o subir un archivo de audio o video. La plataforma lo transcribe con
          identificación de hablantes, genera un resumen (decisiones, compromisos, votaciones), puede redactar un borrador de
          acta y responde preguntas sobre lo dicho en la reunión.
        </p>
      </Section>

      <Section number="02" title="Tu responsabilidad: avisar y contar con autorización" icon={Megaphone}>
        <p>
          Antes de grabar o subir una reunión debes informar a todos los asistentes, de manera clara y previa, que se grabará
          y transcribirá con inteligencia artificial, para qué se usará y que pueden oponerse. Cuando la ley, el reglamento de
          la copropiedad o el tipo de reunión lo exijan, debes obtener su autorización. Tú eres el responsable del
          tratamiento de esos datos y SOPH.IA actúa como encargado (ver el{" "}
          <Ir a="/legal/encargado">Acuerdo de Encargado</Ir>).
        </p>
        <p>
          Para ayudarte, la grabadora te pide confirmar que informaste a los asistentes antes de empezar y guarda la fecha
          de esa confirmación como constancia. Esa constancia no sustituye tu deber de informar ni la autorización cuando se
          requiera: es solo un registro de que lo confirmaste.
        </p>
      </Section>

      <Section number="03" title="Aviso sugerido para leer a los asistentes" icon={ScrollText}>
        <p>
          «Esta reunión se está grabando y transcribiendo con ayuda de inteligencia artificial para elaborar el acta y un
          resumen. Las grabaciones y transcripciones se tratan conforme a la política de tratamiento de datos personales de la
          administración y se conservan solo el tiempo necesario. Quien no esté de acuerdo puede manifestarlo ahora, antes de
          que empecemos, y podrá solicitar el acceso o la supresión de sus datos escribiendo a la administración.»
        </p>
        <p>Adáptalo a tu copropiedad. No lo uses como único mecanismo si tu reglamento exige otro.</p>
      </Section>

      <Section number="04" title="Qué hacemos con el audio y la transcripción" icon={Database}>
        <ul className="space-y-2">
          <Item>
            <strong style={fuerte}>Procesamiento:</strong> el audio se envía a un proveedor de transcripción (OpenAI) y el
            texto, a un proveedor de modelos de IA (Anthropic) para resumir, redactar el acta y responder preguntas. Ver la{" "}
            <Ir a="/legal/privacidad">Política de Privacidad</Ir>.
          </Item>
          <Item>
            <strong style={fuerte}>Conservación:</strong> el archivo original que subes o grabas se conserva 90 días y luego
            se borra. La transcripción y el audio de trabajo se conservan hasta que borres la reunión.
          </Item>
          <Item>
            <strong style={fuerte}>Borrado:</strong> puedes borrar una reunión en cualquier momento; también puedes pedirnos
            la supresión en <Correo />.
          </Item>
          <Item>
            <strong style={fuerte}>Acceso:</strong> el contenido es visible para tu cuenta. El personal de SOPH.IA no lo ve
            salvo que lo pidas para resolver un problema o por seguridad.
          </Item>
        </ul>
      </Section>

      <Section number="05" title="Límites de la transcripción" icon={TriangleAlert}>
        <p>
          La transcripción, la identificación de hablantes y los resúmenes pueden contener errores, especialmente en nombres,
          cifras, apartamentos, votaciones y audio con ruido o voces superpuestas. El acta generada es un borrador: revísala y
          corrígela antes de firmarla o publicarla. La plataforma es una ayuda; el acta y su contenido siguen siendo
          responsabilidad de quien la firma.
        </p>
      </Section>

      <Section number="06" title="Derechos de los asistentes" icon={Users}>
        <p>
          Quien participa en una reunión grabada puede pedir conocer, rectificar o suprimir sus datos (incluida su voz) al
          administrador responsable o a nosotros; si nos llega a nosotros, lo trasladamos al responsable. El procedimiento está
          en la <Ir a="/legal/habeas-data">Política de Habeas Data</Ir>.
        </p>
      </Section>

      <Section number="07" title="Cuándo no grabar" icon={Ban}>
        <ul className="space-y-2">
          <Item>Si no informaste a los asistentes o alguien se opone y la grabación no es indispensable.</Item>
          <Item>En conversaciones privadas o reuniones con información reservada o sensible que no necesitas registrar.</Item>
          <Item>Cuando participen menores de edad, salvo que cuentes con la autorización de sus representantes.</Item>
        </ul>
      </Section>
    </LegalPage>
  );
}
