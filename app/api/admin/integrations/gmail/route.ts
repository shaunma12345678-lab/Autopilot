import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import nodemailer from "nodemailer"
import { isMissingTableError } from "@/lib/db-guard"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

async function getAdminUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (!ADMIN_PASSWORD || pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const userId = await getAdminUserId()
    if (!userId) return Response.json({ error: "No user found in database" }, { status: 404 })

    const { email, appPassword } = await request.json()
    if (!email || !appPassword) return Response.json({ error: "email and appPassword required" }, { status: 400 })

    if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
      return Response.json({ error: "Only @gmail.com addresses supported" }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: email, pass: appPassword.replace(/\s/g, "") },
    })

    try {
      await transporter.verify()
    } catch {
      return Response.json({ error: "Gmail credentials invalid — check your email and app password." }, { status: 422 })
    }

    await prisma.connectedAccount.upsert({
      where:  { userId_provider: { userId, provider: "gmail" } },
      update: {
        accessToken:  appPassword.replace(/\s/g, ""),
        accountEmail: email,
        accountName:  email,
        scopes:       ["gmail.send"],
        updatedAt:    new Date(),
      },
      create: {
        userId,
        provider:     "gmail",
        accessToken:  appPassword.replace(/\s/g, ""),
        accountEmail: email,
        accountName:  email,
        scopes:       ["gmail.send"],
      },
    })

    return Response.json({ success: true, email })
  } catch (err) {
    console.error("[admin/integrations/gmail]", err)
    return Response.json({ error: "Server error" }, { status: 500 })
  }
}
