import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Detects whether a hostname is the admin subdomain.
 * Configurable via NEXT_PUBLIC_ADMIN_HOSTNAME or by the "admin." prefix.
 */
function isAdminHost(hostname: string): boolean {
  const configured = (process.env.NEXT_PUBLIC_ADMIN_HOSTNAME || "").toLowerCase();
  const h = hostname.toLowerCase();
  if (configured && h === configured) return true;
  return h.startsWith("admin.");
}

export function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  const host = req.headers.get("host") || "";
  const hostname = host.split(":")[0];

  // ── Admin subdomain: rewrite page requests to the /admin route group ──
  if (isAdminHost(hostname)) {
    if (
      url.pathname.startsWith("/admin") ||
      url.pathname.startsWith("/api") ||
      url.pathname.startsWith("/_next") ||
      url.pathname.startsWith("/favicon") ||
      /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/i.test(url.pathname)
    ) {
      return NextResponse.next();
    }
    url.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // ── Regular host: block direct /admin access (admin lives on its subdomain) ──
  if (url.pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  // ── Auth redirects for the main app ──
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value ??
    req.cookies.get("next-auth.session-token")?.value ??
    req.cookies.get("__Secure-next-auth.session-token")?.value;

  const isLoggedIn = !!sessionToken;
  const isAuthPage = url.pathname.startsWith("/login");
  const isDashboard = url.pathname.startsWith("/dashboard");

  // Redirect logged-in users away from the login page
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Protect dashboard routes
  if (!isLoggedIn && isDashboard) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except API routes and static assets, so the admin
  // subdomain rewrite can cover all page paths (including "/").
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
