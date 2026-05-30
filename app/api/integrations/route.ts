import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { isMissingTableError } from "@/lib/db-guard"

// GET — fetch all connected accounts for the current user
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const accounts = await prisma.connectedAccount.findMany({
      where: { userId: user.id },
      select: {
        provider:     true,
        accountName:  true,
        accountEmail: true,
        scopes:       true,
        createdAt:    true,
        updatedAt:    true,
      },
    })

    return Response.json({ accounts })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ accounts: [] })
    console.error("[integrations GET]", err)
    return Response.json({ error: "Failed to fetch integrations" }, { status: 500 })
  }
}

// POST — save credential-based integration (non-OAuth: Twilio, Buffer, Meta token, etc.)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { provider, accessToken, accountName, accountEmail, metadata } = body

    if (!provider || !accessToken) {
      return Response.json({ error: "provider and accessToken are required" }, { status: 400 })
    }

    const account = await prisma.connectedAccount.upsert({
      where:  { userId_provider: { userId: user.id, provider } },
      update: {
        accessToken,
        accountName:  accountName ?? undefined,
        accountEmail: accountEmail ?? undefined,
        metadata:     metadata ?? {},
        updatedAt:    new Date(),
      },
      create: {
        userId:       user.id,
        provider,
        accessToken,
        accountName:  accountName ?? undefined,
        accountEmail: accountEmail ?? undefined,
        metadata:     metadata ?? {},
      },
    })

    return Response.json({ account: { provider: account.provider, accountName: account.accountName } })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ error: "Database migration pending. Run /api/admin/migrate first." }, { status: 503 })
    console.error("[integrations POST]", err)
    return Response.json({ error: "Failed to save integration" }, { status: 500 })
  }
}

// DELETE — disconnect an integration
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const provider = searchParams.get("provider")
    if (!provider) return Response.json({ error: "provider required" }, { status: 400 })

    await prisma.connectedAccount.deleteMany({
      where: { userId: user.id, provider },
    })

    return Response.json({ success: true })
  } catch (err) {
    if (isMissingTableError(err)) return Response.json({ success: true })
    console.error("[integrations DELETE]", err)
    return Response.json({ error: "Failed to disconnect" }, { status: 500 })
  }
}
