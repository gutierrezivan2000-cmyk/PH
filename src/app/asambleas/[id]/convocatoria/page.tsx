export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "./PrintButton";

function fechaLarga(d: Date): string {
  return d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function hora(d: Date): string {
  return d.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

const MODALITY_LABELS: Record<string, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  mixta: "Mixta (presencial y virtual)",
};

export default async function ConvocatoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/asambleas/${id}/convocatoria`)}`);
  }

  // Demo mode never touches the DB (db is a stub there).
  if (process.env.DEMO_MODE === "true") notFound();

  const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
  await ensureAdminSchema();

  const assembly = await db.assembly.findFirst({
    where: { id, userId: session.user.id },
    include: { property: { select: { name: true, address: true, city: true } } },
  });
  if (!assembly) notFound();

  const admin = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, company: true, logoUrl: true, brandColor: true },
  });

  const accent =
    admin?.brandColor && /^#[0-9a-fA-F]{6}$/.test(admin.brandColor)
      ? admin.brandColor
      : "#7c3aed";
  const issuerName = admin?.company || admin?.name || "La Administración";
  const agenda = (Array.isArray(assembly.agenda) ? assembly.agenda : []) as string[];
  const isOrdinaria = assembly.type === "ordinaria";
  const cancelled = assembly.status === "cancelada";
  const propLocation = [assembly.property.address, assembly.property.city]
    .filter(Boolean)
    .join(", ");

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

        {cancelled && (
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
            ASAMBLEA CANCELADA — ESTA CONVOCATORIA NO ESTÁ VIGENTE
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          {admin?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={admin.logoUrl}
              alt={issuerName}
              style={{ maxHeight: 56, maxWidth: 220, margin: "0 auto 12px", display: "block" }}
            />
          ) : (
            <p style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>{issuerName}</p>
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
            Administración · {assembly.property.name}
          </p>
        </div>

        <h1
          style={{
            textAlign: "center",
            fontSize: 22,
            letterSpacing: "0.06em",
            margin: "0 0 6px",
            color: "#111827",
            textTransform: "uppercase",
          }}
        >
          Convocatoria a Asamblea General {isOrdinaria ? "Ordinaria" : "Extraordinaria"}
        </h1>
        <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", margin: "0 0 32px" }}>
          {assembly.property.name}
          {propLocation ? ` · ${propLocation}` : ""}
        </p>

        <p style={{ fontSize: 14.5, lineHeight: 1.9, margin: "0 0 20px", textAlign: "justify" }}>
          En ejercicio de las facultades legales y estatutarias (artículo{" "}
          {isOrdinaria ? "39" : "39 y siguientes"} de la Ley 675 de 2001 y el reglamento de
          propiedad horizontal), la administración de la copropiedad{" "}
          <strong>{assembly.property.name}</strong> se permite convocar a todos los
          propietarios de unidades privadas a la{" "}
          <strong>
            Asamblea General {isOrdinaria ? "Ordinaria" : "Extraordinaria"} de Copropietarios
          </strong>
          , que se celebrará así:
        </p>

        {/* Details table */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            overflow: "hidden",
            margin: "0 0 28px",
            fontSize: 14,
          }}
        >
          {[
            { label: "Fecha", value: fechaLarga(assembly.date) },
            { label: "Hora", value: hora(assembly.date) },
            { label: "Modalidad", value: MODALITY_LABELS[assembly.modality] || assembly.modality },
            ...(assembly.location
              ? [
                  {
                    label: assembly.modality === "virtual" ? "Enlace" : "Lugar",
                    value: assembly.location,
                  },
                ]
              : []),
          ].map((row, i) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                borderTop: i > 0 ? "1px solid #e5e7eb" : "none",
              }}
            >
              <div
                style={{
                  width: 130,
                  padding: "10px 16px",
                  background: "#f9fafb",
                  fontWeight: 700,
                  fontSize: 12.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#4b5563",
                  flexShrink: 0,
                }}
              >
                {row.label}
              </div>
              <div style={{ padding: "10px 16px", wordBreak: "break-word" }}>{row.value}</div>
            </div>
          ))}
        </div>

        {/* Agenda */}
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            margin: "0 0 12px",
          }}
        >
          Orden del día
        </p>
        <ol style={{ fontSize: 14.5, lineHeight: 1.9, margin: "0 0 28px", paddingLeft: 24 }}>
          {agenda.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {item}
            </li>
          ))}
        </ol>

        {/* Legal notes */}
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "16px 20px",
            fontSize: 12.5,
            lineHeight: 1.8,
            color: "#374151",
            margin: "0 0 36px",
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            <strong>Quórum:</strong> la asamblea sesionará con un número plural de propietarios
            que represente más del 50% de los coeficientes de copropiedad (Art. 45, Ley 675 de
            2001). Si no se logra el quórum, se convocará a una nueva reunión que sesionará el{" "}
            <strong>tercer día hábil siguiente a las 8:00 p.m.</strong> con cualquier número
            plural de asistentes (Art. 41).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Representación:</strong> los propietarios que no puedan asistir podrán
            hacerse representar mediante poder escrito, indicando el nombre del apoderado y la
            unidad representada.
          </p>
          {!isOrdinaria && (
            <p style={{ margin: 0 }}>
              <strong>Nota:</strong> por tratarse de asamblea extraordinaria, solo podrán
              tratarse los temas incluidos en el orden del día de esta convocatoria (Art. 39).
            </p>
          )}
        </div>

        {/* Signature */}
        <div>
          <div style={{ width: 260, borderTop: "1px solid #9ca3af", paddingTop: 8 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{issuerName}</p>
            <p style={{ fontSize: 12.5, color: "#6b7280", margin: "2px 0 0" }}>
              Administración — {assembly.property.name}
            </p>
          </div>
        </div>

        <p
          style={{
            fontSize: 10,
            color: "#9ca3af",
            margin: "28px 0 0",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Convocatoria generada con SOPH.IA · {new Date().getFullYear()}
        </p>
      </div>

      <PrintButton />
    </div>
  );
}
