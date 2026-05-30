import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { isMissingTableError } from "@/lib/db-guard"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

// Find the platform owner (first user created) to attach connections to
async function getAdminUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
  return user?.id ?? null
}

// GET — list all connected accounts for the admin user
export async function GET(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const userId = await getAdminUserId()
    if (!userId) return Response.json({ accounts: [] })

    const accounts = await prisma.connectedAccount.findMany({
      where: { userId },
      select: {
        provider:     true,
        accountName:  true,
        accountEmail: true,
        scopes:       true,
        createdAt:    true,
        updatedAt:    true,
      },
      orderBy: { createdAt: "asc" },
    })

    return Response.json({ accounts })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ accounts: [], migrationNeeded: true })
    console.error("[admin/integrations GET]", err)
    return Response.json({ error: "Failed to load integrations" }, { status: 500 })
  }
}

// POST — save or update a credential-based integration
export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const userId = await getAdminUserId()
    if (!userId) return Response.json({ error: "No user found in database" }, { status: 404 })

    const { provider, accessToken, accountName, accountEmail, metadata } = await request.json()
    if (!provider || !accessToken) {
      return Response.json({ error: "provider and accessToken are required" }, { status: 400 })
    }

    const account = await prisma.connectedAccount.upsert({
      where:  { userId_provider: { userId, provider } },
      update: {
        accessToken,
        accountName:  accountName ?? undefined,
        accountEmail: accountEmail ?? undefined,
        metadata:     metadata ?? {},
        updatedAt:    new Date(),
      },
      create: {
        userId,
        provider,
        accessToken,
        accountName:  accountName ?? undefined,
        accountEmail: accountEmail ?? undefined,
        metadata:     metadata ?? {},
      },
    })

    return Response.json({ success: true, provider: account.provider })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ error: "Database migration needed. Go to Admin → Integrations and run the migration." }, { status: 503 })
    console.error("[admin/integrations POST]", err)
    return Response.json({ error: "Failed to save integration" }, { status: 500 })
  }
}

// DELETE — disconnect an integration
export async function DELETE(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const userId = await getAdminUserId()
    if (!userId) return Response.json({ error: "No user found" }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get("provider")
    if (!provider) return Response.json({ error: "provider required" }, { status: 400 })

    await prisma.connectedAccount.deleteMany({ where: { userId, provider } })
    return Response.json({ success: true })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ success: true })
    console.error("[admin/integrations DELETE]", err)
    return Response.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
