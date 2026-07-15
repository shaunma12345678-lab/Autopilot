import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

async function getAdminUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
  return user?.id ?? null
}

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (!ADMIN_PASSWORD || pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { email, code } = await request.json()
    if (!email || !code) return Response.json({ error: "email and code required" }, { status: 400 })

    const userId = await getAdminUserId()
    if (!userId) return Response.json({ error: "No user found" }, { status: 404 })

    const pending = await prisma.connectedAccount.findUnique({
      where: { userId_provider: { userId, provider: "gmail_admin_pending" } },
    })

    if (!pending) return Response.json({ error: "No verification in progress — send a code first." }, { status: 400 })
    if (pending.accountEmail !== email) return Response.json({ error: "Email doesn't match. Start over." }, { status: 400 })
    if (pending.expiresAt && pending.expiresAt < new Date()) {
      await prisma.connectedAccount.delete({ where: { userId_provider: { userId, provider: "gmail_admin_pending" } } })
      return Response.json({ error: "Code expired — send a new one." }, { status: 400 })
    }
    if (pending.accessToken !== code.trim()) {
      return Response.json({ error: "Incorrect code. Check your email and try again." }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.connectedAccount.upsert({
        where:  { userId_provider: { userId, provider: "gmail" } },
        update: { accountEmail: email, accountName: email, scopes: ["gmail.verified"], updatedAt: new Date() },
        create: { userId, provider: "gmail", accountEmail: email, accountName: email, scopes: ["gmail.verified"] },
      }),
      prisma.connectedAccount.delete({
        where: { userId_provider: { userId, provider: "gmail_admin_pending" } },
      }),
    ])

    return Response.json({ success: true, email })
  } catch (err) {
    console.error("[admin/gmail/confirm]", err)
    return Response.json({ error: "Verification failed" }, { status: 500 })
  }
}
