import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LIMITES, colorHex, cuerpoComoObjeto, textoAcotado, urlHttps } from "@/lib/validar-entrada";

const IS_DEMO = process.env.DEMO_MODE === "true";

/** Lo único que la pantalla de Configuración y el inicio leen del perfil: nunca la fila entera (hash, llaves de pago…). */
const CAMPOS_DEL_PERFIL = {
  name: true,
  email: true,
  image: true,
  cargo: true,
  phone: true,
  company: true,
  city: true,
  onboarded: true,
  logoUrl: true,
  brandColor: true,
} as const;

/** Lo que se puede guardar del perfil. Ningún otro campo del cuerpo (rol, bloqueo, plan, id, correo…) llega a la base. */
type DatosDelPerfil = {
  name?: string;
  cargo?: string;
  phone?: string;
  company?: string;
  city?: string;
  onboarded?: boolean;
  brandColor?: string | null;
  logoUrl?: string | null;
};

/**
 * Arma lo que se guarda a partir del cuerpo: solo los campos de la lista blanca, de tipo texto, recortados y con su
 * largo máximo. Un campo ausente no se toca; "" borra (logo y color pasan a null).
 * `logoActual` es el logo ya guardado: reenviar el mismo valor no se vuelve a exigir, para que guardar el resto del
 * perfil no falle por un logo anterior a estas reglas.
 */
function validarPerfil(
  cuerpo: Record<string, unknown>,
  logoActual: string | null | undefined,
): { ok: true; datos: DatosDelPerfil } | { ok: false; error: string } {
  const datos: DatosDelPerfil = {};

  const textos = [
    ["name", "El nombre", LIMITES.nombre],
    ["cargo", "El cargo", LIMITES.cargo],
    ["phone", "El teléfono", LIMITES.telefono],
    ["company", "La empresa", LIMITES.empresa],
    ["city", "La ciudad", LIMITES.ciudad],
  ] as const;
  for (const [campo, etiqueta, max] of textos) {
    if (cuerpo[campo] === undefined) continue;
    const v = textoAcotado(cuerpo[campo], etiqueta, max);
    if (!v.ok) return v;
    datos[campo] = v.valor;
  }

  if (cuerpo.onboarded !== undefined) {
    if (typeof cuerpo.onboarded !== "boolean") return { ok: false, error: "onboarded debe ser verdadero o falso." };
    datos.onboarded = cuerpo.onboarded;
  }

  if (cuerpo.brandColor !== undefined) {
    const v = colorHex(cuerpo.brandColor, "El color de marca");
    if (!v.ok) return v;
    datos.brandColor = v.valor || null;
  }

  if (cuerpo.logoUrl !== undefined) {
    const sinCambio = typeof cuerpo.logoUrl === "string" && logoActual && cuerpo.logoUrl === logoActual;
    if (!sinCambio) {
      const v = urlHttps(cuerpo.logoUrl, "El logo");
      if (!v.ok) return v;
      datos.logoUrl = v.valor || null;
    }
  }

  return { ok: true, datos };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (IS_DEMO) {
    return NextResponse.json({
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      cargo: "Administrador (demo)",
      phone: "",
      company: "",
      city: "",
      onboarded: true,
    });
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const user = await db.user.findUnique({
      where: { email: session.user.email! },
      select: CAMPOS_DEL_PERFIL,
    });
    if (!user) {
      return NextResponse.json({
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        cargo: "",
        phone: "",
        company: "",
        city: "",
        onboarded: false,
      });
    }
    return NextResponse.json({
      name: user.name,
      email: user.email,
      image: user.image,
      cargo: user.cargo ?? "",
      phone: user.phone ?? "",
      company: user.company ?? "",
      city: user.city ?? "",
      onboarded: user.onboarded,
      logoUrl: user.logoUrl ?? "",
      brandColor: user.brandColor ?? "",
    });
  } catch (error) {
    console.error("[PROFILE GET]", error);
    // A DB blip must NOT look like "new, unonboarded user" — that would bounce
    // an already-configured user back into the onboarding wizard (and let them
    // create a duplicate property). Signal the error so the client can tell.
    return NextResponse.json(
      {
        error: true,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        onboarded: true,
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cuerpo = cuerpoComoObjeto(await req.json().catch(() => null));
  if (!cuerpo) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (IS_DEMO) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    // Find or create user by email
    let user = await db.user.findUnique({ where: { email: session.user.email! }, select: { id: true, logoUrl: true } });

    const v = validarPerfil(cuerpo, user?.logoUrl);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }

    if (!user) {
      user = await db.user.create({
        data: {
          email: session.user.email!,
          name: session.user.name,
          image: session.user.image,
        },
        select: { id: true, logoUrl: true },
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: v.datos,
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // El detalle va al log; al cliente no se le devuelve el texto del error de la base.
    console.error("[PROFILE PUT]", error instanceof Error ? error.message : String(error), error);
    return NextResponse.json({ error: "No se pudo guardar el perfil. Inténtalo de nuevo." }, { status: 500 });
  }
}
