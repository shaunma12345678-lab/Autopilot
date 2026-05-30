import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

  if (error || !code || !state) {
    return Response.redirect(`${appUrl}/integrations?error=google_denied`)
  }

  let userId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString())
    userId = decoded.userId
    if (!userId) throw new Error("no userId")
  } catch {
    return Response.redirect(`${appUrl}/integrations?error=invalid_state`)
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri  = `${appUrl}/api/auth/google/callback`

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error("[google-oauth] token exchange failed:", err)
      return Response.redirect(`${appUrl}/integrations?error=token_exchange_failed`)
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      scope: string
    }

    // Fetch user profile from Google
    const profileRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = await profileRes.json() as { email?: string; name?: string }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    // Upsert the connected account
    await prisma.connectedAccount.upsert({
      where:  { userId_provider: { userId, provider: "google" } },
      update: {
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt,
        accountEmail: profile.email,
        accountName:  profile.name,
        scopes:       tokens.scope.split(" "),
        updatedAt:    new Date(),
      },
      create: {
        userId,
        provider:     "google",
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        accountEmail: profile.email,
        accountName:  profile.name,
        scopes:       tokens.scope.split(" "),
      },
    })

    return Response.redirect(`${appUrl}/integrations?connected=google`)
  } catch (err) {
    console.error("[google-oauth] callback error:", err)
    return Response.redirect(`${appUrl}/integrations?error=server_error`)
  }
}
