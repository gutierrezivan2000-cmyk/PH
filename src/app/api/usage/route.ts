import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageSummary } from "@/lib/usage";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usage = await getUsageSummary(session.user.id);
  return NextResponse.json(usage);
}
