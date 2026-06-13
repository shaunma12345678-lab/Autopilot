import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { Resend } from "resend"
import { isMissingTableError } from "@/lib/db-guard"

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}


export async function POST(request: NextRequest) {
  try {
  const _supabase = await createSupabaseServerClient()
  const { data: { user: _sessionUser } } = await _supabase.auth.getUser()
  const user = _sessionUser ?? await prisma.user.findFirst()
  if (!user) return Response.json({ error: "Service unavailable" }, { status: 503 })
    const { email } = await request.json()
    if (!email || !email.includes("@")) {
      return Response.json({ error: "Enter a valid email address" }, { status: 400 })
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Store the pending verification
    await prisma.connectedAccount.upsert({
      where:  { userId_provider: { userId: user.id, provider: "gmail_pending" } },
      update: {
        accessToken:  code,
        accountEmail: email,
        expiresAt,
        updatedAt:    new Date(),
      },
      create: {
        userId:       user.id,
        provider:     "gmail_pending",
        accessToken:  code,
        accountEmail: email,
        expiresAt,
      },
    })

    // Try to send via Resend
    const resendKey = process.env.RESEND_API_KEY
    let sent = false

    if (resendKey) {
      try {
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from:    process.env.FROM_EMAIL ?? "hello@autopilot.ai",
          to:      email,
          subject: `${code} — Your AutoPilot verification code`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
              <h2 style="font-size:24px;font-weight:700;margin-bottom:8px">Verify your Gmail</h2>
              <p style="color:#6b7280;margin-bottom:24px">Enter this code in AutoPilot to connect your Gmail account:</p>
              <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                <span style="font-size:40px;font-weight:800;letter-spacing:8px;color:#111827">${code}</span>
              </div>
              <p style="color:#9ca3af;font-size:14px">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
            </div>
          `,
        })
        sent = true
      } catch (e) {
        console.error("[gmail-verify] Resend error:", e)
      }
    }

    return Response.json({
      success: true,
      sent,
      // Only expose code in dev when email sending isn't configured
      ...((!sent && process.env.NODE_ENV !== "production") ? { devCode: code } : {}),
    })
  } catch (err) {
    if (isMissingTableError(err)) {
      return Response.json({ error: "Database migration needed. Contact support." }, { status: 503 })
    }
    console.error("[gmail-verify]", err)
    return Response.json({ error: "Failed to send verification" }, { status: 500 })
  }
}
