import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const business = await prisma.business.findFirst({
      orderBy: { createdAt: "asc" },
    })

    return Response.json({ business: business ?? null })
  } catch (err) {
    console.error("[businesses/current]", err)
    return Response.json({ error: "Failed to fetch business" }, { status: 500 })
  }
}
