import type { Metadata } from "next";
import { Handshake, Users, ListChecks, ShieldCheck, ClipboardCheck, Network, Globe, Archive } from "lucide-react";
import { LegalPage, Section, Item, Correo, Ir, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Acuerdo de Encargado del Tratamiento — SOPH.IA",
  description: "Cómo SOPH.IA trata, por cuenta del administrador, los datos de residentes y terceros que se cargan en la plataforma.",
};

const fuerte = { color: "var(--ink)" } as const;

export default function EncargadoPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Acuerdo de Encargado del Tratamiento"
      intro="Cuando cargas en SOPH.IA datos de residentes, propietarios, proveedores o asistentes, tú decides para qué se usan: eres el responsable. SOPH.IA los trata por tu cuenta, como encargado. Este acuerdo regula esa relación (Ley 1581 de 2012 y Decreto 1377 de 2013) y se entiende aceptado con los Términos y Condiciones."
    >
      <Section number="01" title="Partes y objeto" icon={Handshake}>
        <p>
          <strong style={fuerte}>Responsable:</strong> el usuario que carga o genera datos de terceros (administrador de
          propiedad horizontal o quien actúe en su nombre). <strong style={fuerte}>Encargado:</strong> SOPH.IA. El objeto es
          tratar esos datos únicamente para prestar el servicio contratado en los Términos y Condiciones.
        </p>
      </Section>

      <Section number="02" title="Datos y titulares" icon={Users}>
        <ul className="space-y-2">
          <Item><strong style={fuerte}>Titulares:</strong> residentes, propietarios, arrendatarios, miembros del consejo, proveedores, asistentes a reuniones y otras personas cuyos datos cargues.</Item>
          <Item><strong style={fuerte}>Datos:</strong> identificación y contacto, unidad, cartera y pagos, participación en asambleas y reuniones, voz en grabaciones y el contenido de documentos que cargues.</Item>
          <Item><strong style={fuerte}>Naturaleza:</strong> almacenamiento, procesamiento con inteligencia artificial, generación de documentos, transcripción y consulta por parte tuya y, en el portal, de cada residente respecto de su propia unidad.</Item>
        </ul>
      </Section>

      <Section number="03" title="Qué hacemos y qué no" icon={ListChecks}>
        <ul className="space-y-2">
          <Item>Tratamos los datos solo según tus instrucciones, que son el uso normal de la plataforma y estos términos.</Item>
          <Item>No los usamos para fines propios distintos de operar, asegurar y medir el servicio, no los vendemos y no entrenamos modelos propios con ellos.</Item>
          <Item>Mantenemos la confidencialidad: el personal con acceso está obligado a reservarla.</Item>
          <Item>Si un titular nos escribe a nosotros, trasladamos su solicitud y te ayudamos a atenderla en los plazos legales.</Item>
        </ul>
      </Section>

      <Section number="04" title="Seguridad e incidentes" icon={ShieldCheck}>
        <p>
          Aplicamos las medidas descritas en la <Ir a="/legal/privacidad">Política de Privacidad</Ir> (cifrado en tránsito,
          controles de acceso, panel administrativo que no muestra el contenido de los clientes, registros de seguridad). Si confirmamos un incidente de
          seguridad que afecte los datos que nos confiaste, te avisaremos sin demora injustificada y te daremos la información
          disponible para que cumplas tus deberes frente a los titulares y la SIC.
        </p>
      </Section>

      <Section number="05" title="Tus obligaciones como responsable" icon={ClipboardCheck}>
        <ul className="space-y-2">
          <Item>Contar con la autorización de los titulares o con otra base legal para tratar sus datos y para transmitirlos a SOPH.IA.</Item>
          <Item>Informarles la finalidad, sus derechos y que sus datos se procesan con proveedores en el exterior (ver sección 07).</Item>
          <Item>Cargar solo datos necesarios, evitar datos sensibles y de menores salvo lo indispensable y con la autorización exigida.</Item>
          <Item>Mantener tu propia política de tratamiento y atender los derechos de los titulares. Si tu copropiedad debe registrar sus bases de datos ante la SIC (RNBD), esa obligación es tuya.</Item>
          <Item>Para grabaciones, cumplir lo indicado en las <Ir a="/legal/reuniones">condiciones de Reuniones</Ir>.</Item>
        </ul>
      </Section>

      <Section number="06" title="Subencargados" icon={Network}>
        <p>
          Para prestar el servicio usamos los proveedores listados en la <Ir a="/legal/privacidad">Política de
          Privacidad</Ir> (alojamiento, base de datos, inteligencia artificial, correo y pagos). Los contratamos bajo
          condiciones de seguridad y confidencialidad. Si incorporamos o cambiamos un proveedor que reciba estos datos,
          actualizaremos esa lista y avisaremos los cambios sustanciales.
        </p>
      </Section>

      <Section number="07" title="Transmisión internacional" icon={Globe}>
        <p>
          Algunos subencargados operan fuera de Colombia, principalmente en Estados Unidos. Este acuerdo es el instrumento que
          regula esa transmisión de datos entre responsable y encargado. Tú debes informar a los titulares y, cuando la ley lo
          exija, obtener su autorización para ello.
        </p>
      </Section>

      <Section number="08" title="Terminación, devolución y supresión" icon={Archive}>
        <p>
          Al terminar el servicio puedes pedir la exportación de tus datos dentro de los treinta (30) días siguientes. Pasado
          ese plazo, o si lo solicitas, los suprimimos o anonimizamos, salvo lo que debamos conservar por ley. Puedes
          escribirnos a <Correo /> para cualquier solicitud o consulta sobre este acuerdo, que dura mientras uses el servicio.
        </p>
      </Section>
    </LegalPage>
  );
}
