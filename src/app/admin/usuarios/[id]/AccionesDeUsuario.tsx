import { NotaAutoconcesion } from "@/components/admin/NotaAutoconcesion";
import { autoconcesionBloqueada } from "@/lib/admin/autoconcesion";
import { AccesoButton } from "./AccesoButton";
import { BanButton } from "./BanButton";
import { RoleButton } from "./RoleButton";

/**
 * Acciones del encabezado de la ficha de un usuario.
 *
 * «Dar acceso» sobre la PROPIA cuenta de un administrador que no es propietario termina en 403 (lib/admin/autoconcesion.ts),
 * así que en ese caso no se ofrece el botón y se explica por qué. Los propietarios sí lo ven (para probar planes en su cuenta).
 */
export function AccionesDeUsuario({
  userId,
  role,
  banned,
  adminId,
  esPropietario,
}: {
  userId: string;
  role: string;
  banned: boolean;
  /** Quien mira la pantalla (null si no se pudo resolver la sesión). */
  adminId: string | null;
  /** Si quien mira es propietario de la plataforma (esAdminDeEntorno). */
  esPropietario: boolean;
}) {
  const isSelf = adminId === userId;
  const sinAutoconcesion = autoconcesionBloqueada(adminId ?? "", userId, esPropietario);
  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      {sinAutoconcesion ? <NotaAutoconcesion className="max-w-xs text-right" /> : <AccesoButton userId={userId} />}
      {esPropietario && <RoleButton userId={userId} currentRole={role} isSelf={isSelf} />}
      <BanButton userId={userId} banned={banned} isSelf={isSelf} />
    </div>
  );
}
