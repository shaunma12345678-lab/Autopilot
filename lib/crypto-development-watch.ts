// Crypto's counterpart to lib/event-significance.ts — same "what changed
// recently" job, deliberately built differently.
//
// WHY NOT PORT event-significance.ts DIRECTLY. That file reads the text of a
// freshly-filed 8-K — a document type crypto has no equivalent of. Building
// an AI pass that reads "the latest crypto filing" would mean inventing a
// document to read, which is exactly the kind of confident-sounding
// fabrication this system exists to avoid. What crypto actually has is a
// stream of VERIFIED COMPUTED FACTS that changes run over run — security
// score, mint authority, ownership renouncement, LP lock, unlock schedule,
// conviction tier. Comparing this run's facts against the prior run's is a
// deterministic, honest way to answer "what's new" — same pattern as
// lib/falsification.ts's checkFalsified, applied to a different fact set.
//
// No AI call in this file. Every event here is a verified before/after
// comparison, not an interpretation.
export type DevelopmentDirection = "positive" | "negative"

export interface DevelopmentEvent {
  label: string
  direction: DevelopmentDirection
  detail: string
}

export interface DevelopmentWatch {
  events: DevelopmentEvent[]
  headline: string | null
}

export interface WatchFacts {
  securityScore: number | null
  isHoneypot: boolean | null
  isMintable: boolean | null
  ownershipRenounced: boolean | null
  lpLocked: boolean | null
  devActivityScore: number | null
  convictionTier: string | null
  nextUnlockDate: string | null
  nextUnlockPctSupply: number | null
}

const TIER_RANK: Record<string, number> = { "below-bar": 0, standard: 1, high: 2, elite: 3 }

// A drop/rise below this is treated as measurement noise, not a real change —
// GoPlus re-scans can shift a couple points run to run with no underlying
// change to the contract.
const SECURITY_SCORE_MOVE_THRESHOLD = 15

export function detectCryptoDevelopments(prior: WatchFacts | null, current: WatchFacts): DevelopmentWatch {
  if (!prior) return { events: [], headline: null }
  const events: DevelopmentEvent[] = []

  if (prior.isHoneypot === false && current.isHoneypot === true) {
    events.push({
      label: "Honeypot newly detected", direction: "negative",
      detail: "Contract security checks now flag this as a honeypot — that was not the case last time it was scored. Treat as a total-loss risk.",
    })
  }
  if (prior.isMintable === false && current.isMintable === true) {
    events.push({
      label: "Mint authority newly enabled", direction: "negative",
      detail: "The contract now allows the owner to mint new supply, which it did not before.",
    })
  }
  if (prior.ownershipRenounced === true && current.ownershipRenounced === false) {
    events.push({
      label: "Ownership control regained", direction: "negative",
      detail: "Contract ownership was renounced and no longer is — the owner has regained the ability to modify the contract.",
    })
  }
  if (prior.lpLocked === true && current.lpLocked === false) {
    events.push({
      label: "Liquidity unlocked", direction: "negative",
      detail: "Previously-locked liquidity is no longer locked — it could now be withdrawn.",
    })
  }

  if (prior.securityScore !== null && current.securityScore !== null) {
    const delta = current.securityScore - prior.securityScore
    if (delta <= -SECURITY_SCORE_MOVE_THRESHOLD) {
      events.push({
        label: "Security score dropped", direction: "negative",
        detail: `Security score fell from ${prior.securityScore} to ${current.securityScore}.`,
      })
    } else if (delta >= SECURITY_SCORE_MOVE_THRESHOLD) {
      events.push({
        label: "Security score improved", direction: "positive",
        detail: `Security score rose from ${prior.securityScore} to ${current.securityScore}.`,
      })
    }
  }

  if (prior.devActivityScore !== null && prior.devActivityScore > 20 && current.devActivityScore === 0) {
    events.push({
      label: "Developer activity stopped", direction: "negative",
      detail: "Commits dropped to zero after previously being active — a possible sign of abandonment.",
    })
  }

  // A newly-imminent unlock: wasn't within 30 days last run, is now.
  if (current.nextUnlockDate) {
    const daysUntil = (new Date(current.nextUnlockDate).getTime() - Date.now()) / 86400000
    const priorDaysUntil = prior.nextUnlockDate
      ? (new Date(prior.nextUnlockDate).getTime() - Date.now()) / 86400000
      : null
    if (daysUntil >= 0 && daysUntil <= 30 && (priorDaysUntil === null || priorDaysUntil > 30)) {
      events.push({
        label: "Token unlock now imminent", direction: "negative",
        detail: `${current.nextUnlockPctSupply !== null ? `${current.nextUnlockPctSupply.toFixed(1)}% of supply` : "A tranche of supply"} unlocks within 30 days.`,
      })
    }
  }

  if (prior.convictionTier && current.convictionTier
      && TIER_RANK[prior.convictionTier] !== undefined && TIER_RANK[current.convictionTier] !== undefined
      && prior.convictionTier !== current.convictionTier) {
    const improved = TIER_RANK[current.convictionTier] > TIER_RANK[prior.convictionTier]
    events.push({
      label: improved ? "Conviction tier improved" : "Conviction tier fell",
      direction: improved ? "positive" : "negative",
      detail: `Conviction moved from ${prior.convictionTier} to ${current.convictionTier}.`,
    })
  }

  // Headline: the most severe negative first (safety-relevant facts lead),
  // otherwise the first positive.
  const negative = events.find(e => e.direction === "negative")
  const headline = negative?.label ?? events[0]?.label ?? null

  return { events, headline }
}
