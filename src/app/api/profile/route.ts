import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const IS_DEMO = process.env.DEMO_MODE === "true";

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

  const body = await req.json();
  const { name, cargo, phone, company, city, onboarded } = body;

  // Branding: validate a hex color and an https logo URL before storing.
  const brandColor =
    typeof body.brandColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.brandColor.trim())
      ? body.brandColor.trim()
      : body.brandColor === "" ? "" : undefined;
  const logoUrl =
    typeof body.logoUrl === "string" && (/^https:\/\//.test(body.logoUrl) || body.logoUrl === "")
      ? body.logoUrl
      : undefined;

  if (IS_DEMO) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    // Find or create user by email
    let user = await db.user.findUnique({ where: { email: session.user.email! } });
    if (!user) {
      user = await db.user.create({
        data: {
          email: session.user.email!,
          name: session.user.name,
          image: session.user.image,
        },
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(cargo !== undefined && { cargo }),
        ...(phone !== undefined && { phone }),
        ...(company !== undefined && { company }),
        ...(city !== undefined && { city }),
        ...(onboarded !== undefined && { onboarded }),
        ...(brandColor !== undefined && { brandColor: brandColor || null }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PROFILE PUT]", msg, error);
    return NextResponse.json({ error: `Error: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
