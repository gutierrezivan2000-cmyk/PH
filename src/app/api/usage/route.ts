import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageSummary } from "@/lib/usage";
import { getUsageSummary as getDemoUsage, DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (IS_DEMO) {
    return NextResponse.json(getDemoUsage(DEMO_USER.id));
  }

  const usage = await getUsageSummary(session.user.id);
  return NextResponse.json(usage);
}
