import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isMissingTableError } from "@/lib/db-guard"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { email, code } = await request.json()
    if (!email || !code) {
      return Response.json({ error: "email and code are required" }, { status: 400 })
    }

    // Look up the pending verification
    const pending = await prisma.connectedAccount.findUnique({
      where: { userId_provider: { userId: user.id, provider: "gmail_pending" } },
    })

    if (!pending) {
      return Response.json({ error: "No verification in progress. Send the code again." }, { status: 400 })
    }

    if (pending.accountEmail !== email) {
      return Response.json({ error: "Email doesn't match. Start over." }, { status: 400 })
    }

    if (pending.expiresAt && pending.expiresAt < new Date()) {
      await prisma.connectedAccount.delete({
        where: { userId_provider: { userId: user.id, provider: "gmail_pending" } },
      })
      return Response.json({ error: "Code expired. Send a new one." }, { status: 400 })
    }

    if (pending.accessToken !== code.trim()) {
      return Response.json({ error: "Incorrect code. Check your email and try again." }, { status: 400 })
    }

    // Code is valid — save the verified Gmail connection and remove pending record
    await prisma.$transaction([
      prisma.connectedAccount.upsert({
        where:  { userId_provider: { userId: user.id, provider: "gmail" } },
        update: {
          accountEmail: email,
          accountName:  email,
          scopes:       ["gmail.verified"],
          updatedAt:    new Date(),
        },
        create: {
          userId:       user.id,
          provider:     "gmail",
          accountEmail: email,
          accountName:  email,
          scopes:       ["gmail.verified"],
        },
      }),
      prisma.connectedAccount.delete({
        where: { userId_provider: { userId: user.id, provider: "gmail_pending" } },
      }),
    ])

    return Response.json({ success: true, email })
  } catch (err) {
    if (isMissingTableError(err)) {
      return Response.json({ error: "Database migration needed." }, { status: 503 })
    }
    console.error("[gmail-confirm]", err)
    return Response.json({ error: "Verification failed. Try again." }, { status: 500 })
  }
}
