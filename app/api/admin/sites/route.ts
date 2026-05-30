import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function GET(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const sites = await prisma.site.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        business: {
          select: { name: true, type: true, user: { select: { email: true } } },
        },
      },
    })
    return Response.json({ sites })
  } catch {
    return Response.json({ error: "Failed to fetch sites" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { siteId, published } = await request.json()
    const site = await prisma.site.update({ where: { id: siteId }, data: { published } })
    return Response.json({ site })
  } catch {
    return Response.json({ error: "Failed to update site" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!auth(request)) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("id")
    if (!siteId) return Response.json({ error: "id required" }, { status: 400 })
    await prisma.site.delete({ where: { id: siteId } })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: "Failed to delete site" }, { status: 500 })
  }
}
