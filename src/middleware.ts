import { NextRequest, NextResponse } from "next/server";

/**
 * Detects whether a hostname is the admin subdomain.
 * Configurable via NEXT_PUBLIC_ADMIN_HOSTNAME or by prefix "admin.".
 */
function isAdminHost(hostname: string): boolean {
  const configured = (process.env.NEXT_PUBLIC_ADMIN_HOSTNAME || "").toLowerCase();
  const h = hostname.toLowerCase();
  if (configured && h === configured) return true;
  if (configured && h === configured.replace(/^https?:\/\//, "")) return true;
  return h.startsWith("admin.");
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = req.headers.get("host") || "";
  const hostname = host.split(":")[0];

  if (isAdminHost(hostname)) {
    // Already on /admin path? leave it.
    if (url.pathname.startsWith("/admin")) {
      return NextResponse.next();
    }
    // API routes pass through as-is (the /api/admin/* are gated server-side).
    if (url.pathname.startsWith("/api")) {
      return NextResponse.next();
    }
    // Static assets / Next internals pass through.
    if (
      url.pathname.startsWith("/_next") ||
      url.pathname.startsWith("/favicon") ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/i.test(url.pathname)
    ) {
      return NextResponse.next();
    }
    // Rewrite admin subdomain root and other paths to the /admin route group.
    url.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // On the regular host, block direct access to /admin (defense in depth).
  // Admins should go via the admin subdomain.
  if (url.pathname.startsWith("/admin")) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
