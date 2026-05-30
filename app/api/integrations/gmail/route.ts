import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import nodemailer from "nodemailer"
import { isMissingTableError } from "@/lib/db-guard"

// POST — verify Gmail app password and save the connection
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { email, appPassword } = await request.json()

    if (!email || !appPassword) {
      return Response.json({ error: "email and appPassword are required" }, { status: 400 })
    }

    if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
      return Response.json({ error: "Only Gmail addresses are supported (@gmail.com)" }, { status: 400 })
    }

    // Verify the credentials actually work before saving
    const transporter = nodemailer.createTransport({
      host:   "smtp.gmail.com",
      port:   465,
      secure: true,
      auth: { user: email, pass: appPassword.replace(/\s/g, "") },
    })

    try {
      await transporter.verify()
    } catch {
      return Response.json(
        { error: "Gmail credentials are invalid. Double-check your email and app password." },
        { status: 422 }
      )
    }

    // Store the connection — appPassword is the accessToken
    await prisma.connectedAccount.upsert({
      where:  { userId_provider: { userId: user.id, provider: "gmail" } },
      update: {
        accessToken:  appPassword.replace(/\s/g, ""),
        accountEmail: email,
        accountName:  email,
        scopes:       ["gmail.send"],
        updatedAt:    new Date(),
      },
      create: {
        userId:       user.id,
        provider:     "gmail",
        accessToken:  appPassword.replace(/\s/g, ""),
        accountEmail: email,
        accountName:  email,
        scopes:       ["gmail.send"],
      },
    })

    return Response.json({ success: true, email })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ error: "Database migration pending. Go to Admin → run migration first." }, { status: 503 })
    console.error("[gmail-connect]", err)
    return Response.json({ error: "Server error. Please try again." }, { status: 500 })
  }
}

// DELETE — disconnect Gmail
export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    await prisma.connectedAccount.deleteMany({
      where: { userId: user.id, provider: "gmail" },
    })

    return Response.json({ success: true })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ success: true })
    console.error("[gmail-disconnect]", err)
    return Response.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
