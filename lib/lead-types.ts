// "Find ANY lead" — classify every lead into the full motivated-seller
// spectrum, not just foreclosure. The deep search already pulls these signals
// (probate, tax delinquency, code violations, divorce, eviction, vacancy, liens,
// bankruptcy, high equity, motivated listings); this turns them into named,
// filterable categories so a wholesaler can hunt any kind of deal. A lead can
// belong to several categories. Pure + null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { predictPreForeclosure } from "@/lib/predictive"

export interface LeadType {
  id:    string
  label: string
  emoji: string
  cls:   string                              // tailwind badge classes
  match: (lead: ForeclosureLead, text: string) => boolean
}

// Order matters for display (most actionable first).
export const LEAD_TYPES: LeadType[] = [
  { id: "foreclosure", label: "Foreclosure", emoji: "🏚", cls: "bg-red-500/15 text-red-300 border-red-500/30",
    match: (l) => l.foreclosureStage === "NOTICE_OF_SALE" || l.foreclosureStage === "AUCTION" || !!l.auctionDate || (typeof l.daysUntilAuction === "number" && l.daysUntilAuction >= 0) },
  { id: "predicted", label: "Predicted", emoji: "🔮", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
    match: (l) => predictPreForeclosure(l).predicted },
  { id: "probate", label: "Probate / Inherited", emoji: "⚰️", cls: "bg-stone-500/15 text-stone-300 border-stone-500/30",
    match: (_l, t) => /probate|deceased|estate|inherit|obituary|heir/.test(t) },
  { id: "taxdelq", label: "Tax Delinquent", emoji: "🏛", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    match: (l, t) => !!l.taxDelinquent || /tax delinquen|tax default|back tax|delinquent tax/.test(t) },
  { id: "vacant", label: "Vacant / Abandoned", emoji: "🏚️", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    match: (l, t) => l.occupancy === "vacant" || /vacant|abandoned|boarded|zombie/.test(t) },
  { id: "absentee", label: "Absentee Owner", emoji: "✈️", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    match: (l, t) => !!l.isAbsentee || l.occupancy === "absentee" || /absentee|out[- ]of[- ]state|non[- ]owner/.test(t) },
  { id: "liens", label: "Liens / Judgments", emoji: "⚖️", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    match: (l, t) => (l.juniorLiens?.length ?? 0) > 0 || /\blien\b|judgment|heloc|writ of execution/.test(t) },
  { id: "code", label: "Code Violation", emoji: "🚧", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    match: (_l, t) => /code violation|condemn|nuisance|unsafe|uninhabitable/.test(t) },
  { id: "divorce", label: "Divorce", emoji: "💔", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    match: (_l, t) => /divorce|marital|dissolution/.test(t) },
  { id: "eviction", label: "Eviction / Tired LL", emoji: "📋", cls: "bg-lime-500/15 text-lime-300 border-lime-500/30",
    match: (l, t) => /eviction|unlawful detainer|tired landlord|rental property/.test(t) || ((l.isAbsentee || l.occupancy === "absentee") && (l.yearsOwned ?? 0) >= 12) },
  { id: "bankruptcy", label: "Bankruptcy", emoji: "💸", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    match: (_l, t) => /bankruptcy|chapter 13|chapter 7/.test(t) },
  { id: "highequity", label: "High Equity", emoji: "💰", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    match: (l) => (l.equityPercent ?? 0) >= 40 },
  { id: "motivated", label: "Motivated / As-Is", emoji: "🔥", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    match: (_l, t) => /motivated|price (?:cut|reduced|drop|reduction)|must sell|\bas[- ]is\b|cash only|fixer|short sale|distressed listing|fire|water damage/.test(t) },
]

const TYPE_BY_ID = new Map(LEAD_TYPES.map((t) => [t.id, t]))
export function leadTypeMeta(id: string): LeadType | undefined { return TYPE_BY_ID.get(id) }

function leadText(lead: ForeclosureLead): string {
  // distressSignals already folds in the raw scraped signals (via the adapter).
  return [lead.distressSignals?.join(" "), lead.scoreReason, lead.foreclosureType]
    .filter(Boolean).join(" ").toLowerCase()
}

// All categories a lead belongs to (ids), most-actionable first.
export function classifyLead(lead: ForeclosureLead): string[] {
  const t = leadText(lead)
  return LEAD_TYPES.filter((lt) => { try { return lt.match(lead, t) } catch { return false } }).map((lt) => lt.id)
}

export function leadHasType(lead: ForeclosureLead, typeId: string): boolean {
  const lt = TYPE_BY_ID.get(typeId)
  if (!lt) return false
  try { return lt.match(lead, leadText(lead)) } catch { return false }
}

// Count leads per category across a result set (for the filter chips).
export function typeCounts(leads: ForeclosureLead[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const l of leads) for (const id of classifyLead(l)) counts[id] = (counts[id] ?? 0) + 1
  return counts
}
