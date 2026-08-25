// Auto-repair — fixes problems that were OBSERVED by rendering the page,
// never problems that were guessed at.
//
// Pairs with lib/agents/site-verifier.ts: that module renders the generated
// site in a real browser and reports measured failures (JS errors, dead CDN
// globals, mobile overflow, blank sections). This route hands those findings
// back to the model and asks for a corrected document.
//
// THE GUARD THAT MATTERS. A repair pass returning a truncated or gutted
// document would silently replace a mostly-working site with a broken one —
// turning a cosmetic bug into a catastrophic one. The model's output is
// therefore validated for structural completeness and size before it is
// accepted, and the original is kept whenever the "fix" looks worse than
// what it replaced. Failing to repair is a fine outcome; shipping a
// destroyed page is not.

import { NextRequest } from "next/server"
import { runAgent } from "@/lib/claude"
import { evaluateRender, parseObservations, buildRepairBrief } from "@/lib/agents/site-verifier"

export const maxDuration = 300

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

// A corrected document should be within a reasonable band of the original.
// Well under this means the model dropped whole sections rather than fixing
// them; the original is preferable to a gutted page.
const MIN_SIZE_RATIO = 0.72

function isStructurallyComplete(html: string): boolean {
  const lower = html.toLowerCase()
  return lower.includes("<html") && lower.includes("</html>") && lower.includes("</body>")
}

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

  const html = String(body.html ?? "").trim()
  if (!html) return Response.json({ error: "html is required" }, { status: 400 })

  const observations = parseObservations(body.observations)
  if (!observations) {
    return Response.json({ error: "observations from a render pass are required" }, { status: 400 })
  }

  const report = evaluateRender(observations)
  const brief = buildRepairBrief(report)

  // Nothing actionable — minor issues alone don't justify regenerating a
  // whole document and risking a working page.
  if (!brief) {
    return Response.json({
      repaired: false,
      reason: "No fatal or major issues were observed, so the page was left untouched.",
      html,
      report,
    })
  }

  try {
    const raw = await runAgent(
      `You repair broken HTML pages. You are given a complete single-file HTML document and a list of problems that were observed by actually rendering it in a browser.

Return ONLY the complete corrected HTML document — starting at <!DOCTYPE html> and ending at </html>. No markdown fences, no commentary, no explanation.

You must return the ENTIRE document, not a fragment or a diff. Every section, style block and script that was in the original must still be present unless a listed problem specifically required removing it.`,
      `${brief}

CURRENT DOCUMENT:
${html}`,
      { model: "sonnet", maxTokens: 32000 }
    ) as string

    const cleaned = String(raw)
      .replace(/^```(?:html)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim()

    // ── Guards: never accept a "repair" that looks worse than the original ──
    if (!isStructurallyComplete(cleaned)) {
      return Response.json({
        repaired: false,
        reason: "The repair pass returned an incomplete document (likely truncated), so the original was kept.",
        html,
        report,
      })
    }

    if (cleaned.length < html.length * MIN_SIZE_RATIO) {
      return Response.json({
        repaired: false,
        reason: `The repair pass returned a document ${Math.round((1 - cleaned.length / html.length) * 100)}% smaller than the original, which means sections were dropped rather than fixed. The original was kept.`,
        html,
        report,
      })
    }

    return Response.json({
      repaired: true,
      html: cleaned,
      fixedIssues: report.issues.filter(i => i.severity !== "minor").map(i => i.detail),
      report,
    })
  } catch (err) {
    console.error("[admin/repair-site]", err)
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Repair failed: ${msg.slice(0, 200)}` }, { status: 500 })
  }
}
