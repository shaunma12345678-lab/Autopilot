// Attaches a render-verification result to a recorded build.
//
// Verification itself happens in the browser (lib/agents/site-verifier.ts
// explains why), so this route exists only to persist what the render
// observed — turning one-off checks into a build track record: how often
// generated sites actually render clean, and whether auto-repair fixed the
// ones that didn't.
import { NextRequest } from "next/server"
import { evaluateRender, parseObservations } from "@/lib/agents/site-verifier"
import { attachVerification } from "@/lib/agents/site-build-log"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (!ADMIN_PASSWORD || pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const buildId = String(body.buildId ?? "").trim()
  if (!buildId) return Response.json({ error: "buildId is required" }, { status: 400 })

  const observations = parseObservations(body.observations)
  if (!observations) return Response.json({ error: "observations are required" }, { status: 400 })

  const report = evaluateRender(observations)
  await attachVerification(buildId, report, {
    attempted: body.repairAttempted === true,
    succeeded: body.repairSucceeded === true,
  })

  return Response.json({ ok: true, score: report.score, passed: report.passed })
}
