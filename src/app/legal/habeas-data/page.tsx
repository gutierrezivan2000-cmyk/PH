import type { Metadata } from "next";
import {
  Building2,
  BookOpen,
  Scale,
  Target,
  ShieldAlert,
  UserCheck,
  Send,
  FileSearch,
  Globe,
  History,
} from "lucide-react";
import { LegalPage, Section, Item, Correo, Ir, DatosDelResponsable, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Política de Tratamiento de Datos Personales — SOPH.IA",
  description:
    "Política de Tratamiento de Datos Personales (Habeas Data) de SOPH.IA conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia.",
};

const fuerte = { color: "var(--ink)" } as const;

export default function HabeasDataPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Política de Tratamiento de Datos Personales (Habeas Data)"
      intro="En cumplimiento de la Ley Estatutaria 1581 de 2012 y su Decreto Reglamentario 1377 de 2013 (compilado en el Decreto 1074 de 2015), SOPH.IA adopta esta política de tratamiento de datos personales, aplicable a la información recolectada a través de la plataforma."
    >
      <Section number="01" title="Responsable del tratamiento" icon={Building2}>
        <p>
          El responsable del tratamiento de los datos personales de las cuentas es SOPH.IA, plataforma SaaS con inteligencia
          artificial para administradores de propiedad horizontal, con operación en la República de Colombia.
        </p>
        <DatosDelResponsable />
        <p>
          Cuando un administrador carga datos de residentes u otros terceros, el responsable de esos datos es el
          administrador y SOPH.IA actúa como encargado (ver el{" "}
          <Ir a="/legal/encargado">Acuerdo de Encargado del Tratamiento</Ir>). En ese caso, las solicitudes de los titulares
          pueden dirigirse también al administrador de su copropiedad; si nos llegan a nosotros, las trasladamos.
        </p>
      </Section>

      <Section number="02" title="Marco normativo y autoridad" icon={BookOpen}>
        <p>
          Esta política se fundamenta en el artículo 15 de la Constitución Política, la Ley Estatutaria 1581 de 2012, el
          Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y las normas que los modifiquen, adicionen o
          complementen.
        </p>
        <p>
          La autoridad de control es la Superintendencia de Industria y Comercio (SIC), ante la cual el titular puede
          presentar quejas una vez agotado el trámite ante SOPH.IA.
        </p>
      </Section>

      <Section number="03" title="Principios que aplicamos" icon={Scale}>
        <ul className="space-y-2">
          <Item><strong style={fuerte}>Legalidad y finalidad:</strong> tratamos datos solo para las finalidades de esta política, que son legítimas e informadas.</Item>
          <Item><strong style={fuerte}>Libertad:</strong> el tratamiento requiere tu autorización previa, expresa e informada.</Item>
          <Item><strong style={fuerte}>Veracidad y transparencia:</strong> puedes saber en cualquier momento qué datos tenemos.</Item>
          <Item><strong style={fuerte}>Acceso y circulación restringida:</strong> solo acceden quienes lo necesitan y los proveedores indicados en la Política de Privacidad.</Item>
          <Item><strong style={fuerte}>Seguridad y confidencialidad:</strong> protegemos los datos con medidas técnicas y organizativas razonables.</Item>
        </ul>
      </Section>

      <Section number="04" title="Finalidades del tratamiento" icon={Target}>
        <ul className="space-y-2">
          <Item>Gestionar el registro, la autenticación y la administración de la cuenta.</Item>
          <Item>Prestar el servicio: generación de documentos, transcripción y análisis de reuniones, asistentes virtuales, portal de residentes y demás funciones, con inteligencia artificial.</Item>
          <Item>Procesar pagos y emitir la facturación correspondiente.</Item>
          <Item>Medir el consumo de recursos, aplicar límites de plan y planear precios y capacidad.</Item>
          <Item>Brindar soporte, atender peticiones, quejas y reclamos, y enviar comunicaciones relacionadas con el servicio.</Item>
          <Item>Mantener la seguridad, prevenir fraude y abusos y cumplir obligaciones legales, contables y contractuales.</Item>
        </ul>
        <p>No usamos los datos para fines distintos ni los vendemos.</p>
      </Section>

      <Section number="05" title="Datos sensibles y menores de edad" icon={ShieldAlert}>
        <p>
          No solicitamos datos sensibles ni de menores. Si los incluyes en documentos o grabaciones, el tratamiento es
          facultativo: no estás obligado a suministrarlos y solo se tratan para el fin que cargaste. Respecto de menores,
          quien los carga debe contar con la autorización de sus representantes y respetar su interés superior y sus
          derechos fundamentales (artículo 7 de la Ley 1581 de 2012).
        </p>
        <p>
          La voz de las personas en una grabación es un dato personal. Consulta las{" "}
          <Ir a="/legal/reuniones">condiciones de Reuniones</Ir> para saber qué debes informar a los asistentes.
        </p>
      </Section>

      <Section number="06" title="Derechos del titular" icon={UserCheck}>
        <p>De conformidad con el artículo 8 de la Ley 1581 de 2012, tienes derecho a:</p>
        <ul className="space-y-2">
          <Item><strong style={fuerte}>Conocer</strong> los datos que tratamos y acceder a ellos de forma gratuita.</Item>
          <Item><strong style={fuerte}>Actualizar y rectificar</strong> los datos parciales, inexactos, incompletos o que induzcan a error.</Item>
          <Item><strong style={fuerte}>Suprimir</strong> los datos cuando no exista un deber legal o contractual que obligue a conservarlos.</Item>
          <Item><strong style={fuerte}>Revocar la autorización</strong> otorgada, en los mismos supuestos de la supresión.</Item>
          <Item>Solicitar prueba de la autorización y ser informado sobre el uso dado a tus datos.</Item>
          <Item>Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones al régimen de protección de datos.</Item>
        </ul>
      </Section>

      <Section number="07" title="Cómo ejercer tus derechos" icon={Send}>
        <p>
          El titular, sus causahabientes o su representante pueden ejercer sus derechos escribiendo a <Correo />, con: nombre
          completo, un dato de contacto, la descripción de la solicitud (consulta, actualización, rectificación, supresión o
          revocatoria) y los documentos que la soporten. Podemos pedirte que acredites tu identidad.
        </p>
        <p>
          Conforme a los artículos 14 y 15 de la Ley 1581 de 2012, las <strong style={fuerte}>consultas</strong> se atienden
          en máximo diez (10) días hábiles desde su recibo, prorrogables por cinco (5) días hábiles más si lo informamos antes
          con los motivos. Los <strong style={fuerte}>reclamos</strong> se atienden en máximo quince (15) días hábiles,
          prorrogables por ocho (8) días hábiles más con la misma información.
        </p>
        <p>
          Si el reclamo está incompleto te pediremos subsanarlo dentro de los cinco (5) días siguientes; pasados dos (2)
          meses sin respuesta, se entenderá desistido. Mientras se resuelve un reclamo, el dato disputado se marca como «reclamo
          en trámite». La supresión o revocatoria no procede cuando exista un deber legal o contractual de conservar el dato.
        </p>
      </Section>

      <Section number="08" title="Autorización" icon={FileSearch}>
        <p>
          Solicitamos tu autorización previa, expresa e informada al momento del registro o del primer ingreso con Google,
          mediante la aceptación de los Términos y Condiciones y de esta política. Guardamos constancia de la fecha y de la
          versión aceptada, y puedes pedir copia en cualquier momento.
        </p>
        <p>
          Si cambiamos las finalidades de forma sustancial, te pediremos una nueva autorización. Para los datos que un
          administrador carga sobre terceros, la autorización la obtiene el administrador como responsable.
        </p>
      </Section>

      <Section number="09" title="Transmisión y transferencia internacional" icon={Globe}>
        <p>
          Algunos proveedores (alojamiento, base de datos, inteligencia artificial y correo) operan fuera de Colombia,
          principalmente en Estados Unidos. Al aceptar esta política autorizas de forma expresa la transmisión y
          transferencia de tus datos a esos proveedores, únicamente para prestar el servicio y bajo medidas de seguridad y
          confidencialidad. Los proveedores y su función están en la <Ir a="/legal/privacidad">Política de Privacidad</Ir>.
        </p>
      </Section>

      <Section number="10" title="Vigencia y cambios" icon={History}>
        <p>
          Esta política rige desde el {FECHA_LEGAL} y permanece vigente mientras SOPH.IA trate datos personales. Las bases de
          datos se conservan mientras subsistan las finalidades del tratamiento o exista un deber legal de conservación.
          Cualquier modificación sustancial se comunicará a los titulares por la plataforma o por el correo registrado antes
          de su entrada en vigor.
        </p>
      </Section>
    </LegalPage>
  );
}
