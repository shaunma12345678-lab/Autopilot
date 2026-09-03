// POST /api/renovation-roi — which renovations actually pay on this property.
//
// The analysis is deterministic (lib/renovation-roi.ts): every figure is
// arithmetic over the stated inputs, so the same property always scores the
// same way and each number traces to a rule. No model is asked to estimate a
// price.
//
// The neighbourhood ceiling is the one input that decides everything, so it is
// required rather than defaulted. If comparable sales are supplied it is
// derived from them; otherwise the caller must state it. Guessing a ceiling
// would let any renovation be made to look profitable, which is precisely the
// error this tool exists to prevent.

import { NextRequest } from "next/server"
import { analyzeRenovationRoi, ceilingFromComps, type Condition } from "@/lib/renovation-roi"

const CONDITIONS: Condition[] = ["poor", "dated", "average", "good"]

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const num = (v: unknown): number =>
    typeof v === "number" && isFinite(v) ? v : Number.parseFloat(String(v ?? "")) || 0

  const asIsValue = num(body.asIsValue)
  const sqft = num(body.sqft)
  const description = String(body.description ?? "").trim()
  const conditionRaw = String(body.condition ?? "dated").toLowerCase()
  const condition: Condition = CONDITIONS.includes(conditionRaw as Condition)
    ? (conditionRaw as Condition)
    : "dated"

  if (!description) {
    return Response.json({ ok: false, error: "Describe the renovation you're considering." }, { status: 400 })
  }
  if (asIsValue <= 0) {
    return Response.json({ ok: false, error: "asIsValue (the property's current value) is required." }, { status: 400 })
  }
  if (sqft <= 0) {
    return Response.json({ ok: false, error: "sqft is required — several cost bases scale with floor area." }, { status: 400 })
  }

  // Ceiling: use what was given, else derive it from comps, else refuse.
  let neighborhoodCeiling = num(body.neighborhoodCeiling)
  let ceilingSource = "supplied by the caller"

  if (neighborhoodCeiling <= 0 && Array.isArray(body.comps)) {
    const comps = (body.comps as unknown[])
      .map(c => ({ price: num((c as Record<string, unknown>)?.price) }))
      .filter(c => c.price > 0)
    const derived = ceilingFromComps(comps, sqft, num(body.areaPsf) || undefined)
    if (derived) {
      neighborhoodCeiling = derived
      ceilingSource = `derived from ${comps.length} comparable sale${comps.length === 1 ? "" : "s"}`
    }
  }

  if (neighborhoodCeiling <= 0) {
    return Response.json({
      ok: false,
      error: "A neighbourhood ceiling is required — either pass neighborhoodCeiling, or pass comps to derive it. " +
             "Without it, any renovation can be made to look profitable on paper.",
    }, { status: 400 })
  }

  try {
    const report = analyzeRenovationRoi({
      asIsValue, sqft, neighborhoodCeiling, condition, description,
      costMultiplier: num(body.costMultiplier) || 1.0,
      monthlyCarry: num(body.monthlyCarry) || 0,
    })
    return Response.json({ ...report, ceilingSource })
  } catch (err) {
    console.error("[renovation-roi]", err)
    return Response.json({ ok: false, error: "Analysis failed." }, { status: 500 })
  }
}
