import { createServerClient } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must happen before any other logic
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Helper: copy refreshed session cookies onto any response we return.
  // Without this, token refreshes made during getUser() are silently discarded
  // whenever we return a redirect instead of supabaseResponse.
  function withSessionCookies(response: NextResponse): NextResponse {
    supabaseResponse.cookies.getAll().forEach(c =>
      response.cookies.set(c.name, c.value, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      })
    )
    return response
  }

  // Logged-in users hitting /, /login, or /signup → dashboard
  if (user && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    return withSessionCookies(
      NextResponse.redirect(new URL("/dashboard", request.url))
    )
  }

  // Routes that are always public (no login required)
  const publicPaths = [
    "/",
    "/login",
    "/signup",
    "/api/webhooks",
    "/api/auth",
    // Foreclosure tool — admin accesses directly without login
    "/foreclosure-leads",
    "/api/leads/foreclosure-search",
    "/api/leads/at-risk-search",
    "/api/leads/foreclosure-outreach",
    "/api/leads/foreclosure-send",
  ]

  const isPublic =
    publicPaths.some(p => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/js") ||
    /\.(ico|svg|png|jpg|jpeg|webp|gif|woff2?)$/.test(pathname)

  // Protected dashboard routes — redirect unauthenticated users to login
  const isDashboardRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/content") ||
    pathname.startsWith("/reputation") ||
    pathname.startsWith("/leads") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/onboarding")

  if (isDashboardRoute && !user) {
    return withSessionCookies(
      NextResponse.redirect(new URL("/login", request.url))
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
}
