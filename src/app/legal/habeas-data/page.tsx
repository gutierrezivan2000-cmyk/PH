import type { Metadata } from "next";
import {
  Building2,
  BookOpen,
  Target,
  UserCheck,
  Send,
  FileSearch,
  History,
} from "lucide-react";
import { LegalPage, Section, Item } from "../legal-shell";

export const metadata: Metadata = {
  title: "Política de Tratamiento de Datos Personales — SOPH.IA",
  description:
    "Política de Tratamiento de Datos Personales (Habeas Data) de SOPH.IA conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia.",
};

export default function HabeasDataPage() {
  return (
    <LegalPage
      eyebrow="Legal · Última actualización: junio 2026"
      title="Política de Tratamiento de Datos Personales (Habeas Data)"
      intro="En cumplimiento de la Ley Estatutaria 1581 de 2012 y su Decreto Reglamentario 1377 de 2013, SOPH.IA adopta la presente política de tratamiento de datos personales, aplicable a toda la información recolectada a través de la plataforma."
      disclaimer
    >
      <Section number="01" title="Responsable del tratamiento" icon={Building2}>
        <p>
          El responsable del tratamiento de los datos personales es{" "}
          <strong style={{ color: "#f6f5f7" }}>SOPH.IA</strong>, plataforma
          SaaS de generación de documentos con inteligencia artificial para
          administradores de propiedad horizontal, con operación en la
          República de Colombia.
        </p>
        <ul className="space-y-2">
          <Item>
            Canal de atención al titular:{" "}
            <a
              href="mailto:soporte@sophiagrouph.com"
              className="underline underline-offset-2"
              style={{ color: "#9a7fff" }}
            >
              soporte@sophiagrouph.com
            </a>
          </Item>
          <Item>Ámbito: usuarios registrados, prospectos y contactos de la plataforma.</Item>
        </ul>
      </Section>

      <Section number="02" title="Marco normativo" icon={BookOpen}>
        <p>
          Esta política se fundamenta en el artículo 15 de la Constitución
          Política de Colombia, la Ley Estatutaria 1581 de 2012 —régimen
          general de protección de datos personales—, el Decreto 1377 de 2013
          que la reglamenta parcialmente, y las demás normas que las
          modifiquen, adicionen o complementen.
        </p>
        <p>
          La autoridad de control en materia de protección de datos en
          Colombia es la Superintendencia de Industria y Comercio (SIC),
          ante la cual el titular puede presentar quejas una vez agotado el
          trámite ante SOPH.IA.
        </p>
      </Section>

      <Section number="03" title="Finalidades del tratamiento" icon={Target}>
        <ul className="space-y-2">
          <Item>
            Gestionar el registro, autenticación y administración de la
            cuenta del usuario.
          </Item>
          <Item>
            Prestar el servicio contratado: generación de documentos de
            gestión de propiedad horizontal con inteligencia artificial.
          </Item>
          <Item>Procesar pagos y emitir la facturación correspondiente.</Item>
          <Item>
            Brindar soporte, atender peticiones, quejas y reclamos, y enviar
            comunicaciones relacionadas con el servicio.
          </Item>
          <Item>
            Cumplir obligaciones legales, contables y contractuales del
            responsable.
          </Item>
        </ul>
      </Section>

      <Section number="04" title="Derechos del titular" icon={UserCheck}>
        <p>
          De conformidad con el artículo 8 de la Ley 1581 de 2012, el titular
          de los datos tiene derecho a:
        </p>
        <ul className="space-y-2">
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Conocer</strong> los datos
            personales que SOPH.IA trata y acceder a ellos de forma gratuita.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Actualizar y rectificar</strong>{" "}
            los datos parciales, inexactos, incompletos o que induzcan a
            error.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Suprimir</strong> los datos
            cuando no exista un deber legal o contractual que imponga su
            conservación.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Revocar la autorización</strong>{" "}
            otorgada para el tratamiento, en los mismos supuestos de la
            supresión.
          </Item>
          <Item>
            Solicitar prueba de la autorización otorgada y ser informado
            sobre el uso dado a sus datos.
          </Item>
          <Item>
            Presentar quejas ante la Superintendencia de Industria y
            Comercio por infracciones al régimen de protección de datos.
          </Item>
        </ul>
      </Section>

      <Section number="05" title="Procedimiento para ejercer los derechos" icon={Send}>
        <p>
          El titular o sus causahabientes pueden ejercer sus derechos
          enviando una solicitud al correo{" "}
          <a
            href="mailto:soporte@sophiagrouph.com"
            className="underline underline-offset-2"
            style={{ color: "#9a7fff" }}
          >
            soporte@sophiagrouph.com
          </a>
          , indicando: nombre completo, dato de contacto, descripción de la
          solicitud (consulta, actualización, rectificación, supresión o
          revocatoria) y los documentos que la soporten.
        </p>
        <p>
          Conforme a los artículos 14 y 15 de la Ley 1581 de 2012, las{" "}
          <strong style={{ color: "#f6f5f7" }}>consultas</strong> serán
          atendidas en un término máximo de diez (10) días hábiles y los{" "}
          <strong style={{ color: "#f6f5f7" }}>reclamos</strong> en un término
          máximo de quince (15) días hábiles, contados a partir de su
          recibo. Si no es posible atender la solicitud dentro de dicho
          término, se informará al interesado los motivos de la demora y la
          fecha en que se atenderá, sin que esta supere los plazos de
          prórroga previstos en la ley.
        </p>
        <p>
          Si el reclamo resulta incompleto, se requerirá al interesado dentro
          de los cinco (5) días siguientes para que subsane las fallas;
          transcurridos dos (2) meses sin respuesta, se entenderá desistido.
        </p>
      </Section>

      <Section number="06" title="Autorización" icon={FileSearch}>
        <p>
          SOPH.IA solicita la autorización previa, expresa e informada del
          titular para el tratamiento de sus datos personales, la cual se
          obtiene al momento del registro en la plataforma mediante la
          aceptación de esta política y de los Términos y Condiciones.
        </p>
        <p>
          Conforme al Decreto 1377 de 2013, la autorización puede constar por
          cualquier medio que permita su consulta posterior. El titular puede
          solicitar copia de su autorización en cualquier momento a través
          del canal de atención.
        </p>
      </Section>

      <Section number="07" title="Vigencia" icon={History}>
        <p>
          La presente política rige a partir de junio de 2026 y permanecerá
          vigente mientras SOPH.IA realice tratamiento de datos personales.
          Las bases de datos se conservarán mientras subsistan las
          finalidades del tratamiento o exista un deber legal de
          conservación.
        </p>
        <p>
          Cualquier modificación sustancial será comunicada a los titulares a
          través de la plataforma o del correo registrado, antes de su
          entrada en vigor.
        </p>
      </Section>
    </LegalPage>
  );
}
