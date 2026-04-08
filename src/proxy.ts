import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Proxy function (replaces middleware in Next.js 16)
// Full auth validation happens in the API routes via auth()
export function proxy(req: NextRequest) {
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  const isLoggedIn = !!sessionToken;
  const isAuthPage = req.nextUrl.pathname.startsWith("/login");
  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isApiAuth = req.nextUrl.pathname.startsWith("/api/auth");
  const isApiStripeWebhook = req.nextUrl.pathname === "/api/stripe/webhook";

  // Allow auth API and Stripe webhook
  if (isApiAuth || isApiStripeWebhook) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from login page
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  // Protect dashboard
  if (!isLoggedIn && isDashboard) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
