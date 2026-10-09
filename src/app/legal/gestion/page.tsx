import type { Metadata } from "next";
import {
  Compass,
  Wallet,
  Megaphone,
  BadgeCheck,
  Calculator,
  Vote,
  MessageSquareWarning,
  Users,
} from "lucide-react";
import { LegalPage, Section, Item, Correo, Ir, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Condiciones de los módulos de gestión — SOPH.IA",
  description:
    "Condiciones de uso de Cartera, Presupuesto, Certificados, Asambleas, Comunicados y PQRS de SOPH.IA: responsabilidades del administrador y de la plataforma.",
};

const fuerte = { color: "var(--ink)" } as const;

export default function GestionLegalPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Condiciones de los módulos de gestión"
      intro="Cartera, Presupuesto, Certificados, Asambleas, Comunicados y PQRS tocan dinero, derechos de voto y comunicaciones con residentes. Estas condiciones dicen qué hace SOPH.IA, qué te corresponde a ti como administrador y qué debes verificar antes de actuar. Complementan los Términos y Condiciones."
    >
      <Section number="01" title="Qué es SOPH.IA en estos módulos" icon={Compass}>
        <p>
          SOPH.IA es una plataforma que organiza con inteligencia artificial la información y los documentos de tu gestión.
          No es una entidad financiera, no recibe ni custodia dinero, no es una firma de abogados, de contadores ni de cobranza,
          y no sustituye al revisor fiscal, al contador ni al consejo de administración.
        </p>
        <p>
          Tú eres el responsable de las decisiones que tomes con lo que la plataforma calcula, redacta o registra, y de que
          cumplan la Ley 675 de 2001, el reglamento de propiedad horizontal de tu copropiedad y las demás normas aplicables.
          Los resultados de la IA son borradores: revísalos antes de usarlos (ver <Ir a="/legal/ia">Uso de Inteligencia Artificial</Ir>).
        </p>
      </Section>

      <Section number="02" title="Cartera y recaudo" icon={Wallet}>
        <ul className="space-y-2">
          <Item>
            <strong style={fuerte}>El dinero no pasa por SOPH.IA.</strong> Cada administración usa su propia pasarela o cuenta de
            recaudo (por ejemplo, su comercio en ePayco). Los pagos llegan directamente a esa cuenta; SOPH.IA solo registra y
            concilia lo que la pasarela confirma.
          </Item>
          <Item>
            <strong style={fuerte}>Credenciales:</strong> eres responsable de configurar las claves de tu pasarela, de custodiarlas y
            de revocarlas si se comprometen. SOPH.IA las guarda para operar el recaudo en tu nombre.
          </Item>
          <Item>
            <strong style={fuerte}>Conciliación:</strong> un pago se acredita cuando la pasarela lo confirma. Los pagos en revisión,
            rechazados o con diferencias deben resolverse con tu pasarela; revisa periódicamente los que queden pendientes.
          </Item>
          <Item>
            <strong style={fuerte}>Intereses de mora:</strong> el interés de mora de las expensas tiene un límite legal (Ley 675 de
            2001, artículo 30, ligado al interés bancario corriente certificado y al tope de usura). La tasa que configures es
            tu responsabilidad; verifícala contra la certificación vigente.
          </Item>
          <Item>
            <strong style={fuerte}>Exactitud de los datos:</strong> coeficientes, cuotas, saldos y cobros dependen de lo que registres
            o importes. Revisa los totales antes de cobrar o certificar.
          </Item>
          <Item>
            <strong style={fuerte}>Anulaciones:</strong> corrige errores con anulaciones y ajustes registrados, no borrando
            movimientos, para conservar el rastro.
          </Item>
        </ul>
      </Section>

      <Section number="03" title="Cobranza y comunicaciones a residentes" icon={Megaphone}>
        <ul className="space-y-2">
          <Item>Las cartas de cobro y los comunicados deben ser veraces, respetuosos y basarse en deudas reales y verificadas. No incluyas amenazas, información de terceros ni datos que no necesites.</Item>
          <Item>
            Respeta las reglas sobre el contacto para cobro de obligaciones (por ejemplo, horarios y frecuencia de la Ley 2300 de
            2023, cuando te sea aplicable) y las preferencias del residente.
          </Item>
          <Item>
            Los correos salen en tu nombre y a los contactos que registraste. Debes tener la base legal o la autorización para
            escribirles; la plataforma incluye un mecanismo para darse de baja y respeta las bajas y los rebotes.
          </Item>
          <Item>No uses la plataforma para correo no solicitado ni para fines distintos de la administración de tu copropiedad. Podemos limitar o suspender envíos que afecten la entrega de correo de otros clientes.</Item>
        </ul>
      </Section>

      <Section number="04" title="Certificados y paz y salvo" icon={BadgeCheck}>
        <ul className="space-y-2">
          <Item>Un certificado refleja el estado de la unidad <strong style={fuerte}>en el momento de emitirlo</strong>; la plataforma guarda ese saldo y la fecha de emisión.</Item>
          <Item>Eres responsable de emitir solo certificados verdaderos. Un paz y salvo con saldo pendiente no debe emitirse; si te equivocas, revócalo: la revocación es definitiva y queda con motivo y fecha.</Item>
          <Item>La verificación pública por código o QR confirma que el certificado existe y está vigente; muestra datos mínimos y no reemplaza la verificación directa con la administración.</Item>
        </ul>
      </Section>

      <Section number="05" title="Presupuesto" icon={Calculator}>
        <p>
          El módulo ayuda a planear y a seguir la ejecución del presupuesto y el fondo de imprevistos. No es un sistema contable
          (NIIF) ni sustituye los libros, los estados financieros ni el dictamen del revisor fiscal o del contador. El presupuesto
          lo aprueba la asamblea: la plataforma solo registra lo que le indiques.
        </p>
      </Section>

      <Section number="06" title="Asambleas y votación" icon={Vote}>
        <ul className="space-y-2">
          <Item>
            <strong style={fuerte}>La asamblea la rige la ley y tu reglamento.</strong> La plataforma calcula quórum y mayorías por
            coeficiente a partir de los datos y poderes que registres (Ley 675 de 2001, artículos 45 y 46), pero verificar la
            asistencia, los poderes y el resultado es responsabilidad de quien preside la asamblea y de la administración.
          </Item>
          <Item>
            <strong style={fuerte}>Propietarios en mora:</strong> la ley limita el voto de quien no está al día; aplica esa regla
            con el estado de cuenta verificado y deja constancia.
          </Item>
          <Item>
            <strong style={fuerte}>Votación electrónica y reuniones no presenciales:</strong> solo úsalas cuando la ley y tu reglamento
            lo permitan y con la convocatoria y los medios que garanticen la participación de todos. Cada unidad (o poder) emite un
            voto, no se puede modificar después de emitido y el sistema guarda un registro de auditoría. El voto electrónico tiene validez
            como mensaje de datos (Ley 527 de 1999) en la medida en que se cumplan esos requisitos.
          </Item>
          <Item>
            <strong style={fuerte}>Fallas técnicas:</strong> si hay una interrupción durante una votación, quien preside decide cómo
            repetirla o suspenderla, y debe quedar constancia en el acta.
          </Item>
          <Item>
            <strong style={fuerte}>El acta:</strong> el borrador con IA usa la asistencia y los resultados registrados, pero el acta oficial
            la firman y responden las personas que la ley señala. Revísala antes de firmarla.
          </Item>
        </ul>
      </Section>

      <Section number="07" title="PQRS y proceso sancionatorio" icon={MessageSquareWarning}>
        <ul className="space-y-2">
          <Item>Las peticiones, quejas, reclamos y sugerencias que radiquen los residentes quedan en tu bandeja. La plataforma te muestra plazos de respuesta de referencia (15 días hábiles, por analogía con la Ley 1755 de 2015); cumplirlos es tu responsabilidad.</Item>
          <Item>Las respuestas sugeridas por IA se basan en el reglamento cargado y pueden ser incompletas: revísalas antes de enviarlas.</Item>
          <Item>
            Las sanciones por incumplimiento de obligaciones no pecuniarias solo pueden imponerlas el órgano competente, con debido proceso
            (comunicación de los hechos, oportunidad de descargos y decisión motivada; Ley 675 de 2001, artículo 59, y el artículo 29 de la
            Constitución). La plataforma ofrece plantillas y seguimiento, pero no decide ni impone sanciones.
          </Item>
        </ul>
      </Section>

      <Section number="08" title="Datos de los residentes" icon={Users}>
        <p>
          Los datos de residentes, propietarios y terceros que cargues en estos módulos los tratamos como encargados por tu cuenta,
          según el <Ir a="/legal/encargado">Acuerdo de Encargado del Tratamiento</Ir>. Los residentes pueden ejercer sus derechos
          ante ti o ante nosotros (<Correo />), conforme a la <Ir a="/legal/habeas-data">Política de Habeas Data</Ir>.
        </p>
      </Section>
    </LegalPage>
  );
}
