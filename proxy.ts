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

  // Refresh session on every request (must happen before any redirect logic)
  await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Everyone hits / → go straight to the tool, no login gate
  if (pathname === "/") {
    const dest = NextResponse.redirect(new URL("/foreclosure-leads", request.url))
    supabaseResponse.cookies.getAll().forEach(c =>
      dest.cookies.set(c.name, c.value, { httpOnly: true, secure: true, sameSite: "lax", path: "/" })
    )
    return dest
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
}
