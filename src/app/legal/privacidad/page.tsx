import type { Metadata } from "next";
import Link from "next/link";
import {
  Database,
  Target,
  Share2,
  Archive,
  UserCheck,
  Lock,
  Mail,
} from "lucide-react";
import { LegalPage, Section, Item } from "../legal-shell";

export const metadata: Metadata = {
  title: "Política de Privacidad — SOPH.IA",
  description:
    "Conoce qué datos recoge SOPH.IA, para qué los usa, con quién los comparte y cómo ejercer tus derechos como titular de la información.",
};

export default function PrivacidadPage() {
  return (
    <LegalPage
      eyebrow="Legal · Última actualización: junio 2026"
      title="Política de Privacidad"
      intro="En SOPH.IA tratamos los datos personales con transparencia y únicamente para prestar el servicio. Esta política explica qué información recogemos, con qué finalidad, con quién la compartimos y cómo puedes ejercer tus derechos."
      disclaimer
    >
      <Section number="01" title="Qué datos recogemos" icon={Database}>
        <ul className="space-y-2">
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Datos de cuenta:</strong>{" "}
            nombre, correo electrónico, contraseña (cifrada) y datos de
            facturación asociados a la suscripción.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Datos de propiedades:</strong>{" "}
            información de los conjuntos o copropiedades que administras
            (nombre, unidades, cifras de gestión) que decides registrar en la
            plataforma.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Documentos subidos:</strong>{" "}
            archivos que cargas como insumo para la generación de documentos
            (actas anteriores, informes, soportes).
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Datos de uso:</strong>{" "}
            registros técnicos de actividad (accesos, funciones utilizadas,
            documentos generados) necesarios para operar y mejorar el
            servicio.
          </Item>
        </ul>
      </Section>

      <Section number="02" title="Para qué usamos tus datos" icon={Target}>
        <ul className="space-y-2">
          <Item>
            Prestar el servicio contratado: autenticar tu cuenta, administrar
            tu suscripción y procesar pagos.
          </Item>
          <Item>
            Generar los documentos que solicitas: la información de tus
            propiedades y los archivos que cargas se usan exclusivamente como
            insumo de los documentos que pides generar.
          </Item>
          <Item>
            Brindar soporte técnico y responder tus solicitudes.
          </Item>
          <Item>
            Mantener la seguridad de la plataforma y cumplir obligaciones
            legales.
          </Item>
        </ul>
        <p>
          No vendemos tus datos personales ni los usamos con fines distintos
          a los aquí descritos.
        </p>
      </Section>

      <Section number="03" title="Con quién se comparten" icon={Share2}>
        <p>
          Compartimos datos únicamente con los proveedores de infraestructura
          que hacen posible operar el servicio, y solo en la medida
          estrictamente necesaria:
        </p>
        <ul className="space-y-2">
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Vercel</strong> — alojamiento
            de la aplicación y archivos.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Neon</strong> — base de datos.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Anthropic y OpenAI</strong> —
            procesamiento de inteligencia artificial para la generación de
            documentos.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>Resend</strong> — envío de
            correos transaccionales.
          </Item>
          <Item>
            <strong style={{ color: "#f6f5f7" }}>ePayco</strong> —
            procesamiento de pagos. SOPH.IA no almacena números completos de
            tarjetas.
          </Item>
        </ul>
        <p>
          Estos proveedores actúan como encargados del tratamiento bajo sus
          propias políticas de seguridad y confidencialidad. Fuera de estos
          casos, solo divulgaremos información cuando una autoridad
          competente lo exija conforme a la ley.
        </p>
      </Section>

      <Section number="04" title="Conservación" icon={Archive}>
        <p>
          Conservamos tus datos mientras tu cuenta permanezca activa y
          durante el tiempo necesario para cumplir obligaciones legales,
          contables o contractuales. Tras la terminación de la cuenta, los
          datos se eliminan o anonimizan de forma segura una vez vencidos los
          plazos de retención aplicables.
        </p>
      </Section>

      <Section number="05" title="Derechos del titular" icon={UserCheck}>
        <p>
          Como titular de los datos, puedes en cualquier momento conocer,
          actualizar, rectificar y suprimir tu información, así como revocar
          la autorización otorgada para su tratamiento, en los términos de la
          Ley 1581 de 2012.
        </p>
        <p>
          El detalle del procedimiento se encuentra en nuestra{" "}
          <Link
            href="/legal/habeas-data"
            className="underline underline-offset-2"
            style={{ color: "#9a7fff" }}
          >
            Política de Tratamiento de Datos Personales (Habeas Data)
          </Link>
          .
        </p>
      </Section>

      <Section number="06" title="Seguridad" icon={Lock}>
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger
          la información: cifrado en tránsito (TLS), contraseñas almacenadas
          con hash criptográfico, controles de acceso por rol y registro de
          actividad administrativa.
        </p>
        <p>
          Ningún sistema es infalible; si detectamos un incidente de
          seguridad que afecte tus datos, te lo notificaremos y lo
          reportaremos a las autoridades cuando corresponda.
        </p>
      </Section>

      <Section number="07" title="Contacto" icon={Mail}>
        <p>
          Para preguntas, solicitudes o reclamos relacionados con esta
          política, escríbenos a{" "}
          <a
            href="mailto:soporte@sophiagrouph.com"
            className="underline underline-offset-2"
            style={{ color: "#9a7fff" }}
          >
            soporte@sophiagrouph.com
          </a>
          . Atendemos las solicitudes en los plazos previstos por la
          legislación colombiana.
        </p>
      </Section>
    </LegalPage>
  );
}
