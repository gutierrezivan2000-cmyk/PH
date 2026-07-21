export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { PrintButton } from "./PrintButton";

const TYPE_TITLES: Record<string, string> = {
  paz_y_salvo: "PAZ Y SALVO",
  residencia: "CERTIFICADO DE RESIDENCIA",
};

function fechaLarga(d: Date): string {
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function fechaDesdeIso(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return fechaLarga(new Date(y, m - 1, day, 12));
}

interface Meta {
  recipientDocument?: string;
  validUntil?: string;
  residesSince?: string;
  note?: string;
}

export default async function ImprimirCertificadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/certificados/${id}/imprimir`)}`);
  }

  // Demo mode never touches the DB (db is a stub there).
  if (process.env.DEMO_MODE === "true") notFound();

  const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
  await ensureAdminSchema();

  const cert = await db.certificate.findFirst({
    where: { id, userId: session.user.id },
    include: { property: { select: { name: true, address: true, city: true } } },
  });
  if (!cert) notFound();

  const admin = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, company: true, logoUrl: true, brandColor: true },
  });

  const h = await headers();
  const host = h.get("host") || "sophia.app";
  const proto = h.get("x-forwarded-proto") || "https";
  const verifyUrl = `${proto}://${host}/verificar/${cert.verifyCode}`;
  const qrSvg = await QRCode.toString(verifyUrl, {
    type: "svg",
    margin: 0,
    width: 84, // must match the 84px container in the verification footer
    color: { dark: "#1f2937", light: "#ffffff" },
  });

  const revoked = cert.status !== "valid";

  const meta = (cert.meta as Meta | null) || {};
  const accent =
    admin?.brandColor && /^#[0-9a-fA-F]{6}$/.test(admin.brandColor)
      ? admin.brandColor
      : "#7c3aed";
  const issuerName = admin?.company || admin?.name || "La Administración";
  const title = TYPE_TITLES[cert.type] || "CERTIFICADO";
  const propLocation = [cert.property.address, cert.property.city]
    .filter(Boolean)
    .join(", ");

  const cuerpo =
    cert.type === "paz_y_salvo" ? (
      <>
        Que la unidad <strong>{cert.unitLabel}</strong> de la copropiedad{" "}
        <strong>{cert.property.name}</strong>
        {propLocation ? `, ubicada en ${propLocation},` : ""} a nombre de{" "}
        <strong>{cert.recipientName}</strong>
        {meta.recipientDocument ? (
          <>
            , identificado(a) con documento No.{" "}
            <strong>{meta.recipientDocument}</strong>,
          </>
        ) : (
          ","
        )}{" "}
        se encuentra <strong>A PAZ Y SALVO</strong> por todo concepto de cuotas de
        administración y demás obligaciones económicas con la copropiedad
        {meta.validUntil ? (
          <>
            {" "}
            hasta el <strong>{fechaDesdeIso(meta.validUntil)}</strong>
          </>
        ) : null}
        .
      </>
    ) : (
      <>
        Que <strong>{cert.recipientName}</strong>
        {meta.recipientDocument ? (
          <>
            , identificado(a) con documento No.{" "}
            <strong>{meta.recipientDocument}</strong>,
          </>
        ) : null}{" "}
        reside en la unidad <strong>{cert.unitLabel}</strong> de la copropiedad{" "}
        <strong>{cert.property.name}</strong>
        {propLocation ? `, ubicada en ${propLocation}` : ""}
        {meta.residesSince ? (
          <>
            , desde <strong>{meta.residesSince}</strong>
          </>
        ) : null}
        .
      </>
    );

  return (
    <div style={{ background: "#e5e7eb", minHeight: "100vh", padding: "24px 12px" }}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .cert-sheet { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
          @page { margin: 18mm; }
        }
      `}</style>

      <PrintButton />

      <div
        className="cert-sheet"
        style={{
          maxWidth: 700,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          padding: "56px 60px",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#1f2937",
          position: "relative",
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: accent,
            borderRadius: "12px 12px 0 0",
          }}
        />

        {/* Revoked banner — intentionally NOT .no-print: it must appear on paper */}
        {revoked && (
          <div
            style={{
              background: "#fef2f2",
              border: "2px solid #dc2626",
              color: "#b91c1c",
              textAlign: "center",
              fontWeight: 700,
              letterSpacing: "0.08em",
              fontSize: 13,
              padding: "10px 16px",
              borderRadius: 8,
              margin: "0 0 24px",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            DOCUMENTO REVOCADO
            {cert.revokedAt ? ` el ${fechaLarga(cert.revokedAt)}` : ""} — NO VÁLIDO
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          {admin?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={admin.logoUrl}
              alt={issuerName}
              style={{ maxHeight: 56, maxWidth: 220, margin: "0 auto 12px", display: "block" }}
            />
          ) : (
            <p
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "0.02em",
                margin: "0 0 6px",
              }}
            >
              {issuerName}
            </p>
          )}
          <p
            style={{
              fontSize: 12,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              margin: 0,
            }}
          >
            Administración · {cert.property.name}
          </p>
        </div>

        <h1
          style={{
            textAlign: "center",
            fontSize: 26,
            letterSpacing: "0.10em",
            margin: "0 0 8px",
            color: "#111827",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#9ca3af",
            letterSpacing: "0.08em",
            margin: "0 0 36px",
            fontFamily: "monospace",
          }}
        >
          No. {cert.verifyCode}
        </p>

        <p style={{ fontSize: 14.5, lineHeight: 1.9, margin: "0 0 8px" }}>
          La administración de la copropiedad <strong>{cert.property.name}</strong>,
          en ejercicio de sus funciones (Ley 675 de 2001),
        </p>
        <p
          style={{
            textAlign: "center",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.16em",
            margin: "24px 0",
          }}
        >
          HACE CONSTAR:
        </p>

        <p style={{ fontSize: 14.5, lineHeight: 1.9, margin: "0 0 20px", textAlign: "justify" }}>
          {cuerpo}
        </p>

        {meta.note && (
          <p style={{ fontSize: 13.5, lineHeight: 1.8, margin: "0 0 20px", textAlign: "justify", color: "#374151" }}>
            {meta.note}
          </p>
        )}

        <p style={{ fontSize: 14.5, lineHeight: 1.9, margin: "0 0 44px" }}>
          Se expide a solicitud del interesado en {cert.property.city || "Colombia"}, el{" "}
          {fechaLarga(cert.createdAt)}.
        </p>

        {/* Signature */}
        <div style={{ marginBottom: 44 }}>
          <div style={{ width: 260, borderTop: "1px solid #9ca3af", paddingTop: 8 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{issuerName}</p>
            <p style={{ fontSize: 12.5, color: "#6b7280", margin: "2px 0 0" }}>
              Administración — {cert.property.name}
            </p>
          </div>
        </div>

        {/* Verification footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            borderTop: "1px solid #e5e7eb",
            paddingTop: 20,
          }}
        >
          <div
            style={{ width: 84, height: 84, flexShrink: 0 }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
            <p style={{ fontSize: 11.5, color: "#374151", margin: "0 0 4px", fontWeight: 600 }}>
              Verificación de autenticidad
            </p>
            <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 2px", lineHeight: 1.5 }}>
              Escanee el código QR o visite:
            </p>
            <p style={{ fontSize: 11, color: "#374151", margin: 0, fontFamily: "monospace", wordBreak: "break-all" }}>
              {verifyUrl}
            </p>
            <p style={{ fontSize: 10, color: "#9ca3af", margin: "6px 0 0" }}>
              Documento expedido digitalmente con SOPH.IA. Si el estado en línea aparece como
              revocado o no existe, el documento no es válido.
            </p>
          </div>
        </div>
      </div>

      <PrintButton />
    </div>
  );
}
