"use client";

import { useState } from "react";
import {
  FileText,
  BarChart3,
  Timer,
  BadgeCheck,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const SERIF: React.CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif",
};

/* ------------------------------------------------------------------ */
/* Paper sheet wrapper: a light document rendered inside the dark page */
/* ------------------------------------------------------------------ */

function PaperSheet({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto max-w-2xl rounded-lg px-7 py-10 sm:px-12 sm:py-14"
      style={{
        background: "#f6f5f7",
        color: "#22222a",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.10) inset, 0 24px 60px -24px rgba(0,0,0,0.8)",
      }}
    >
      {children}
    </div>
  );
}

function GeneratedRow() {
  return (
    <div className="mx-auto max-w-2xl mt-4 flex items-center justify-center gap-5">
      <span
        className="inline-flex items-center gap-1.5"
        style={{ ...MONO, color: "rgba(246,245,247,0.42)" }}
      >
        <Timer className="h-3 w-3" style={{ color: "#9a7fff" }} />
        Generado en 2 min 47 s
      </span>
      <span style={{ color: "rgba(255,255,255,0.14)" }}>·</span>
      <span
        className="inline-flex items-center gap-1.5"
        style={{ ...MONO, color: "rgba(246,245,247,0.42)" }}
      >
        <BadgeCheck className="h-3 w-3" style={{ color: "#9a7fff" }} />
        Citas verificadas contra Ley 675 de 2001
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Document 1: Acta de Consejo                                         */
/* ------------------------------------------------------------------ */

function ActaDocument() {
  return (
    <PaperSheet>
      <div className="text-center pb-6 mb-8" style={{ borderBottom: "2px solid #22222a" }}>
        <p className="text-[11px] tracking-[0.22em] uppercase" style={{ color: "rgba(34,34,42,0.55)" }}>
          Conjunto Residencial Ejemplo P.H. · NIT 901.234.567-8
        </p>
        <h2 className="mt-3 text-2xl font-semibold" style={SERIF}>
          ACTA No. 003
        </h2>
        <p className="mt-1 text-[13px] font-medium tracking-wide uppercase">
          Consejo de Administración
        </p>
        <p className="mt-2 text-[12.5px]" style={{ color: "rgba(34,34,42,0.65)" }}>
          Bogotá D.C., martes 12 de mayo de 2026 · 7:00 p.m. · Salón comunal
          (modalidad mixta)
        </p>
      </div>

      <div className="space-y-6 text-[13px] leading-relaxed">
        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            1. Verificación de quórum
          </h3>
          <p>
            Siendo las 7:08 p.m., el secretario verificó la asistencia de
            cuatro (4) de los cinco (5) miembros principales del Consejo de
            Administración. En consecuencia, y en armonía con el artículo 45
            de la Ley 675 de 2001 —que exige para deliberar válidamente
            «más de la mitad de los coeficientes»—, se declaró la existencia
            de quórum deliberatorio y decisorio conforme al reglamento de
            propiedad horizontal del conjunto.
          </p>
          <p className="mt-2">
            Asistieron igualmente, con voz pero sin voto, la administradora
            del conjunto y el revisor fiscal, invitados para los puntos 3 y 4
            del orden del día.
          </p>
        </section>

        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            2. Orden del día
          </h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Verificación de quórum.</li>
            <li>Lectura y aprobación del acta anterior (Acta No. 002).</li>
            <li>Informe de cartera con corte al 30 de abril de 2026.</li>
            <li>
              Aprobación del mantenimiento correctivo de la bomba eyectora.
            </li>
            <li>Proposiciones y varios.</li>
          </ol>
          <p className="mt-2">
            Sometido a consideración, el orden del día fue aprobado por
            unanimidad (4 votos a favor).
          </p>
        </section>

        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            3. Desarrollo de la sesión
          </h3>

          <p className="font-medium mt-3">3.1. Aprobación del acta anterior</p>
          <p className="mt-1">
            El secretario dio lectura al Acta No. 002, correspondiente a la
            sesión ordinaria del 14 de abril de 2026, remitida previamente a
            los consejeros por correo electrónico. La consejera del puesto 3
            solicitó precisar la fecha de entrega del inventario de zonas
            comunes consignada en los compromisos, corrección que fue
            aceptada.
          </p>
          <p className="mt-2">
            Con la corrección incorporada, el acta fue aprobada por
            unanimidad y se dispuso su firma y archivo en el libro de actas
            del consejo.
          </p>

          <p className="font-medium mt-4">3.2. Informe de cartera</p>
          <p className="mt-1">
            La administradora presentó el informe de cartera con corte al 30
            de abril de 2026: la cartera vencida asciende a $18.420.000 COP,
            equivalente al 6,2&nbsp;% del recaudo esperado, con nueve (9)
            unidades en mora de las 155 que integran el conjunto. Dos (2)
            unidades mantienen acuerdos de pago vigentes y al día, y tres (3)
            unidades concentran el 68&nbsp;% del total de la mora. El recaudo
            del mes alcanzó el 94&nbsp;%.
          </p>
          <p className="mt-2">
            El Consejo, conforme al manual de cartera vigente, aprobó por
            unanimidad remitir a cobro prejurídico la obligación de la unidad
            T2-404, con mora superior a noventa (90) días y saldo de
            $4.150.000 COP, previa última comunicación persuasiva que enviará
            la administración.
          </p>

          <p className="font-medium mt-4">
            3.3. Mantenimiento correctivo de la bomba eyectora
          </p>
          <p className="mt-1">
            La administración presentó tres (3) cotizaciones para el
            mantenimiento correctivo de la bomba eyectora de aguas residuales
            del sótano 2: Hidrobombas S.A.S. por $5.350.000 COP; Técnicos
            Hidráulicos Ltda. por $4.800.000 COP (incluye repuestos
            originales y garantía de doce meses); y Servibombas del Norte por
            $5.120.000 COP.
          </p>
          <p className="mt-2">
            Analizadas las propuestas, el Consejo aprobó por unanimidad
            adjudicar el trabajo a Técnicos Hidráulicos Ltda. por valor de
            $4.800.000 COP, con cargo al rubro de mantenimiento de equipos
            (saldo disponible: $7.200.000 COP). La intervención se ejecutará
            los días 23 y 24 de mayo, con notificación previa a los
            residentes de las torres 1 y 2 por posible suspensión temporal
            del servicio.
          </p>

          <p className="font-medium mt-4">3.4. Proposiciones y varios</p>
          <p className="mt-1">
            Se solicitó a la administración cotizar la instalación de dos
            cámaras adicionales en el parqueadero de visitantes, para
            estudio en la próxima sesión. Se confirmó la jornada de poda y
            jardinería para el sábado 30 de mayo y se recordó a los
            consejeros la asamblea extraordinaria convocada para el 20 de
            junio de 2026.
          </p>
        </section>

        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            4. Compromisos
          </h3>
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr style={{ borderBottom: "1.5px solid #22222a" }}>
                <th className="text-left py-1.5 pr-2 font-semibold">Compromiso</th>
                <th className="text-left py-1.5 pr-2 font-semibold">Responsable</th>
                <th className="text-left py-1.5 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Contratar y programar mantenimiento de la bomba eyectora", "Administradora", "20 may 2026"],
                ["Circular a torres 1 y 2 por suspensión temporal del servicio", "Secretario", "19 may 2026"],
                ["Remitir unidad T2-404 a cobro prejurídico", "Administradora", "22 may 2026"],
                ["Cotizaciones CCTV parqueadero de visitantes", "Administradora", "Próxima sesión"],
              ].map(([c, r, f]) => (
                <tr key={c} style={{ borderBottom: "1px solid rgba(34,34,42,0.15)" }}>
                  <td className="py-1.5 pr-2 align-top">{c}</td>
                  <td className="py-1.5 pr-2 align-top">{r}</td>
                  <td className="py-1.5 align-top whitespace-nowrap">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <p>
            No siendo otro el objeto de la presente reunión, se levantó la
            sesión a las 9:05 p.m. En constancia firman:
          </p>
          <div className="mt-10 grid grid-cols-2 gap-8">
            <div>
              <div style={{ borderTop: "1px solid #22222a" }} className="pt-2">
                <p className="text-[12.5px] font-semibold">María Fernanda Ruiz</p>
                <p className="text-[11.5px]" style={{ color: "rgba(34,34,42,0.6)" }}>
                  Presidente del Consejo
                </p>
              </div>
            </div>
            <div>
              <div style={{ borderTop: "1px solid #22222a" }} className="pt-2">
                <p className="text-[12.5px] font-semibold">Carlos Andrés Pardo</p>
                <p className="text-[11.5px]" style={{ color: "rgba(34,34,42,0.6)" }}>
                  Secretario
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PaperSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Document 2: Informe de Gestión Mensual                              */
/* ------------------------------------------------------------------ */

function InformeDocument() {
  return (
    <PaperSheet>
      <div className="text-center pb-6 mb-8" style={{ borderBottom: "2px solid #22222a" }}>
        <p className="text-[11px] tracking-[0.22em] uppercase" style={{ color: "rgba(34,34,42,0.55)" }}>
          Conjunto Residencial Ejemplo P.H. · NIT 901.234.567-8
        </p>
        <h2 className="mt-3 text-2xl font-semibold" style={SERIF}>
          Informe de Gestión Mensual
        </h2>
        <p className="mt-1 text-[13px] font-medium tracking-wide uppercase">
          Periodo: mayo de 2026
        </p>
        <p className="mt-2 text-[12.5px]" style={{ color: "rgba(34,34,42,0.65)" }}>
          Presentado por la Administración al Consejo de Administración ·
          155 unidades privadas
        </p>
      </div>

      <div className="space-y-6 text-[13px] leading-relaxed">
        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            1. Resumen ejecutivo
          </h3>
          <p>
            Mayo cerró con resultados positivos en los tres frentes de la
            gestión: el recaudo del mes alcanzó el 94&nbsp;% de la
            facturación, la cartera morosa descendió al 6,2&nbsp;% gracias a
            dos acuerdos de pago formalizados, y la ejecución presupuestal
            acumulada se ubicó en el 91&nbsp;%, dentro del rango proyectado.
            Se ejecutó el mantenimiento correctivo de la bomba eyectora
            aprobado por el Consejo, sin afectaciones mayores al servicio.
          </p>
        </section>

        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            2. Indicadores del periodo
          </h3>
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr style={{ borderBottom: "1.5px solid #22222a" }}>
                <th className="text-left py-2 pr-2 font-semibold">Indicador</th>
                <th className="text-left py-2 pr-2 font-semibold">Resultado</th>
                <th className="text-left py-2 font-semibold">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid rgba(34,34,42,0.15)" }}>
                <td className="py-2 pr-2">Recaudo del mes</td>
                <td className="py-2 pr-2 font-semibold">94&nbsp;%</td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: "#15803d" }}>
                    <TrendingUp className="h-3.5 w-3.5" /> +2,1 pts
                  </span>
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid rgba(34,34,42,0.15)" }}>
                <td className="py-2 pr-2">Cartera morosa</td>
                <td className="py-2 pr-2 font-semibold">6,2&nbsp;%</td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: "#15803d" }}>
                    <TrendingDown className="h-3.5 w-3.5" /> −0,8 pts
                  </span>
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid rgba(34,34,42,0.15)" }}>
                <td className="py-2 pr-2">Ejecución presupuestal</td>
                <td className="py-2 pr-2 font-semibold">91&nbsp;%</td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1 font-medium" style={{ color: "rgba(34,34,42,0.6)" }}>
                    <Minus className="h-3.5 w-3.5" /> En rango
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            3. Gestión operativa
          </h3>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Mantenimiento correctivo de la bomba eyectora del sótano 2
              ejecutado los días 23 y 24 de mayo por Técnicos Hidráulicos
              Ltda. ($4.800.000 COP), con prueba de funcionamiento
              satisfactoria y garantía de 12 meses.
            </li>
            <li>
              Jornada de poda y jardinería realizada el 30 de mayo en zonas
              comunes y taludes perimetrales, con disposición certificada de
              residuos vegetales.
            </li>
            <li>
              Mantenimiento preventivo mensual de los ascensores de la torre
              3 sin novedades; bitácoras actualizadas y disponibles en la
              administración.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            4. PQRS del periodo
          </h3>
          <p>
            Se recibieron doce (12) PQRS, de las cuales once (11) fueron
            resueltas dentro del mes (92&nbsp;% de cierre) y una (1) continúa
            en trámite dentro del término de respuesta. El tiempo promedio de
            atención fue de 2,3 días hábiles. Los temas más frecuentes:
            ruido en horarios no permitidos (4), parqueaderos de visitantes
            (3) y solicitudes de paz y salvo (3).
          </p>
        </section>

        <section>
          <h3 className="text-[14px] font-semibold mb-2" style={SERIF}>
            5. Próximos vencimientos
          </h3>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Recarga y certificación de extintores — 30 de junio de 2026.</li>
            <li>Asamblea extraordinaria de copropietarios — 20 de junio de 2026.</li>
            <li>Certificación anual de ascensores — 15 de julio de 2026.</li>
            <li>Renovación de la póliza de zonas comunes — 1 de agosto de 2026.</li>
          </ul>
        </section>

        <section>
          <div className="mt-8 max-w-[260px]">
            <div style={{ borderTop: "1px solid #22222a" }} className="pt-2">
              <p className="text-[12.5px] font-semibold">Laura Gómez Cárdenas</p>
              <p className="text-[11.5px]" style={{ color: "rgba(34,34,42,0.6)" }}>
                Administradora · Conjunto Residencial Ejemplo P.H.
              </p>
            </div>
          </div>
        </section>
      </div>
    </PaperSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "acta", label: "Acta de Consejo", icon: FileText },
  { id: "informe", label: "Informe de Gestión", icon: BarChart3 },
] as const;

export default function DemoTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("acta");

  return (
    <div>
      {/* Pill switcher */}
      <div className="flex justify-center mb-10">
        <div
          className="inline-flex items-center gap-1 rounded-full border p-1"
          style={{ background: "#15151a", borderColor: "rgba(255,255,255,0.07)" }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[12.5px] font-medium transition-all"
                style={
                  active
                    ? {
                        background: "#7c5cff",
                        color: "#ffffff",
                        boxShadow: "0 4px 16px -4px rgba(124,92,255,0.5)",
                      }
                    : { color: "rgba(246,245,247,0.66)" }
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "acta" ? <ActaDocument /> : <InformeDocument />}
      <GeneratedRow />
    </div>
  );
}
