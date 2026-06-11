import type { Metadata } from "next";
import {
  FileText,
  UserPlus,
  CreditCard,
  Ban,
  Bot,
  Copyright,
  ShieldAlert,
  CircleX,
  Landmark,
} from "lucide-react";
import { LegalPage, Section, Item } from "../legal-shell";

export const metadata: Metadata = {
  title: "Términos y Condiciones — SOPH.IA",
  description:
    "Términos y Condiciones de Uso de SOPH.IA, la plataforma de inteligencia artificial para administradores de propiedad horizontal en Colombia.",
};

export default function TerminosPage() {
  return (
    <LegalPage
      eyebrow="Legal · Última actualización: junio 2026"
      title="Términos y Condiciones de Uso"
      intro="Estos Términos y Condiciones regulan el acceso y uso de la plataforma SOPH.IA. Al registrarse o utilizar el servicio, el usuario declara haberlos leído, entendido y aceptado en su integridad."
      disclaimer
    >
      <Section number="01" title="Objeto del servicio" icon={FileText}>
        <p>
          SOPH.IA es una plataforma de software como servicio (SaaS) que
          asiste a administradores de propiedad horizontal en Colombia en la
          generación de documentos de gestión mediante inteligencia
          artificial, incluyendo —entre otros— actas de consejo y de
          asamblea, informes de gestión, comunicados y presentaciones.
        </p>
        <p>
          El servicio se presta en línea, bajo modalidad de suscripción, y
          comprende el acceso a las funcionalidades habilitadas según el plan
          contratado. SOPH.IA podrá actualizar, mejorar o modificar
          funcionalidades de la plataforma, procurando mantener o aumentar la
          calidad del servicio.
        </p>
      </Section>

      <Section number="02" title="Registro y cuentas" icon={UserPlus}>
        <p>
          Para utilizar el servicio, el usuario debe crear una cuenta
          suministrando información veraz, completa y actualizada. El usuario
          es el único responsable de la exactitud de los datos registrados y
          de mantenerlos al día.
        </p>
        <p>
          Las credenciales de acceso son personales e intransferibles. El
          usuario es responsable de su custodia y de toda actividad realizada
          desde su cuenta. Ante cualquier uso no autorizado, deberá
          notificarlo de inmediato a soporte@sophiagrouph.com.
        </p>
        <p>
          El servicio está dirigido exclusivamente a personas mayores de
          edad con capacidad legal para contratar conforme a la legislación
          colombiana.
        </p>
      </Section>

      <Section number="03" title="Planes, pagos y facturación" icon={CreditCard}>
        <p>
          SOPH.IA ofrece los siguientes planes de suscripción mensual:
        </p>
        <ul className="space-y-2">
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Plan Pro:</strong> USD $20
            por mes.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Plan Elite:</strong> USD
            $200 por mes.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Add-ons (complementos):</strong>{" "}
            USD $5 por mes, cada uno.
          </Item>
        </ul>
        <p>
          Los pagos se procesan a través de la pasarela de pagos ePayco. La
          suscripción se renueva automáticamente al final de cada periodo,
          salvo cancelación previa por parte del usuario.
        </p>
        <p>
          Los nuevos usuarios cuentan con una prueba gratuita de 7 días.
          Vencida la prueba sin cancelación, se efectuará el primer cobro del
          plan seleccionado. La cancelación surte efectos al término del
          periodo en curso: no se realizan reembolsos parciales por
          fracciones del periodo ya facturado.
        </p>
      </Section>

      <Section number="04" title="Uso aceptable" icon={Ban}>
        <p>El usuario se compromete a no:</p>
        <ul className="space-y-2">
          <Item>
            Abusar del servicio, sobrecargar la infraestructura o intentar
            eludir límites técnicos o de plan.
          </Item>
          <Item>
            Realizar extracción automatizada de datos (scraping), ingeniería
            inversa o acceso no autorizado a la plataforma.
          </Item>
          <Item>
            Revender, sublicenciar o comercializar el acceso al servicio sin
            autorización escrita de SOPH.IA.
          </Item>
          <Item>
            Utilizar la plataforma para fines ilícitos o contrarios a estos
            términos.
          </Item>
        </ul>
        <p>
          El incumplimiento de esta sección faculta a SOPH.IA para suspender
          o terminar la cuenta, sin perjuicio de las acciones legales a que
          haya lugar.
        </p>
      </Section>

      <Section number="05" title="Contenido generado por IA" icon={Bot}>
        <p>
          Los documentos producidos por la plataforma son borradores
          asistidos por inteligencia artificial, elaborados a partir de la
          información suministrada por el usuario. El usuario es el único
          responsable de revisar, verificar y validar el contenido antes de
          darle cualquier uso legal, contable o administrativo.
        </p>
        <p>
          SOPH.IA no presta asesoría jurídica y no sustituye el criterio de
          un abogado, contador o profesional competente. Las referencias
          normativas incluidas en los documentos (por ejemplo, a la Ley 675
          de 2001) tienen carácter orientativo y deben ser confirmadas por el
          usuario o su asesor.
        </p>
      </Section>

      <Section number="06" title="Propiedad intelectual" icon={Copyright}>
        <p>
          El usuario conserva todos los derechos sobre los datos que carga a
          la plataforma y sobre los documentos generados a partir de ellos.
          SOPH.IA no reclama titularidad alguna sobre dicho contenido.
        </p>
        <p>
          SOPH.IA conserva la titularidad de la plataforma, su código,
          diseño, marcas, logotipos, plantillas y demás elementos del
          servicio. La suscripción otorga una licencia de uso limitada, no
          exclusiva e intransferible, vigente mientras dure la suscripción.
        </p>
      </Section>

      <Section number="07" title="Limitación de responsabilidad" icon={ShieldAlert}>
        <p>
          El servicio se presta &quot;tal cual&quot; y &quot;según
          disponibilidad&quot;. SOPH.IA procura una alta disponibilidad, pero
          no garantiza que el servicio sea ininterrumpido o esté libre de
          errores.
        </p>
        <p>
          En la máxima medida permitida por la ley colombiana, SOPH.IA no
          será responsable por daños indirectos, lucro cesante o perjuicios
          derivados del uso de documentos no revisados por el usuario. En
          todo caso, la responsabilidad total de SOPH.IA se limitará al
          valor pagado por el usuario durante los tres (3) meses anteriores
          al hecho que origine la reclamación.
        </p>
      </Section>

      <Section number="08" title="Terminación" icon={CircleX}>
        <p>
          El usuario puede cancelar su suscripción en cualquier momento desde
          la plataforma; el acceso se mantendrá hasta el final del periodo
          facturado.
        </p>
        <p>
          SOPH.IA podrá suspender o terminar el servicio ante incumplimiento
          de estos términos, mora en el pago o uso indebido de la
          plataforma. Tras la terminación, el usuario podrá solicitar la
          exportación de sus datos dentro de los treinta (30) días
          siguientes, vencidos los cuales podrán ser eliminados de forma
          segura.
        </p>
      </Section>

      <Section number="09" title="Ley aplicable y jurisdicción" icon={Landmark}>
        <p>
          Estos términos se rigen por las leyes de la República de Colombia.
          Cualquier controversia derivada de su interpretación o ejecución
          será sometida a los jueces y tribunales competentes de la
          República de Colombia, previa búsqueda de un arreglo directo entre
          las partes.
        </p>
        <p>
          Para cualquier consulta sobre estos términos, escríbanos a{" "}
          <a
            href="mailto:soporte@sophiagrouph.com"
            className="underline underline-offset-2"
            style={{ color: "#9a7fff" }}
          >
            soporte@sophiagrouph.com
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
