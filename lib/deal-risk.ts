// Deal Risk — the downside story next to the upside one. For one lead,
// every landmine a pro screens for before committing: environmental (flood),
// legal/title, financial structure, regulatory (landlord law / rent control /
// STR), market/timing, physical. Each flag carries severity, the source it
// came from, and whether it's VERIFIED record data or an ESTIMATE — no silent
// guesses dressed up as facts (DEEP_RISK_DATA_INTEGRITY_SPEC §3). Pure and
// synchronous; externally-fetched context (FEMA flood, metro trend, law
// tables) arrives via ctx from the /api/leads/risk route. Never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export type RiskSeverity = "high" | "medium" | "low"
export type RiskConfidence = "verified" | "estimate"

export interface RiskFlag {
  key: string
  category: "environmental" | "legal" | "financial" | "regulatory" | "market" | "physical"
  severity: RiskSeverity
  label: string
  detail: string           // what it means for THIS deal, in dollars/actions
  source: string           // where the underlying fact came from
  confidence: RiskConfidence
}

export interface RiskContext {
  floodZone?: string | null        // FEMA FLD_ZONE, e.g. "AE", "X"
  floodSubtype?: string | null
  priceYoY?: number | null         // metro 12-mo price trend %
  landlordGrade?: string | null    // A-F from our curated state table
  evictionDays?: number | null
  rentControl?: boolean | null
  strStatus?: string | null        // friendly | permit | restricted | banned
  strNote?: string | null
}

export interface RiskReport {
  flags: RiskFlag[]                // severity-sorted, high first
  riskScore: number                // 0-100, higher = riskier
  grade: "low" | "moderate" | "elevated" | "high"
  summary: string
  clean: string[]                  // checks that came back clean (worth showing)
}

const SEV_WEIGHT: Record<RiskSeverity, number> = { high: 22, medium: 10, low: 4 }
const SEV_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 }
const money = (n: number) => `$${Math.round(n).toLocaleString()}`

// FEMA Special Flood Hazard Area zones — mandatory flood insurance territory.
const SFHA_ZONES = new Set(["A", "AE", "AH", "AO", "AR", "A99", "V", "VE", "V1"])

export function riskReport(lead: ForeclosureLead, ctx: RiskContext = {}): RiskReport {
  const flags: RiskFlag[] = []
  const clean: string[] = []
  const value = lead.avmValue ?? lead.estimatedValue ?? null
  const signalText = [...(lead.distressSignals ?? []), lead.scoreReason ?? ""].join(" · ").toLowerCase()

  // ── Environmental ─────────────────────────────────────────────────────────
  if (ctx.floodZone != null) {
    const zone = ctx.floodZone.toUpperCase()
    if (SFHA_ZONES.has(zone)) {
      flags.push({
        key: "flood", category: "environmental", severity: "high",
        label: `FEMA flood zone ${zone} — special flood hazard area`,
        detail: "Lenders require flood insurance here (often $1,500-$4,000+/yr) — it hits both your holding cost and every future buyer's payment. Price it into MAO.",
        source: "FEMA National Flood Hazard Layer", confidence: "verified",
      })
    } else if (zone.startsWith("X") && (ctx.floodSubtype ?? "").toUpperCase().includes("0.2")) {
      flags.push({
        key: "flood", category: "environmental", severity: "low",
        label: "FEMA zone X (shaded) — 0.2% annual flood chance",
        detail: "Moderate flood area: insurance optional but cheap, and worth carrying. Not a deal-killer.",
        source: "FEMA National Flood Hazard Layer", confidence: "verified",
      })
    } else {
      clean.push(`Flood: zone ${zone} — minimal hazard (FEMA NFHL, verified)`)
    }
  }

  // ── Legal / title ─────────────────────────────────────────────────────────
  const jl = lead.juniorLiens ?? []
  const irsOrJudgment = jl.filter((j) => /irs|judgment|federal|state tax/i.test(j.label))
  if (irsOrJudgment.length) {
    flags.push({
      key: "juniorGov", category: "legal", severity: "high",
      label: `${irsOrJudgment.length} IRS/judgment lien${irsOrJudgment.length > 1 ? "s" : ""} behind the first`,
      detail: "Government and judgment liens survive sloppy closings and can have redemption rights. Title company must clear these — budget time and negotiate payoffs before you commit.",
      source: "Notice text sweep", confidence: "verified",
    })
  }
  if ((lead.lienCount ?? 0) >= 3) {
    flags.push({
      key: "lienStack", category: "legal", severity: "medium",
      label: `${lead.lienCount} liens on title`,
      detail: "Every lienholder is a negotiation and a signature. More encumbrances = slower, more fragile closing — pad your timeline and your EMD terms.",
      source: "Public records", confidence: "verified",
    })
  }
  if (/probate|deceased|estate|heir/i.test(signalText)) {
    flags.push({
      key: "probate", category: "legal", severity: "medium",
      label: "Probate / heirship in the chain",
      detail: "If multiple heirs exist, every one must sign. Confirm the personal representative and whether the estate is opened before writing the offer — this is the #1 cause of dead deals in probate.",
      source: "Distress signals", confidence: "estimate",
    })
  }
  if (/hoa/i.test(signalText) || jl.some((j) => /hoa/i.test(j.label))) {
    flags.push({
      key: "hoa", category: "legal", severity: "low",
      label: "HOA involvement detected",
      detail: "Pull the HOA estoppel early: past-due assessments, rental caps, and architectural rules can constrain both rehab and exit. In super-lien states an HOA foreclosure can even prime the first.",
      source: "Notice/lien text", confidence: "estimate",
    })
  }

  // ── Financial / deal structure ────────────────────────────────────────────
  if (value != null && value > 0 && (lead.totalLiens ?? 0) > value) {
    flags.push({
      key: "underwater", category: "financial", severity: "high",
      label: `Encumbrances ${money(lead.totalLiens ?? 0)} exceed est. value ${money(value)}`,
      detail: "No equity to buy — a discount purchase can't work. This is a short-sale or subject-to conversation, not a cash-offer one.",
      source: "Lien records vs valuation", confidence: lead.avmValue ? "verified" : "estimate",
    })
  }
  if ((lead.defaultAmount ?? 0) > 0 && (lead.estimatedEquity ?? 0) > 0 && (lead.defaultAmount ?? 0) > (lead.estimatedEquity ?? 0) * 0.5) {
    flags.push({
      key: "arrears", category: "financial", severity: "medium",
      label: `Arrears ${money(lead.defaultAmount ?? 0)} are ${Math.round(((lead.defaultAmount ?? 0) / Math.max(lead.estimatedEquity ?? 1, 1)) * 100)}% of the equity`,
      detail: "The default eats a big slice of what's left — the seller's walk-away number is smaller than they think. Set expectations early with a payoff-based offer breakdown.",
      source: "Recorded default amount", confidence: "verified",
    })
  }
  if (lead.taxDelinquent && (lead.foreclosureStage === "AUCTION" || lead.foreclosureStage === "NOTICE_OF_SALE")) {
    flags.push({
      key: "taxPriority", category: "financial", severity: "medium",
      label: "Tax delinquency + active sale track",
      detail: "Property tax liens prime the mortgage. Confirm the county isn't running its own tax sale in parallel — two clocks can be ticking.",
      source: "County tax status", confidence: "verified",
    })
  }

  // ── Regulatory (from our curated law tables) ──────────────────────────────
  if (ctx.rentControl) {
    flags.push({
      key: "rentControl", category: "regulatory", severity: "medium",
      label: "Rent control jurisdiction",
      detail: "Underwrite to the ALLOWED annual increase, not market rent growth. Buy-and-hold and BRRRR exits need the capped number in the model.",
      source: "State law table (curated)", confidence: "verified",
    })
  }
  if (ctx.landlordGrade === "D" || ctx.landlordGrade === "F") {
    flags.push({
      key: "landlordLaw", category: "regulatory", severity: "medium",
      label: `Tenant-heavy state (grade ${ctx.landlordGrade}${ctx.evictionDays ? `, ~${ctx.evictionDays}-day evictions` : ""})`,
      detail: "A non-paying tenant costs months, not weeks. If the exit is a rental, screen harder and hold bigger reserves; if occupied at purchase, price the possible eviction timeline in.",
      source: "State law table (curated)", confidence: "verified",
    })
  } else if (ctx.landlordGrade === "A" || ctx.landlordGrade === "B") {
    clean.push(`Landlord law: grade ${ctx.landlordGrade} — enforceable leases, quick remedies (curated table)`)
  }
  if (ctx.strStatus === "banned" || ctx.strStatus === "restricted") {
    flags.push({
      key: "str", category: "regulatory", severity: ctx.strStatus === "banned" ? "medium" : "low",
      label: `Short-term rentals ${ctx.strStatus} here`,
      detail: `${ctx.strNote ?? "City ordinance limits STR use"} — if any buyer's exit is Airbnb, that exit ${ctx.strStatus === "banned" ? "does not exist" : "needs the permit path verified"}.`,
      source: "City STR table (curated)", confidence: "verified",
    })
  }

  // ── Market / timing ───────────────────────────────────────────────────────
  if (ctx.priceYoY != null && ctx.priceYoY < -1) {
    flags.push({
      key: "declining", category: "market", severity: ctx.priceYoY < -5 ? "high" : "medium",
      label: `Metro prices ${ctx.priceYoY}% over 12 months`,
      detail: "A falling market eats flip margin while you hold. Underwrite ARV at today's comps minus the trend, not at listing prices — and prefer fast exits (wholesale) over slow ones (flip).",
      source: "Zillow Research metro series", confidence: "verified",
    })
  } else if (ctx.priceYoY != null && ctx.priceYoY >= 0) {
    clean.push(`Market: metro prices ${ctx.priceYoY >= 0 ? "+" : ""}${ctx.priceYoY}% over 12mo (Zillow Research, verified)`)
  }
  if ((lead.daysUntilAuction ?? 99) <= 14) {
    flags.push({
      key: "auctionClock", category: "market", severity: "high",
      label: `Auction in ${lead.daysUntilAuction} days`,
      detail: "Not enough runway for a normal close. This is either a pre-auction cash sprint (title rush + fast EMD) or a postponement play — decide which before spending a dollar.",
      source: "Trustee sale notice", confidence: "verified",
    })
  }

  // ── Physical ──────────────────────────────────────────────────────────────
  if ((lead.yearBuilt ?? 9999) <= 1960) {
    flags.push({
      key: "age", category: "physical", severity: "low",
      label: `Built ${lead.yearBuilt} — aging systems assumed`,
      detail: "At this age assume knob-and-tube/galvanized/original-roof until an inspection says otherwise, and pre-1978 means lead-paint rules on any rehab. This is an assumption, not a record — verify on the walkthrough.",
      source: "Year built (assessor)", confidence: "estimate",
    })
  }
  if (lead.occupancy === "vacant") {
    flags.push({
      key: "vacant", category: "physical", severity: "low",
      label: "Vacant property",
      detail: "Vacancy cuts both ways: easier access and a motivated seller, but higher odds of deferred maintenance, vandalism, and dead utilities. Walk it sooner, insure it as vacant.",
      source: "Occupancy inference", confidence: "estimate",
    })
  }

  flags.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])

  const raw = flags.reduce((s, f) => s + SEV_WEIGHT[f.severity], 0)
  const riskScore = Math.min(100, raw)
  const grade: RiskReport["grade"] = riskScore >= 55 ? "high" : riskScore >= 32 ? "elevated" : riskScore >= 12 ? "moderate" : "low"
  const highs = flags.filter((f) => f.severity === "high")
  const summary =
    flags.length === 0
      ? "No landmines detected on the checks we can run — still verify title and walk the property before committing."
      : highs.length
        ? `${highs.length} deal-threatening issue${highs.length > 1 ? "s" : ""}: ${highs.map((f) => f.label).join("; ")}. Resolve these before spending money on this deal.`
        : `${flags.length} manageable risk${flags.length > 1 ? "s" : ""} — none kill the deal, all belong in your offer price and timeline.`

  return { flags, riskScore, grade, summary, clean }
}
