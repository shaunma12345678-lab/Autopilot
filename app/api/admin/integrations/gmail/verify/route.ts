import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { Resend } from "resend"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function getAdminUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (!ADMIN_PASSWORD || pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { email } = await request.json()
    if (!email || !email.includes("@")) {
      return Response.json({ error: "Enter a valid email address" }, { status: 400 })
    }

    const userId = await getAdminUserId()
    if (!userId) return Response.json({ error: "No user found in database" }, { status: 404 })

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await prisma.connectedAccount.upsert({
      where:  { userId_provider: { userId, provider: "gmail_admin_pending" } },
      update: { accessToken: code, accountEmail: email, expiresAt, updatedAt: new Date() },
      create: { userId, provider: "gmail_admin_pending", accessToken: code, accountEmail: email, expiresAt },
    })

    const resendKey = process.env.RESEND_API_KEY
    let sent = false

    if (resendKey) {
      try {
        const resend = new Resend(resendKey)
        await resend.emails.send({
          from:    process.env.FROM_EMAIL ?? "hello@autopilot.ai",
          to:      email,
          subject: `${code} — AutoPilot Gmail verification`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <div style="background:#111827;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                <span style="font-size:40px;font-weight:800;letter-spacing:8px;color:#ffffff;font-family:monospace">${code}</span>
              </div>
              <p style="color:#6b7280;font-size:14px;text-align:center">Enter this code in AutoPilot Admin to connect your Gmail. Expires in 15 minutes.</p>
            </div>
          `,
        })
        sent = true
      } catch (e) {
        console.error("[admin/gmail/verify] Resend error:", e)
      }
    }

    return Response.json({
      success: true,
      sent,
      ...(!sent && process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
    })
  } catch (err) {
    console.error("[admin/gmail/verify]", err)
    return Response.json({ error: "Server error" }, { status: 500 })
  }
}
