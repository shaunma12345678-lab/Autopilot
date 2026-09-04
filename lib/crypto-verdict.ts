// Crypto's counterpart to lib/investment-verdict.ts — same synthesis job,
// reframed for what crypto actually has instead of what stocks have.
//
// WHAT STANDS IN FOR WHAT. Crypto has no management team disclosing pay
// structure and related-party deals in a proxy — but it has an on-chain
// equivalent of the same question "can insiders act against holders":
// contract ownership (renounced or not), mint authority (can supply be
// inflated at will), LP lock (can liquidity be pulled), and holder
// concentration (can one wallet dump the market). Those are this file's
// "governance and conflicts" section, sourced from lib/token-security.ts's
// GoPlus read the same way lib/investment-verdict.ts sources governance from
// the DEF 14A proxy.
//
// THE HONESTY GAP THIS MUST NOT PAPER OVER. lib/crypto-opportunity-screen.ts
// is explicit that no backtest has ever validated a return edge for crypto
// the way lib/backtest.ts validated the stock-side valuation axis. The
// prompt says this outright so leadQuality doesn't get stated with more
// confidence than the evidence actually supports.
//
// NO PRICE PREDICTION — same hard line as everywhere else in this system.
import { runAgent } from "./claude"

export type TeamQuality = "strong" | "adequate" | "concerning" | "unclear"
export type LeadQuality = "strong_lead" | "worth_watching" | "not_a_lead" | "avoid"

export interface CryptoVerdict {
  verdict: string
  teamQuality: TeamQuality
  leadQuality: LeadQuality
  keyStrengths: string[]
  keyConcerns: string[]
  structuralRisks: string[]
  confidenceCaveat: string | null
}

const VERDICT_SYSTEM = `You synthesize a crypto asset research file into one governing verdict. Every fact you use is already computed and verified elsewhere in the system and handed to you. Your only job is synthesis.

HARD RULES:
- Argue ONLY from the facts you are given. Never invent a strength, concern, or risk not evidenced in the input.
- No backtest has ever validated that this system's crypto criteria predict forward returns, unlike the stock side where valuation-vs-own-history has measured evidence. Do not state leadQuality with more confidence than that — "worth_watching" is the right default for anything that isn't clearly disqualified, and "strong_lead" should be reserved for assets that clear every conviction gate AND are cheap versus their own trading range, described as a reasoned combination, never as a proven edge.
- Contract ownership not renounced, arbitrary mint authority, unlocked liquidity, and extreme holder/creator concentration are this asset's equivalent of insider conflicts of interest. If ANY of these facts are present in the input, you MUST include them in structuralRisks. Never omit one because other things look good.
- A honeypot or a security score below 50 is disqualifying for "strong_lead" or "worth_watching" regardless of everything else — use "avoid".
- Never output a price target, a price direction, a probability of price movement, or personalized advice to buy or sell.
- If data is thin (no on-chain read, no revenue-yield peer sample, low conviction gate coverage), say so in confidenceCaveat rather than writing a confident-sounding verdict on incomplete evidence.

Return ONLY valid JSON, no markdown fences.`

export interface CryptoVerdictInput {
  symbol: string
  name: string
  qualityScore: number | null
  riskScore: number | null
  strengthTier: string | null
  actionSignal: string | null
  convictionTier: string | null
  convictionSummary: string | null
  pricePercentile1y: number | null
  securityScore: number | null
  isHoneypot: boolean | null
  isMintable: boolean | null
  ownershipRenounced: boolean | null
  lpLocked: boolean | null
  topHolderPct: number | null
  top10HolderPct: number | null
  creatorPct: number | null
  securityFlags: string[]
  devActivityScore: number | null
  protocolRevenue30dUsd: number | null
  revenueYieldPercentile: number | null
  revenueYieldPeerCount: number | null
  onChainPercentile: number | null
  fdvToMcapRatio: number | null
  nextUnlockDate: string | null
  nextUnlockPctSupply: number | null
  liquidityGrade: string | null
  venueCount: number | null
  qualityReasons: string[]
  riskFlags: string[]
}

function n(v: number | null | undefined, unit = ""): string {
  return v === null || v === undefined ? "not available" : `${v}${unit}`
}

function list(items: string[], none = "none"): string {
  return items.length ? items.map(x => `- ${x}`).join("\n") : `- ${none}`
}

export async function buildCryptoVerdict(input: CryptoVerdictInput): Promise<CryptoVerdict | null> {
  const dossier = `ASSET: ${input.name} (${input.symbol})

SCORES:
- Quality: ${n(input.qualityScore, "/100")} (${input.strengthTier ?? "n/a"})
- Risk: ${n(input.riskScore, "/100")}
- Action signal (two-axis matrix, not a recommendation): ${input.actionSignal ?? "none"}
- Conviction tier (independent gates, must ALL pass — not an average): ${input.convictionTier ?? "n/a"} — ${input.convictionSummary ?? "no detail"}
- Price percentile vs. own 1-year range: ${input.pricePercentile1y === null ? "n/a" : `${input.pricePercentile1y}th — lower means closer to the bottom of its own range`}

CONTRACT SECURITY AND STRUCTURE (this asset's equivalent of governance/conflicts):
- Security score: ${n(input.securityScore, "/100")}
- Honeypot: ${input.isHoneypot === null ? "unknown" : input.isHoneypot ? "YES — total-loss risk" : "no"}
- Arbitrarily mintable supply: ${input.isMintable === null ? "unknown" : input.isMintable ? "YES" : "no"}
- Ownership renounced: ${input.ownershipRenounced === null ? "unknown" : input.ownershipRenounced ? "yes" : "NO — owner retains control"}
- Liquidity locked: ${input.lpLocked === null ? "unknown" : input.lpLocked ? "yes" : "NO — liquidity could be pulled"}
- Top holder: ${n(input.topHolderPct, "%")} · Top 10 holders: ${n(input.top10HolderPct, "%")} · Creator: ${n(input.creatorPct, "%")}
- Security flags:
${list(input.securityFlags)}

FUNDAMENTALS:
- Developer activity: ${n(input.devActivityScore, "/100")}
- Protocol revenue (30d): ${input.protocolRevenue30dUsd === null ? "not available" : `$${input.protocolRevenue30dUsd.toLocaleString()}`}
- Revenue yield percentile: ${input.revenueYieldPercentile === null ? "not enough peer data yet" : `${input.revenueYieldPercentile.toFixed(0)}th percentile against ${input.revenueYieldPeerCount ?? "n/a"} other tracked assets`}
- On-chain activity percentile (real usage vs. same-purpose chains): ${input.onChainPercentile === null ? "not applicable to this asset" : `${input.onChainPercentile.toFixed(0)}th percentile`}

DILUTION AND LIQUIDITY:
- FDV / market cap: ${n(input.fdvToMcapRatio, "x")} (above 1 means more supply yet to unlock)
- Next unlock: ${input.nextUnlockDate ? `${input.nextUnlockDate}, ${n(input.nextUnlockPctSupply, "% of supply")}` : "none scheduled / not available"}
- Liquidity grade: ${input.liquidityGrade ?? "unknown"} across ${input.venueCount ?? 0} regulated venues

OTHER REASONS ALREADY COMPUTED:
${list(input.qualityReasons)}

RISK FLAGS ALREADY RAISED:
${list(input.riskFlags)}`

  try {
    const raw = await runAgent(
      VERDICT_SYSTEM,
      `${dossier}

Return JSON:
{
  "verdict": "3-5 sentences: is this a soundly-structured asset, and is it a good lead right now — synthesize, don't just list",
  "teamQuality": "strong | adequate | concerning | unclear",
  "leadQuality": "strong_lead | worth_watching | not_a_lead | avoid",
  "keyStrengths": ["max 4, each citing a specific fact above"],
  "keyConcerns": ["max 4, each citing a specific fact above"],
  "structuralRisks": ["every disclosed structural/security concern above — empty array ONLY if none were found"],
  "confidenceCaveat": "one sentence if evidence is thin, otherwise null"
}`,
      { maxTokens: 1300, jsonMode: true }
    )

    const p = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const strs = (v: unknown, max: number): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []

    const teamQuality: TeamQuality =
      ["strong", "adequate", "concerning"].includes(p?.teamQuality) ? p.teamQuality : "unclear"
    const leadQuality: LeadQuality =
      ["strong_lead", "worth_watching", "not_a_lead", "avoid"].includes(p?.leadQuality) ? p.leadQuality : "worth_watching"

    return {
      verdict: typeof p?.verdict === "string" ? p.verdict : "",
      teamQuality,
      leadQuality,
      keyStrengths: strs(p?.keyStrengths, 4),
      keyConcerns: strs(p?.keyConcerns, 4),
      structuralRisks: strs(p?.structuralRisks, 6),
      confidenceCaveat: typeof p?.confidenceCaveat === "string" && p.confidenceCaveat.trim() ? p.confidenceCaveat : null,
    }
  } catch {
    return null
  }
}
