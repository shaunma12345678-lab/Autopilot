// Outcome-Verified Predictions — the forecast ledger. Every search records
// which leads we PREDICTED would reach foreclosure and which are CONFIRMED
// (sale scheduled). When a previously-predicted property later shows up
// confirmed, that's a VERIFIED HIT with a measured lead time. When a property
// we watched but didn't flag turns confirmed, that's a MISS. Properties first
// seen already-confirmed count as pre-existing (no chance to predict — not
// held against accuracy). Persisted in AgentMemory (no migration), server-only,
// best-effort throughout.

import { prisma } from "@/lib/prisma"

const SLUG = "re-forecast-ledger"
const KEY = "ledger"
const PRED_CAP = 4000
const WATCH_CAP = 6000
const CSEEN_CAP = 8000
const HITS_CAP = 400
const MISS_ADDR_CAP = 20

export interface ForecastHit {
  sig: string
  a: string           // address label
  p: number           // probability at prediction time (0-100)
  predictedAt: string // ISO date
  confirmedAt: string // ISO date
  leadDays: number    // how many days early we called it
}

export interface ForecastLedger {
  v: 1
  since: string
  pred: Record<string, { p: number; t: string; a: string }>  // open forecasts
  watch: Record<string, string>                               // seen, not flagged (sig → ISO first seen)
  cSeen: string[]                                             // confirmed sigs already counted
  hits: ForecastHit[]
  nMiss: number
  missAddrs: string[]
  nPre: number
}

export interface OutcomeItem {
  sig: string
  addr: string
  predicted: boolean
  probability: number
  confirmed: boolean
}

export function emptyLedger(): ForecastLedger {
  return { v: 1, since: new Date().toISOString(), pred: {}, watch: {}, cSeen: [], hits: [], nMiss: 0, missAddrs: [], nPre: 0 }
}

export async function loadForecastLedger(businessId: string): Promise<ForecastLedger> {
  if (!businessId) return emptyLedger()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key: KEY } })
    if (row?.value) {
      const parsed = JSON.parse(row.value) as ForecastLedger
      if (parsed && parsed.v === 1 && parsed.pred && Array.isArray(parsed.hits)) return { ...emptyLedger(), ...parsed }
    }
  } catch { /* first run / store unavailable */ }
  return emptyLedger()
}

export async function saveForecastLedger(businessId: string, ledger: ForecastLedger): Promise<void> {
  if (!businessId) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify(ledger)
    await mem.upsert({
      where:  { businessId, agentSlug: SLUG, key: KEY },
      create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key: KEY, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

function capRecord<T>(rec: Record<string, T>, cap: number, olderFirst: (a: [string, T], b: [string, T]) => number): Record<string, T> {
  const entries = Object.entries(rec)
  if (entries.length <= cap) return rec
  entries.sort(olderFirst)
  return Object.fromEntries(entries.slice(entries.length - cap))
}

// Fold one batch of search results into the ledger. Mutates and returns it.
export function applyOutcomes(ledger: ForecastLedger, items: OutcomeItem[]): ForecastLedger {
  const now = new Date()
  const nowIso = now.toISOString()
  const cSeen = new Set(ledger.cSeen)

  for (const it of items) {
    if (!it.sig || it.sig.length < 4) continue
    if (it.confirmed) {
      if (cSeen.has(it.sig)) continue
      cSeen.add(it.sig)
      const open = ledger.pred[it.sig]
      if (open) {
        const leadDays = Math.max(0, Math.round((now.getTime() - new Date(open.t).getTime()) / 86400000))
        ledger.hits.push({ sig: it.sig, a: open.a || it.addr, p: open.p, predictedAt: open.t, confirmedAt: nowIso, leadDays })
        delete ledger.pred[it.sig]
      } else if (ledger.watch[it.sig]) {
        ledger.nMiss += 1
        if (it.addr) ledger.missAddrs = [...ledger.missAddrs, it.addr].slice(-MISS_ADDR_CAP)
        delete ledger.watch[it.sig]
      } else {
        ledger.nPre += 1
      }
    } else if (it.predicted) {
      if (!ledger.pred[it.sig] && !cSeen.has(it.sig)) {
        ledger.pred[it.sig] = { p: Math.round(it.probability), t: nowIso, a: it.addr }
        delete ledger.watch[it.sig]
      }
    } else if (!ledger.pred[it.sig] && !ledger.watch[it.sig] && !cSeen.has(it.sig)) {
      ledger.watch[it.sig] = nowIso
    }
  }

  ledger.cSeen = [...cSeen].slice(-CSEEN_CAP)
  ledger.hits = ledger.hits.slice(-HITS_CAP)
  ledger.pred = capRecord(ledger.pred, PRED_CAP, (a, b) => a[1].t.localeCompare(b[1].t))
  ledger.watch = capRecord(ledger.watch, WATCH_CAP, (a, b) => a[1].localeCompare(b[1]))
  return ledger
}

export interface ForecastStats {
  since: string
  verified: number
  missed: number
  preexisting: number
  pending: number
  watched: number
  coveragePct: number | null      // of foreclosures we were tracking, % we called beforehand
  avgLeadDays: number | null
  medianLeadDays: number | null
  bands: { high: number; mid: number; low: number }  // verified hits by predicted probability
  recent: ForecastHit[]
  missAddrs: string[]
}

export function computeForecastStats(ledger: ForecastLedger): ForecastStats {
  const withLead = ledger.hits.filter((h) => h.leadDays > 0).map((h) => h.leadDays).sort((a, b) => a - b)
  const avg = withLead.length ? Math.round(withLead.reduce((s, d) => s + d, 0) / withLead.length) : null
  const median = withLead.length ? withLead[Math.floor(withLead.length / 2)] : null
  const decided = ledger.hits.length + ledger.nMiss
  return {
    since: ledger.since,
    verified: ledger.hits.length,
    missed: ledger.nMiss,
    preexisting: ledger.nPre,
    pending: Object.keys(ledger.pred).length,
    watched: Object.keys(ledger.watch).length,
    coveragePct: decided ? Math.round((ledger.hits.length / decided) * 100) : null,
    avgLeadDays: avg,
    medianLeadDays: median,
    bands: {
      high: ledger.hits.filter((h) => h.p >= 70).length,
      mid: ledger.hits.filter((h) => h.p >= 45 && h.p < 70).length,
      low: ledger.hits.filter((h) => h.p < 45).length,
    },
    recent: [...ledger.hits].slice(-8).reverse(),
    missAddrs: [...ledger.missAddrs].reverse(),
  }
}
