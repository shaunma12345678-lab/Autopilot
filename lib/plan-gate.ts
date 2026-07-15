// Plan enforcement (server). Premium routes call requirePlanFeature AFTER
// authentication: operator requests (valid x-admin-password) always pass;
// logged-in users pass when their plan unlocks the feature, otherwise get a
// clean 402 pointing at /pricing. Fails OPEN on lookup errors — a database
// blip must never lock paying users out of the product.

import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { hasFeature, type GatedFeature } from "@/lib/plans"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

const planCache = new Map<string, { at: number; plan: string }>()
const PLAN_TTL = 5 * 60 * 1000

export type PlanGate = { ok: true } | { ok: false; resp: Response }

export async function requirePlanFeature(
  request: NextRequest,
  user: { id: string } | null,
  feature: GatedFeature,
): Promise<PlanGate> {
  // Operator bypass — the admin console is never plan-gated.
  if (ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD) return { ok: true }
  if (!user) return { ok: true }   // auth already handled upstream; nothing to gate

  try {
    const cached = planCache.get(user.id)
    let plan = cached && Date.now() - cached.at < PLAN_TTL ? cached.plan : null
    if (!plan) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
      plan = (dbUser?.plan as string | undefined) ?? "FREE"
      planCache.set(user.id, { at: Date.now(), plan })
      if (planCache.size > 2000) planCache.delete(planCache.keys().next().value!)
    }
    if (hasFeature(plan, feature)) return { ok: true }
    return {
      ok: false,
      resp: Response.json(
        { error: `This feature needs a higher plan (yours: ${plan}).`, feature, upgrade: "/pricing" },
        { status: 402 },
      ),
    }
  } catch {
    return { ok: true }   // fail open — never block on infrastructure errors
  }
}
