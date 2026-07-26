// Pure helpers shared across the conversion + hook-learning features.
// No server deps — safe to import from client components.

// A stable, human-readable coupon code per idea. Deterministic from the idea
// id so the same post always shows the same code — the business speaks it in
// the video, customers say it at the register, and redemptions attribute the
// walk-in back to the exact piece of content that drove it.
export function couponFor(ideaId: string, offerHint?: string): string {
  let h = 0
  for (let i = 0; i < ideaId.length; i++) h = (h * 31 + ideaId.charCodeAt(i)) >>> 0
  // Low-order bits (mod 36^4) vary with the smallest input change — slicing the
  // most-significant base36 chars would collide on near-identical ids.
  const tail = (h % 1679616).toString(36).toUpperCase().padStart(4, "0")
  const word = (offerHint ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "REEL"
  return `${word}-${tail}`
}

// Classify a hook into its structural style so the tournament learns which
// SHAPE of opening wins for this account (not just which exact words).
export type HookStyle = "question" | "number-led" | "curiosity-gap" | "bold-claim" | "cold-open" | "how-to"

export function hookStyle(hook: string): HookStyle {
  const h = hook.trim().toLowerCase()
  if (/^\d|\b\d+\s*(ways|things|reasons|tips|secrets|days|hours|%|x)\b/.test(h)) return "number-led"
  if (h.endsWith("?")) return "question"
  if (/^(how|why|what|when|the secret|here's how|here's why)/.test(h)) return "how-to"
  if (/^(stop|never|nobody|no one|everyone|the truth|i was wrong|unpopular|hot take)/.test(h)) return "bold-claim"
  if (/(you won't believe|wait for it|watch what|this is why|the reason|until i|nobody tells you)/.test(h)) return "curiosity-gap"
  return "cold-open"
}

export const HOOK_STYLE_LABEL: Record<HookStyle, string> = {
  question: "Question", "number-led": "Number-led", "curiosity-gap": "Curiosity gap",
  "bold-claim": "Bold claim", "cold-open": "Cold open", "how-to": "How-to",
}
