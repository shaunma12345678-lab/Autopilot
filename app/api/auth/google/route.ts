import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"

// Scopes we request — covers Gmail send, Google Business read, basic profile
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/business.manage",
].join(" ")

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return Response.json(
      { error: "Google OAuth not configured. Add GOOGLE_CLIENT_ID to environment variables." },
      { status: 501 }
    )
  }

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const redirectUri = `${appUrl}/api/auth/google/callback`

  // State = base64 of userId so callback knows who is connecting
  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString("base64url")

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",   // get refresh_token
    prompt:        "consent",   // force consent so we always get refresh_token
    state,
  })

  return Response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
}
