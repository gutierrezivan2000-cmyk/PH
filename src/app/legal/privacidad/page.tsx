import type { Metadata } from "next";
import {
  Building2,
  Database,
  Target,
  Brain,
  Globe,
  Eye,
  Archive,
  UserCheck,
  Baby,
  Lock,
  Cookie,
  Mail,
} from "lucide-react";
import { LegalPage, Section, Item, Correo, Ir, DatosDelResponsable, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Política de Privacidad — SOPH.IA",
  description:
    "Conoce qué datos recoge SOPH.IA, para qué los usa, con quién los comparte, cuánto tiempo los conserva y cómo ejercer tus derechos como titular.",
};

const fuerte = { color: "var(--ink)" } as const;

export default function PrivacidadPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Política de Privacidad"
      intro="En SOPH.IA tratamos los datos personales con transparencia y solo para prestar el servicio. Esta política explica qué información recogemos, para qué, con quién la compartimos, cuánto tiempo la conservamos y cómo puedes ejercer tus derechos."
    >
      <Section number="01" title="Responsable y alcance" icon={Building2}>
        <p>
          Esta política aplica a las personas que usan SOPH.IA (administradores y sus equipos), a quienes visitan el sitio y a
          los residentes que usan el portal de una copropiedad. El responsable del tratamiento de los datos de tu cuenta es:
        </p>
        <DatosDelResponsable />
        <p>
          Los datos de residentes, propietarios, proveedores o asistentes que un administrador carga en la plataforma son
          tratados por SOPH.IA como <strong style={fuerte}>encargado</strong>, por cuenta de ese administrador, que es su
          responsable (ver el <Ir a="/legal/encargado">Acuerdo de Encargado del Tratamiento</Ir>).
        </p>
      </Section>

      <Section number="02" title="Qué datos recogemos" icon={Database}>
        <ul className="space-y-2">
          <Item>
            <strong style={fuerte}>Cuenta:</strong> nombre, correo electrónico, contraseña (almacenada con hash, nunca en
            claro) y, si ingresas con Google, la foto y el nombre de tu perfil de Google. Opcionalmente: cargo, teléfono,
            empresa y ciudad.
          </Item>
          <Item>
            <strong style={fuerte}>Suscripción y pagos:</strong> plan, estado, periodos e identificadores de ePayco. No
            almacenamos números completos de tarjeta. Si configuras cobros a residentes, guardamos las credenciales de tu
            propio comercio en la pasarela, protegidas, para que los pagos lleguen directamente a ti.
          </Item>
          <Item>
            <strong style={fuerte}>Propiedades y gestión:</strong> nombre y datos de las copropiedades, unidades, cartera,
            presupuesto, bitácora y demás información que decidas registrar.
          </Item>
          <Item>
            <strong style={fuerte}>Archivos y documentos:</strong> los que cargas como insumo (actas anteriores, informes,
            soportes, hojas de cálculo, imágenes) y los documentos que se generan. Pueden incluir datos de terceros.
          </Item>
          <Item>
            <strong style={fuerte}>Reuniones:</strong> audio que grabas o subes, su transcripción (con identificación de
            hablantes), los resúmenes, actas y preguntas que se generan, y la constancia de que avisaste a los asistentes. La
            voz es un dato personal.
          </Item>
          <Item>
            <strong style={fuerte}>Conversaciones:</strong> mensajes con los asistentes de IA y con el chat de soporte, y
            tickets de soporte con sus adjuntos.
          </Item>
          <Item>
            <strong style={fuerte}>Uso y consumo:</strong> qué funciones usas, cuántas veces y cuánta capacidad de IA
            consumen (tokens, minutos de audio y su costo). Lo usamos para operar el servicio, aplicar los límites del plan y
            definir precios.
          </Item>
          <Item>
            <strong style={fuerte}>Datos técnicos:</strong> dirección IP, navegador, fecha de último ingreso, registros de acceso y de seguridad,
            contadores para evitar abusos y las cookies descritas en la <Ir a="/legal/cookies">Política de Cookies</Ir>.
          </Item>
          <Item>
            <strong style={fuerte}>Portal de residentes:</strong> las preguntas que un residente hace al asistente del
            reglamento y los datos de la unidad asociada a su enlace.
          </Item>
        </ul>
        <p>
          No solicitamos datos sensibles (salud, origen étnico, orientación política, biométricos, etc.). Si aparecen en un
          documento o en una grabación, se tratan solo para el fin que cargaste y te pedimos evitarlos cuando no sean
          necesarios.
        </p>
      </Section>

      <Section number="03" title="Para qué usamos los datos" icon={Target}>
        <ul className="space-y-2">
          <Item>Crear y autenticar tu cuenta, administrar tu suscripción y procesar pagos.</Item>
          <Item>
            Generar lo que solicitas: la información de tus propiedades y los archivos que cargas se usan como insumo de los
            documentos, transcripciones, resúmenes y respuestas que pides.
          </Item>
          <Item>Brindar soporte técnico y responder tus solicitudes.</Item>
          <Item>Medir el consumo, aplicar límites de plan, facturar y planear precios y capacidad.</Item>
          <Item>Mantener la seguridad, prevenir fraude y abusos, y cumplir obligaciones legales.</Item>
          <Item>Enviarte comunicaciones del servicio (verificación, avisos de reuniones listas, cambios de términos).</Item>
        </ul>
        <p>
          No vendemos tus datos personales, no los usamos para publicidad de terceros y no tomamos decisiones
          automatizadas con efectos jurídicos sobre las personas: los documentos son borradores que una persona revisa.
        </p>
      </Section>

      <Section number="04" title="Inteligencia artificial y proveedores" icon={Brain}>
        <p>
          Para operar el servicio compartimos datos con proveedores, solo en la medida necesaria para cada función:
        </p>
        <ul className="space-y-2">
          <Item><strong style={fuerte}>Vercel</strong> (Estados Unidos): alojamiento de la aplicación y almacenamiento de archivos.</Item>
          <Item><strong style={fuerte}>Neon</strong> (Estados Unidos): base de datos.</Item>
          <Item><strong style={fuerte}>Anthropic</strong> (Estados Unidos): modelos de IA que redactan documentos, resumen reuniones y responden preguntas.</Item>
          <Item><strong style={fuerte}>OpenAI</strong> (Estados Unidos): transcripción de audio y chat de soporte.</Item>
          <Item><strong style={fuerte}>Resend</strong> (Estados Unidos): envío de correos del servicio.</Item>
          <Item><strong style={fuerte}>ePayco</strong> (Colombia): procesamiento de pagos.</Item>
          <Item><strong style={fuerte}>Google</strong>: inicio de sesión con tu cuenta de Google, si lo eliges.</Item>
        </ul>
        <p>
          Los proveedores de IA se contratan por API. Según sus condiciones vigentes, los datos enviados por API no se usan
          por defecto para entrenar sus modelos; SOPH.IA tampoco usa tu contenido para entrenar modelos propios. Estos
          proveedores actúan como encargados bajo sus propias medidas de seguridad y confidencialidad. Fuera de ellos solo
          divulgamos información cuando una autoridad competente lo exija conforme a la ley.
        </p>
      </Section>

      <Section number="05" title="Transmisión y transferencia internacional" icon={Globe}>
        <p>
          Varios proveedores procesan datos fuera de Colombia, principalmente en Estados Unidos. Al aceptar esta política
          autorizas de forma expresa esa transmisión y transferencia, que hacemos con las medidas de seguridad descritas más
          abajo y únicamente para prestar el servicio. Si eres administrador y cargas datos de terceros, te corresponde
          informarles de esto, tal como se explica en el <Ir a="/legal/encargado">Acuerdo de Encargado</Ir>.
        </p>
      </Section>

      <Section number="06" title="Quién en SOPH.IA puede ver tus datos" icon={Eye}>
        <p>
          El personal autorizado de SOPH.IA ve, en su panel de administración, tus datos de cuenta y de contacto (nombre,
          correo, foto, cargo, teléfono, empresa, ciudad), las fechas de registro, de último ingreso y de aceptación de estos
          documentos, tu plan y tu consumo, para administrar las cuentas, darte soporte, facturar y contactarte sobre el
          servicio.
        </p>
        <p>
          Ese panel no muestra el contenido que generas o cargas (documentos, actas, reuniones y transcripciones,
          conversaciones con los asistentes, propiedades y sus datos). El personal solo accede a ese contenido de forma
          excepcional, para resolver un problema que tú reportes o por seguridad, bajo deber de confidencialidad y solo con
          el alcance necesario.
        </p>
      </Section>

      <Section number="07" title="Conservación" icon={Archive}>
        <ul className="space-y-2">
          <Item>
            <strong style={fuerte}>Cuenta y gestión:</strong> mientras tu cuenta esté activa y durante el tiempo necesario
            para cumplir obligaciones legales, contables o contractuales.
          </Item>
          <Item>
            <strong style={fuerte}>Reuniones:</strong> el archivo original que subes o grabas se conserva 90 días y luego se
            borra; la transcripción y el audio de trabajo se conservan hasta que borres la reunión. Los fragmentos
            temporales de una grabación en curso se limpian a los pocos días de ensamblarse.
          </Item>
          <Item>
            <strong style={fuerte}>Eliminación de la cuenta:</strong> al pedirla, borramos o anonimizamos tus datos, salvo lo
            que debamos conservar por ley (por ejemplo, registros contables y tributarios, durante los plazos aplicables) y los
            registros de seguridad necesarios para prevenir fraude.
          </Item>
          <Item>
            <strong style={fuerte}>Copias de seguridad:</strong> pueden conservar datos borrados por un periodo breve hasta
            su rotación.
          </Item>
        </ul>
      </Section>

      <Section number="08" title="Tus derechos" icon={UserCheck}>
        <p>
          Puedes conocer, actualizar, rectificar y suprimir tus datos, y revocar la autorización, en los términos de la Ley
          1581 de 2012. El procedimiento y los plazos están en la{" "}
          <Ir a="/legal/habeas-data">Política de Tratamiento de Datos Personales (Habeas Data)</Ir>. Escríbenos a{" "}
          <Correo />.
        </p>
      </Section>

      <Section number="09" title="Menores de edad" icon={Baby}>
        <p>
          El servicio no está dirigido a menores de edad y no recogemos sus datos de forma intencional. Si un documento o una
          grabación incluye datos de menores, quien los carga es responsable de contar con la autorización de sus
          representantes legales y de limitar el tratamiento a lo estrictamente necesario, respetando su interés superior.
        </p>
      </Section>

      <Section number="10" title="Seguridad" icon={Lock}>
        <p>
          Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito (TLS), contraseñas con hash
          criptográfico, controles de acceso por rol, panel administrativo que no muestra el contenido de los clientes, límites de intentos y
          registro de la actividad administrativa. Ningún sistema es infalible: si detectamos un incidente que afecte tus
          datos, te lo notificaremos y lo reportaremos a la autoridad cuando corresponda.
        </p>
      </Section>

      <Section number="11" title="Cookies y almacenamiento local" icon={Cookie}>
        <p>
          Usamos una cookie de sesión necesaria para mantenerte conectado y una preferencia de tema en tu navegador. No
          usamos cookies de publicidad. Detalles en la <Ir a="/legal/cookies">Política de Cookies</Ir>.
        </p>
      </Section>

      <Section number="12" title="Cambios y contacto" icon={Mail}>
        <p>
          Si cambiamos esta política de forma sustancial te lo comunicaremos por la plataforma o por correo antes de que
          entre en vigor. Para preguntas, solicitudes o reclamos escríbenos a <Correo />; atendemos en los plazos de la
          legislación colombiana.
        </p>
      </Section>
    </LegalPage>
  );
}
