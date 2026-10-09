import type { Metadata } from "next";
import { Cookie, ListChecks, Settings } from "lucide-react";
import { LegalPage, Section, Item, Correo, FECHA_LEGAL } from "../legal-shell";

export const metadata: Metadata = {
  title: "Política de Cookies — SOPH.IA",
  description: "Qué cookies y almacenamiento local usa SOPH.IA en tu navegador y para qué.",
};

const fuerte = { color: "var(--ink)" } as const;

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${FECHA_LEGAL}`}
      title="Política de Cookies y almacenamiento local"
      intro="SOPH.IA usa solo lo estrictamente necesario para que el servicio funcione. No usamos cookies de publicidad ni de seguimiento de terceros."
    >
      <Section number="01" title="Qué guardamos en tu navegador" icon={Cookie}>
        <ul className="space-y-2">
          <Item>
            <strong style={fuerte}>Cookie de sesión</strong> (<code>authjs.session-token</code>): te mantiene conectado. Es
            necesaria; sin ella no podrías usar tu cuenta. Caduca al cerrar sesión o al vencer la sesión.
          </Item>
          <Item>
            <strong style={fuerte}>Cookies de seguridad del inicio de sesión</strong> (token CSRF y dirección de retorno): protegen
            el ingreso con correo o Google contra ataques. Son temporales y necesarias.
          </Item>
          <Item>
            <strong style={fuerte}>Preferencia de tema</strong> (<code>sophia-theme</code>, almacenamiento local): recuerda si
            prefieres modo claro, oscuro o automático.
          </Item>
          <Item>
            <strong style={fuerte}>Base local de la grabadora</strong> (IndexedDB): guarda temporalmente en tu dispositivo lo que
            grabas para no perderlo si se corta la conexión; se limpia cuando la grabación se envía o la descartas.
          </Item>
        </ul>
        <p>
          Estas cookies y datos locales son estrictamente necesarios o de preferencia funcional, por lo que no requieren un
          banner de consentimiento. Si en el futuro agregamos analítica u otras cookies no esenciales, te pediremos tu
          autorización antes de usarlas y actualizaremos esta política.
        </p>
      </Section>

      <Section number="02" title="Cómo controlarlas" icon={Settings}>
        <p>
          Puedes borrar o bloquear las cookies desde la configuración de tu navegador. Si bloqueas las necesarias, no podrás
          iniciar sesión ni usar el servicio. Para dudas escribe a <Correo />.
        </p>
      </Section>

      <Section number="03" title="Terceros" icon={ListChecks}>
        <p>
          Si ingresas con Google, Google puede establecer sus propias cookies en su página de inicio de sesión, regidas por su
          política. El pago de suscripciones se completa en la página de ePayco, que tiene su propia política.
        </p>
      </Section>
    </LegalPage>
  );
}
