// Deal pipeline + relationship engine — the daily workflow. Tracks every deal
// through stages, logs every seller interaction, and coaches the next move so
// deals stop leaking. Pure types + logic; the UI persists it in localStorage.

export type Stage = "New" | "Contacted" | "Offer" | "Contract" | "Closed" | "Dead"
export const STAGES: Stage[] = ["New", "Contacted", "Offer", "Contract", "Closed", "Dead"]
export const STAGE_CLR: Record<Stage, string> = {
  New:       "bg-slate-500/15 text-slate-300 border-slate-500/40",
  Contacted: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  Offer:     "bg-amber-500/15 text-amber-300 border-amber-500/40",
  Contract:  "bg-violet-500/15 text-violet-300 border-violet-500/40",
  Closed:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Dead:      "bg-red-500/15 text-red-300 border-red-500/40",
}

export type InteractionType = "call" | "text" | "email" | "note"
export interface Interaction { at: string; type: InteractionType; text: string }

export interface PipelineDeal {
  id:           string
  address:      string
  owner?:       string
  city?:        string
  state?:       string
  phone?:       string
  stage:        Stage
  notes:        string
  interactions: Interaction[]
  nextFollowUp?: string   // ISO date (yyyy-mm-dd)
  createdAt:    string
}

export function newDeal(partial: Partial<PipelineDeal>): PipelineDeal {
  return {
    id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()),
    address: partial.address ?? "", owner: partial.owner, city: partial.city, state: partial.state, phone: partial.phone,
    stage: partial.stage ?? "New", notes: partial.notes ?? "", interactions: partial.interactions ?? [],
    nextFollowUp: partial.nextFollowUp, createdAt: new Date().toISOString(),
  }
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

// Relationship-engine coaching — the suggested next move for a deal.
export function coachDeal(d: PipelineDeal): string {
  if (d.stage === "Closed") return "Closed — ask for referrals and a testimonial."
  if (d.stage === "Dead")   return "Revisit in 60–90 days — situations change."
  const last = d.interactions[d.interactions.length - 1]
  if (!last) return "No contact logged yet — send the opener and log it."
  const days = daysSince(last.at)
  if (d.stage === "Contract") return "Under contract — line up your buyer + title, keep the seller warm."
  if (d.stage === "Offer")    return days >= 3 ? `Offer out ${days}d — circle back: ask what's holding them.` : "Offer out — give it a day, then follow up."
  if (days >= 4) return `${days} days since last contact — follow up now. Most deals close on the 5th+ touch.`
  return `Last contact ${days}d ago — stay top of mind; follow up in a couple days.`
}

export type FollowState = "overdue" | "today" | "upcoming" | null
export function followUpState(d: PipelineDeal): FollowState {
  if (!d.nextFollowUp || d.stage === "Closed" || d.stage === "Dead") return null
  const t = new Date(d.nextFollowUp + "T00:00:00").getTime()
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime()
  if (t < today) return "overdue"
  if (t === today) return "today"
  return "upcoming"
}
