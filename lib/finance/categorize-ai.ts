// The model-backed categorization pass — server-only (imports the AI layer).
// Runs the pure rule/builtin/keyword pass first, then sends ONLY the leftover
// unknowns to the model, batched and confidence-scored, clearly labeled "ai".
// Kept out of categorize.ts so client imports of CATEGORIES stay SDK-free.

import { runAgent } from "@/lib/claude"
import { CATEGORIES, CATEGORY_KEYS, categorizeRules, type CatInput, type CatResult } from "@/lib/finance/categorize"

export async function categorizeBatch(
  txns: CatInput[],
  rules: Map<string, string>,
  opts?: { ai?: boolean },
): Promise<CatResult[]> {
  const out = categorizeRules(txns, rules)
  if (opts?.ai === false) return out

  // AI pass for the unknowns only — batched, one call per 40, clearly labeled.
  const unknownIdx = out.map((r, i) => (r.source === "none" || r.confidence < 0.5 ? i : -1)).filter((i) => i >= 0).slice(0, 120)
  for (let b = 0; b < unknownIdx.length; b += 40) {
    const batch = unknownIdx.slice(b, b + 40)
    const list = batch.map((i, j) => `${j}. "${txns[i].merchant}" (${txns[i].amount >= 0 ? "+" : ""}$${Math.abs(txns[i].amount).toFixed(0)})`).join("\n")
    try {
      const res = await runAgent(
        `You categorize business bank transactions. Categories (use the key exactly): ${CATEGORIES.map((c) => c.key).join(", ")}. ` +
        'Return raw JSON: { "cats": [{ "index": int, "category": string, "confidence": 0-1 }] }. Positive amounts are money IN. When genuinely unsure use "other" with low confidence — never guess confidently.',
        list, { jsonMode: true, maxTokens: 1400 },
      )
      const obj = typeof res === "string" ? JSON.parse(res.match(/\{[\s\S]*\}/)?.[0] ?? "{}") : res as Record<string, unknown>
      const cats = Array.isArray((obj as Record<string, unknown>).cats) ? ((obj as Record<string, unknown>).cats as unknown[]) : []
      for (const c of cats) {
        if (!c || typeof c !== "object") continue
        const row = c as Record<string, unknown>
        const j = Number(row.index)
        const cat = String(row.category ?? "")
        if (!Number.isInteger(j) || j < 0 || j >= batch.length || !CATEGORY_KEYS.has(cat)) continue
        const i = batch[j]
        const conf = Math.max(0, Math.min(1, Number(row.confidence) || 0.5))
        if (conf > out[i].confidence) out[i] = { category: cat, confidence: conf, source: "ai" }
      }
    } catch { /* unknowns stay "other" — honest over invented */ }
  }
  return out
}
