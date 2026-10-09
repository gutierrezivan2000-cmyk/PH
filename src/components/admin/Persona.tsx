import Link from "next/link";
import { codigoDeUsuario } from "@/lib/admin/identidad";

/** Cómo se muestra a un cliente en el panel: foto o inicial, nombre, correo y su código. */
export function Persona({
  id,
  name,
  email,
  image,
  enlace = true,
  grande = false,
}: {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  enlace?: boolean;
  grande?: boolean;
}) {
  const lado = grande ? 56 : 32;
  const inicial = (name?.trim()?.[0] || email?.[0] || "?").toUpperCase();
  const nombre = name?.trim() || email?.split("@")[0] || "Sin nombre";
  const contenido = (
    <div className="flex items-center gap-3 min-w-0">
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white overflow-hidden"
        style={{ width: lado, height: lado, fontSize: grande ? 18 : 12, background: image ? undefined : "linear-gradient(135deg, var(--accent), var(--accent-lo))" }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" referrerPolicy="no-referrer" style={{ width: lado, height: lado, objectFit: "cover" }} />
        ) : (
          inicial
        )}
      </div>
      <div className="min-w-0">
        <p className={`${grande ? "text-[16px] font-semibold" : "text-[13px] font-medium"} text-foreground truncate`}>{nombre}</p>
        <p className="text-[11.5px] text-muted-foreground truncate" style={{ fontFamily: "var(--font-mono)" }}>
          {email || "—"} · {codigoDeUsuario(id)}
        </p>
      </div>
    </div>
  );
  return enlace ? (
    <Link href={`/admin/usuarios/${id}`} className="block min-w-0 hover:opacity-80 transition-opacity">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}

/** Fecha corta para tablas del panel (o «—»). */
export function fechaCorta(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit", timeZone: "America/Bogota" });
}

/** Fecha y hora para fichas del panel (o «—»). */
export function fechaLarga(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });
}
