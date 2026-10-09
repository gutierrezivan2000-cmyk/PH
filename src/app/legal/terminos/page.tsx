import type { Metadata } from "next";
import {
  FileText,
  UserPlus,
  FlaskConical,
  CreditCard,
  Undo2,
  Ban,
  Users,
  Bot,
  Mic,
  Copyright,
  Server,
  ShieldAlert,
  Handshake,
  CircleX,
  RefreshCw,
  Mail,
  Scale,
  Gavel,
  Landmark,
} from "lucide-react";
import { LegalPage, Section, Item, Correo, Ir, DatosDelResponsable, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Términos y Condiciones — SOPH.IA",
  description:
    "Términos y Condiciones de Uso de SOPH.IA, la plataforma de inteligencia artificial para administradores de propiedad horizontal en Colombia.",
};

export default function TerminosPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Términos y Condiciones de Uso"
      intro="Estos Términos y Condiciones regulan el acceso y el uso de la plataforma SOPH.IA. Al crear una cuenta, ingresar con Google o usar el servicio, declaras que los leíste, los entendiste y los aceptas. Si no estás de acuerdo, no uses la plataforma."
    >
      <Section number="01" title="Quiénes somos y qué documentos te obligan" icon={FileText}>
        <DatosDelResponsable />
        <p>
          Forman parte de este acuerdo, y se leen en conjunto con él: la{" "}
          <Ir a="/legal/privacidad">Política de Privacidad</Ir>, la{" "}
          <Ir a="/legal/habeas-data">Política de Tratamiento de Datos Personales</Ir>, las{" "}
          <Ir a="/legal/reuniones">condiciones de Reuniones</Ir>, el{" "}
          <Ir a="/legal/encargado">Acuerdo de Encargado del Tratamiento</Ir>, el documento sobre{" "}
          <Ir a="/legal/ia">uso de Inteligencia Artificial</Ir> y la <Ir a="/legal/cookies">Política de Cookies</Ir>.
        </p>
      </Section>

      <Section number="02" title="Objeto del servicio" icon={FileText}>
        <p>
          SOPH.IA es una plataforma de software como servicio (SaaS) que asiste a administradores de propiedad horizontal en
          Colombia en su gestión mediante inteligencia artificial: actas de consejo y de asamblea, informes de gestión,
          comunicados, cartas de cobro, importación de datos, asistentes virtuales, transcripción y análisis de reuniones,
          portal para residentes y otras funciones habilitadas según el plan contratado.
        </p>
        <p>
          Podemos actualizar, mejorar, pausar o retirar funcionalidades. Las funciones marcadas como «Próximamente» o en
          piloto pueden cambiar o no llegar a publicarse; no forman parte de lo que contratas hasta que se habiliten.
        </p>
      </Section>

      <Section number="03" title="Registro, cuentas y seguridad" icon={UserPlus}>
        <p>
          Para usar el servicio debes crear una cuenta con información veraz, completa y actualizada, ya sea con correo y
          contraseña o con tu cuenta de Google. Eres responsable de la exactitud de esos datos.
        </p>
        <p>
          Las credenciales son personales e intransferibles. Eres responsable de custodiarlas y de toda actividad hecha
          desde tu cuenta. Si sospechas un uso no autorizado, avísanos de inmediato en <Correo />.
        </p>
        <p>
          El servicio es solo para personas mayores de edad con capacidad legal para contratar en Colombia. Si actúas en
          nombre de una empresa, una copropiedad o un tercero, declaras que tienes facultades para obligarlo.
        </p>
      </Section>

      <Section number="04" title="Fase de pruebas abierta" icon={FlaskConical}>
        <p>
          Mientras la plataforma esté en fase de pruebas, el acceso a las funciones del plan Pro es gratuito y no se pide
          medio de pago. En esta fase el servicio se ofrece sin compromisos de disponibilidad, los límites y funciones
          pueden cambiar sin previo aviso y pueden presentarse errores.
        </p>
        <p>
          Te avisaremos con anticipación razonable, por correo o dentro de la plataforma, antes de empezar a cobrar. No se
          te cobrará nada sin que lo aceptes de forma expresa.
        </p>
      </Section>

      <Section number="05" title="Planes, precios, pagos e impuestos" icon={CreditCard}>
        <p>
          Los planes, complementos (add-ons) y precios vigentes son los publicados en la sección de planes del sitio web y
          en la pantalla de suscripción al momento de contratar. Cada suscripción es mensual salvo que se indique otra cosa.
        </p>
        <ul className="space-y-2">
          <Item>Los pagos se procesan a través de la pasarela ePayco. SOPH.IA no almacena números completos de tarjetas.</Item>
          <Item>La suscripción se renueva automáticamente al final de cada periodo hasta que la canceles.</Item>
          <Item>
            Los precios se expresan en la moneda indicada en el momento de la compra. Los impuestos aplicables (por ejemplo
            IVA) se discriminan cuando corresponda.
          </Item>
          <Item>
            Si cambiamos un precio, te avisaremos con al menos treinta (30) días de anticipación; el cambio aplica desde la
            siguiente renovación y puedes cancelar antes si no lo aceptas.
          </Item>
          <Item>
            Si un pago falla, podemos reintentarlo y, de persistir, suspender las funciones de pago hasta que se regularice.
          </Item>
        </ul>
      </Section>

      <Section number="06" title="Cancelación, retracto y reembolsos" icon={Undo2}>
        <p>
          Puedes cancelar tu suscripción en cualquier momento desde la plataforma. La cancelación surte efectos al terminar el
          periodo ya pagado: conservas el acceso hasta entonces y no se hacen reembolsos parciales por fracciones del periodo
          facturado.
        </p>
        <p>
          Si actúas como consumidor en los términos de la Ley 1480 de 2011 y contrataste a distancia, puedes ejercer el
          derecho de retracto dentro de los cinco (5) días hábiles siguientes a la contratación, escribiendo a <Correo />,
          salvo en los casos que la ley exceptúa, entre ellos los servicios cuya prestación ya comenzó con tu consentimiento.
          Si procede, devolveremos lo pagado descontando el consumo de servicios ya prestados.
        </p>
        <p>
          Si cobramos un valor que no corresponde, lo corregiremos y reintegraremos la diferencia.
        </p>
      </Section>

      <Section number="07" title="Uso aceptable" icon={Ban}>
        <p>Te comprometes a no:</p>
        <ul className="space-y-2">
          <Item>Abusar del servicio, sobrecargar la infraestructura o intentar eludir límites técnicos o de plan.</Item>
          <Item>Hacer extracción automatizada de datos (scraping), ingeniería inversa o acceso no autorizado a la plataforma o a cuentas ajenas.</Item>
          <Item>Revender, sublicenciar o comercializar el acceso al servicio sin autorización escrita.</Item>
          <Item>Cargar contenido ilícito, que infrinja derechos de terceros o que hayas obtenido sin autorización.</Item>
          <Item>Grabar o transcribir a personas sin cumplir lo exigido en las <Ir a="/legal/reuniones">condiciones de Reuniones</Ir>.</Item>
          <Item>Usar la plataforma para suplantar a otra persona, enviar comunicaciones engañosas o cualquier fin contrario a la ley.</Item>
          <Item>Cargar datos sensibles, de menores de edad o de terceros que no necesites para tu gestión.</Item>
        </ul>
        <p>
          El incumplimiento nos faculta para suspender o cancelar la cuenta, sin perjuicio de las acciones legales a que
          haya lugar.
        </p>
      </Section>

      <Section number="08" title="Tus datos y los de terceros" icon={Users}>
        <p>
          Al cargar información de residentes, propietarios, proveedores, asistentes u otras personas, declaras que tienes
          derecho a hacerlo y que cuentas con las autorizaciones que la ley exige (Ley 1581 de 2012). Frente a esos datos tú
          eres el <strong style={{ color: "var(--ink)" }}>responsable del tratamiento</strong> y SOPH.IA actúa como{" "}
          <strong style={{ color: "var(--ink)" }}>encargado</strong>, bajo el{" "}
          <Ir a="/legal/encargado">Acuerdo de Encargado del Tratamiento</Ir>.
        </p>
        <p>
          Tratamos tus datos personales de cuenta como responsables, según la{" "}
          <Ir a="/legal/privacidad">Política de Privacidad</Ir>.
        </p>
      </Section>

      <Section number="09" title="Contenido generado por inteligencia artificial" icon={Bot}>
        <p>
          Los documentos, resúmenes, respuestas y demás resultados de la plataforma son borradores asistidos por
          inteligencia artificial, elaborados a partir de la información que suministras. Pueden contener errores,
          omisiones o interpretaciones inexactas.
        </p>
        <p>
          Eres el único responsable de revisar, verificar y validar cada resultado antes de darle un uso legal, contable o
          administrativo (por ejemplo, firmar un acta, enviar un comunicado o cobrar una cartera). SOPH.IA no presta
          asesoría jurídica, contable ni financiera, y no sustituye el criterio de un abogado, contador u otro profesional.
          Las referencias normativas (como la Ley 675 de 2001) son orientativas. Más detalle en{" "}
          <Ir a="/legal/ia">Uso de Inteligencia Artificial</Ir>.
        </p>
      </Section>

      <Section number="10" title="Reuniones: grabación y transcripción" icon={Mic}>
        <p>
          Si grabas o subes audio de una reunión, eres responsable de informar a los asistentes y de contar con las
          autorizaciones necesarias antes de grabar, tal como se explica en las{" "}
          <Ir a="/legal/reuniones">condiciones de Reuniones</Ir>. La plataforma te pide confirmar ese aviso y deja
          constancia de la fecha en que lo hiciste.
        </p>
      </Section>

      <Section number="11" title="Propiedad intelectual y licencia" icon={Copyright}>
        <p>
          Conservas todos los derechos sobre los datos y archivos que cargas y sobre los documentos generados a partir de
          ellos. Nos concedes una licencia limitada, no exclusiva y revocable para almacenar, procesar y transmitir ese
          contenido únicamente para prestarte el servicio (incluido su procesamiento por los proveedores de IA indicados en
          la Política de Privacidad).
        </p>
        <p>
          No usamos tu contenido para entrenar modelos propios ni lo vendemos. Contratamos a los proveedores de IA a través
          de sus interfaces de programación (API), cuyas condiciones vigentes establecen que, por defecto, los datos
          enviados por API no se usan para entrenar sus modelos; esas condiciones pueden cambiar y no las controlamos.
        </p>
        <p>
          SOPH.IA conserva la titularidad de la plataforma, su código, diseño, marcas, plantillas y demás elementos del
          servicio. La suscripción otorga una licencia de uso limitada, no exclusiva e intransferible mientras esté vigente.
        </p>
      </Section>

      <Section number="12" title="Disponibilidad, mantenimiento y soporte" icon={Server}>
        <p>
          Procuramos una alta disponibilidad, pero el servicio se presta «tal cual» y «según disponibilidad»: no garantizamos
          que sea ininterrumpido ni que esté libre de errores. Podemos realizar mantenimientos y depender de proveedores
          externos (alojamiento, base de datos, IA, correo, pagos) cuyas fallas pueden afectar el servicio.
        </p>
        <p>
          El soporte se presta por los canales publicados en la plataforma y por <Correo />, en horarios y tiempos
          razonables, sin acuerdo de nivel de servicio salvo que se pacte por escrito.
        </p>
      </Section>

      <Section number="13" title="Limitación de responsabilidad" icon={ShieldAlert}>
        <p>
          En la máxima medida permitida por la ley colombiana, SOPH.IA no responde por daños indirectos, lucro cesante o
          perjuicios derivados del uso de documentos o resultados que no hayas revisado, de decisiones que tomes con base en
          ellos, de fallas de proveedores externos o de eventos fuera de nuestro control razonable.
        </p>
        <p>
          La responsabilidad total de SOPH.IA frente a ti por cualquier reclamación se limita al valor que hayas pagado en
          los tres (3) meses anteriores al hecho que la origine. Esta limitación no aplica en caso de dolo o culpa grave, ni a
          lo que la ley no permita limitar, incluidos los derechos irrenunciables del consumidor.
        </p>
      </Section>

      <Section number="14" title="Indemnidad" icon={Handshake}>
        <p>
          Te comprometes a mantener indemne a SOPH.IA frente a reclamaciones de terceros que se originen en el contenido que
          cargues, en grabaciones hechas sin el aviso o la autorización requeridos, o en tu uso del servicio contrario a
          estos términos o a la ley, incluyendo los costos razonables de defensa.
        </p>
      </Section>

      <Section number="15" title="Suspensión y terminación" icon={CircleX}>
        <p>
          Puedes dejar de usar el servicio y cancelar tu suscripción cuando quieras. Podemos suspender o terminar tu cuenta
          ante incumplimiento de estos términos, mora en el pago, riesgo de seguridad o uso indebido, procurando avisarte
          antes cuando sea posible.
        </p>
        <p>
          Tras la terminación puedes solicitar la exportación de tus datos dentro de los treinta (30) días siguientes; pasado
          ese plazo podremos eliminarlos de forma segura, salvo lo que debamos conservar por obligación legal. Puedes pedir
          la supresión de tu cuenta en cualquier momento según la{" "}
          <Ir a="/legal/habeas-data">Política de Habeas Data</Ir>.
        </p>
      </Section>

      <Section number="16" title="Cambios a estos términos" icon={RefreshCw}>
        <p>
          Podemos modificar estos términos. Los cambios sustanciales se anunciarán por correo o dentro de la plataforma con
          al menos quince (15) días de anticipación a su entrada en vigor. Si sigues usando el servicio después, entiendes
          que los aceptas; si no estás de acuerdo, puedes cancelar antes. La versión vigente y su fecha están al comienzo de
          esta página, y la plataforma te pedirá confirmar que la leíste cuando cambie.
        </p>
      </Section>

      <Section number="17" title="Comunicaciones y aceptación electrónica" icon={Mail}>
        <p>
          Aceptas que podamos comunicarnos contigo por medios electrónicos (correo, avisos en la plataforma) y que tu
          aceptación electrónica de estos términos tiene plena validez, conforme a la Ley 527 de 1999. Guardamos constancia de
          la fecha y la versión que aceptaste.
        </p>
      </Section>

      <Section number="18" title="Peticiones, quejas y reclamos" icon={Scale}>
        <p>
          Puedes presentar peticiones, quejas y reclamos en <Correo />. Las atenderemos en los plazos de la ley. Si eres
          consumidor y no quedas conforme, también puedes acudir a la Superintendencia de Industria y Comercio (SIC). Los
          reclamos sobre datos personales siguen el procedimiento de la{" "}
          <Ir a="/legal/habeas-data">Política de Habeas Data</Ir>.
        </p>
      </Section>

      <Section number="19" title="Disposiciones generales" icon={Gavel}>
        <ul className="space-y-2">
          <Item>
            <strong style={{ color: "var(--ink)" }}>Acuerdo completo:</strong> estos términos y los documentos vinculados
            reemplazan cualquier acuerdo anterior sobre el servicio.
          </Item>
          <Item>
            <strong style={{ color: "var(--ink)" }}>Divisibilidad:</strong> si una cláusula no es válida o aplicable, las
            demás siguen vigentes.
          </Item>
          <Item>
            <strong style={{ color: "var(--ink)" }}>No renuncia:</strong> no ejercer un derecho no implica renunciar a él.
          </Item>
          <Item>
            <strong style={{ color: "var(--ink)" }}>Cesión:</strong> no puedes ceder tu cuenta ni estos términos sin nuestro
            consentimiento; nosotros podemos cederlos a quien continúe el negocio, avisándote.
          </Item>
          <Item>
            <strong style={{ color: "var(--ink)" }}>Fuerza mayor:</strong> ninguna parte responde por incumplimientos
            causados por hechos imprevisibles e irresistibles.
          </Item>
        </ul>
      </Section>

      <Section number="20" title="Ley aplicable y jurisdicción" icon={Landmark}>
        <p>
          Estos términos se rigen por las leyes de la República de Colombia. Las partes buscarán primero un arreglo directo
          y, de no lograrse, podrán acudir a la conciliación; si persiste la controversia, será resuelta por los jueces
          competentes de la República de Colombia. Para consultas sobre estos términos escríbenos a <Correo />.
        </p>
      </Section>
    </LegalPage>
  );
}
