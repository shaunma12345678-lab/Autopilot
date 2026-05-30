import { NextRequest } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

const ZERO_STATS = {
  stats: { totalUsers: 0, totalBusinesses: 0, totalContent: 0, totalReviews: 0, totalLeads: 0, approvedContent: 0, pendingContent: 0, avgRating: "0" },
  planDistribution: [],
  recentUsers: [],
  recentBusinesses: [],
}

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  if (password !== ADMIN_PASSWORD) {
    return Response.json({ error: "Invalid password" }, { status: 401 })
  }

  try {
    const sb = getAdminClient()

    const [
      { count: totalUsers },
      { count: totalBusinesses },
      { count: totalContent },
      { count: totalReviews },
      { count: totalLeads },
      { data: recentUsersRaw },
      { data: recentBusinessesRaw },
      { data: contentStatus },
      { data: reviewRatings },
      { data: planDist },
    ] = await Promise.all([
      sb.from("User").select("*", { count: "exact", head: true }),
      sb.from("Business").select("*", { count: "exact", head: true }),
      sb.from("Content").select("*", { count: "exact", head: true }),
      sb.from("Review").select("*", { count: "exact", head: true }),
      sb.from("Lead").select("*", { count: "exact", head: true }),
      sb.from("User").select("id,email,name,plan,createdAt").order("createdAt", { ascending: false }).limit(20),
      sb.from("Business").select("id,name,type,createdAt,userId,user:User(email)").order("createdAt", { ascending: false }).limit(20),
      sb.from("Content").select("status"),
      sb.from("Review").select("rating"),
      sb.from("User").select("plan"),
    ])

    const approvedContent = (contentStatus ?? []).filter((c: { status: string }) => c.status === "APPROVED").length
    const pendingContent  = (contentStatus ?? []).filter((c: { status: string }) => c.status === "PENDING").length
    const ratings = (reviewRatings ?? []).map((r: { rating: number }) => r.rating)
    const avgRating = ratings.length ? (ratings.reduce((s: number, r: number) => s + r, 0) / ratings.length).toFixed(1) : "0"

    // Build plan distribution
    const planMap: Record<string, number> = {}
    ;(planDist ?? []).forEach((u: { plan: string }) => { planMap[u.plan] = (planMap[u.plan] ?? 0) + 1 })
    const planDistribution = Object.entries(planMap).map(([plan, _count]) => ({ plan, _count }))

    // Attach content/review/lead counts to businesses
    const businessIds = (recentBusinessesRaw ?? []).map((b: { id: string }) => b.id)
    const [{ data: bContent }, { data: bReviews }, { data: bLeads }] = await Promise.all([
      businessIds.length ? sb.from("Content").select("businessId").in("businessId", businessIds) : Promise.resolve({ data: [] }),
      businessIds.length ? sb.from("Review").select("businessId").in("businessId", businessIds) : Promise.resolve({ data: [] }),
      businessIds.length ? sb.from("Lead").select("businessId").in("businessId", businessIds) : Promise.resolve({ data: [] }),
    ])

    const recentBusinesses = (recentBusinessesRaw ?? []).map((b: Record<string, unknown>) => ({
      ...b,
      _count: {
        content: (bContent ?? []).filter((c: { businessId: string }) => c.businessId === b.id).length,
        reviews: (bReviews ?? []).filter((r: { businessId: string }) => r.businessId === b.id).length,
        leads:   (bLeads   ?? []).filter((l: { businessId: string }) => l.businessId === b.id).length,
      },
    }))

    return Response.json({
      stats: {
        totalUsers:      totalUsers   ?? 0,
        totalBusinesses: totalBusinesses ?? 0,
        totalContent:    totalContent ?? 0,
        totalReviews:    totalReviews ?? 0,
        totalLeads:      totalLeads   ?? 0,
        approvedContent, pendingContent, avgRating,
      },
      planDistribution,
      recentUsers:    recentUsersRaw ?? [],
      recentBusinesses,
    })
  } catch (err) {
    console.error("[admin] DB error:", err)
    return Response.json(ZERO_STATS)
  }
}
