// Form 13F — what the best institutional investors actually bought.
//
// This is the single most-used EDGAR filing for finding ideas, and for a good
// reason: it is the only place where managers running billions have to disclose
// their actual positions, under regulation, whether or not it flatters them. A
// manager's letter is marketing. A 13F is a filing.
//
// WHAT MAKES IT USEFUL IS THE DIFF, NOT THE HOLDINGS. Knowing Berkshire owns
// Apple is not information — everyone knows. What carries signal is what CHANGED
// last quarter: a brand-new position means someone with a research budget and
// real capital reached a conclusion recently enough to act on it. So this
// compares consecutive quarters and reports openings, meaningful adds, and
// exits, never the static portfolio.
//
// THE 45-DAY LAG IS REAL AND MUST NOT BE HIDDEN. 13F is due 45 days after
// quarter end, so a "new position" may be up to four and a half months old and
// the manager may already have sold it. That makes this a RESEARCH LEAD — a
// pointer at a company worth analysing ourselves — and never a reason to buy.
// Every output here carries the as-of date so the staleness is visible rather
// than implied.
//
// WHY A CURATED FILER LIST. There are thousands of 13F filers and most are
// index funds, banks and wealth managers whose holdings reflect mandates rather
// than judgment. Reading all of them would produce the market back. These are
// managers with concentrated, research-driven portfolios and long public track
// records — the ones whose CHANGES mean something. Every CIK below was verified
// against EDGAR rather than assumed.
import { throttledFetch } from "./edgar-client"

export interface EliteFiler {
  cik: string
  name: string
  style: string
}

export const ELITE_FILERS: EliteFiler[] = [
  { cik: "0001067983", name: "Berkshire Hathaway", style: "concentrated value, decades-long holding periods" },
  { cik: "0001061768", name: "Baupost Group", style: "deep value, willing to hold cash rather than overpay" },
  { cik: "0001336528", name: "Pershing Square", style: "concentrated activist positions" },
  { cik: "0001079114", name: "Greenlight Capital", style: "value with a documented short discipline" },
  { cik: "0001040273", name: "Third Point", style: "event-driven and activist" },
  { cik: "0001167483", name: "Tiger Global", style: "growth and technology" },
  { cik: "0001103804", name: "Viking Global", style: "long/short fundamental research" },
  { cik: "0001061165", name: "Lone Pine Capital", style: "concentrated growth" },
  { cik: "0001350694", name: "Bridgewater Associates", style: "macro and systematic" },
  { cik: "0001649339", name: "Scion Asset Management", style: "contrarian deep value" },
]

export interface Holding {
  issuer: string
  cusip: string
  valueUsd: number
  shares: number
}

export interface HoldingChange {
  issuer: string
  cusip: string
  filer: string
  filerStyle: string
  changeType: "new_position" | "increased" | "exited" | "reduced"
  valueUsd: number
  previousValueUsd: number
  changePct: number | null
  asOfDate: string
  filedDate: string
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`))
  return m ? m[1].trim() : null
}

interface FilingRef { accession: string; filingDate: string; reportDate: string }

async function recent13F(cik: string, count = 2): Promise<FilingRef[]> {
  const res = await throttledFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)
  if (!res.ok) return []
  const data = await res.json() as {
    filings?: { recent?: { form?: string[]; accessionNumber?: string[]; filingDate?: string[]; reportDate?: string[] } }
  }
  const r = data.filings?.recent
  if (!r?.form) return []

  const out: FilingRef[] = []
  for (let i = 0; i < r.form.length && out.length < count; i++) {
    // 13F-HR only. 13F-NT is a notice that holdings are reported elsewhere and
    // carries no holdings table at all.
    if (r.form[i] !== "13F-HR") continue
    out.push({
      accession: (r.accessionNumber?.[i] ?? "").replace(/-/g, ""),
      filingDate: r.filingDate?.[i] ?? "",
      reportDate: r.reportDate?.[i] ?? "",
    })
  }
  return out
}

// The holdings table is a separate XML document in the accession, named
// unpredictably — it is whichever .xml file is not primary_doc.xml.
async function fetchHoldings(cik: string, accession: string): Promise<Holding[]> {
  const numericCik = String(Number(cik))
  const base = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accession}`

  const idxRes = await throttledFetch(`${base}/index.json`)
  if (!idxRes.ok) return []
  const idx = await idxRes.json() as { directory?: { item?: Array<{ name?: string }> } }

  const xmlName = (idx.directory?.item ?? [])
    .map(i => i.name ?? "")
    .find(n => n.endsWith(".xml") && !n.includes("primary_doc"))
  if (!xmlName) return []

  const res = await throttledFetch(`${base}/${xmlName}`)
  if (!res.ok) return []
  const xml = await res.text()

  // A single issuer appears on multiple rows — separate managers, and shared
  // versus sole voting discretion. Summing by CUSIP is required; reading rows
  // individually would report one position as several.
  const byCusip = new Map<string, Holding>()
  for (const block of xml.split(/<\w*:?infoTable>/).slice(1)) {
    const cusip = tag(block, "cusip")
    const issuer = tag(block, "nameOfIssuer")
    const value = Number(tag(block, "value") ?? 0)
    const shares = Number(tag(block, "sshPrnamt") ?? 0)
    if (!cusip || !issuer || !isFinite(value)) continue

    const existing = byCusip.get(cusip)
    if (existing) {
      existing.valueUsd += value
      existing.shares += isFinite(shares) ? shares : 0
    } else {
      byCusip.set(cusip, { issuer, cusip, valueUsd: value, shares: isFinite(shares) ? shares : 0 })
    }
  }
  return [...byCusip.values()]
}

// 13F is due 45 days after quarter end, so the freshest possible reading is
// already ~45 days old and a normal one is ~135 days old at the end of a
// quarter. Beyond this the filing describes a portfolio that has had two more
// quarters to change, which is not a research lead — and a stale reading
// presented without a date reads as current. Verified necessary: one filer
// returned a 2023 report date from its most recent 13F-HR entries.
const MAX_REPORT_AGE_DAYS = 200

// A position must be large enough to reflect conviction rather than a residual
// or a hedge leg.
const MIN_POSITION_USD = 25_000_000
// An add below this is drift or rebalancing, not a decision.
const MEANINGFUL_INCREASE_PCT = 25

export async function getFilerChanges(filer: EliteFiler): Promise<HoldingChange[]> {
  try {
    const filings = await recent13F(filer.cik, 2)
    if (filings.length < 2) return []

    const [current, prior] = filings

    const ageDays = (Date.now() - new Date(current.reportDate).getTime()) / 86_400_000
    if (!isFinite(ageDays) || ageDays > MAX_REPORT_AGE_DAYS) return []

    const [currentHoldings, priorHoldings] = await Promise.all([
      fetchHoldings(filer.cik, current.accession),
      fetchHoldings(filer.cik, prior.accession),
    ])
    if (currentHoldings.length === 0 || priorHoldings.length === 0) return []

    const priorByCusip = new Map(priorHoldings.map(h => [h.cusip, h]))
    const currentByCusip = new Map(currentHoldings.map(h => [h.cusip, h]))
    const changes: HoldingChange[] = []

    for (const h of currentHoldings) {
      if (h.valueUsd < MIN_POSITION_USD) continue
      const before = priorByCusip.get(h.cusip)

      if (!before) {
        changes.push({
          issuer: h.issuer, cusip: h.cusip, filer: filer.name, filerStyle: filer.style,
          changeType: "new_position", valueUsd: h.valueUsd, previousValueUsd: 0,
          changePct: null, asOfDate: current.reportDate, filedDate: current.filingDate,
        })
      } else if (before.valueUsd > 0) {
        const changePct = ((h.valueUsd - before.valueUsd) / before.valueUsd) * 100
        if (changePct >= MEANINGFUL_INCREASE_PCT) {
          changes.push({
            issuer: h.issuer, cusip: h.cusip, filer: filer.name, filerStyle: filer.style,
            changeType: "increased", valueUsd: h.valueUsd, previousValueUsd: before.valueUsd,
            changePct, asOfDate: current.reportDate, filedDate: current.filingDate,
          })
        }
      }
    }

    // Exits matter as much as entries: a manager closing a large position has
    // concluded something changed, and that is information whichever way it cuts.
    for (const h of priorHoldings) {
      if (h.valueUsd < MIN_POSITION_USD) continue
      if (!currentByCusip.has(h.cusip)) {
        changes.push({
          issuer: h.issuer, cusip: h.cusip, filer: filer.name, filerStyle: filer.style,
          changeType: "exited", valueUsd: 0, previousValueUsd: h.valueUsd,
          changePct: -100, asOfDate: current.reportDate, filedDate: current.filingDate,
        })
      }
    }

    return changes.sort((a, b) => Math.max(b.valueUsd, b.previousValueUsd) - Math.max(a.valueUsd, a.previousValueUsd))
  } catch {
    return []
  }
}

// Issuer names in 13F filings are abbreviated in ways that never match a
// company name exactly ("ALPHABET INC CL C" vs "Alphabet Inc."). Normalizing
// away suffixes and share-class markers makes matching tractable.
export function normalizeIssuer(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(INC|CORP|CORPORATION|CO|COMPANY|LTD|LLC|PLC|HLDGS?|HOLDINGS?|GROUP|THE)\b/g, " ")
    .replace(/\b(CL|CLASS)\s*[A-C]\b/g, " ")
    .replace(/\b(COM|COMMON|STK|SHS|NEW|ADR|SPON|SPONSORED)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export interface ConvictionSignal {
  buyers: string[]
  sellers: string[]
  netBuyers: number
  summary: string
}

// Multiple independent managers moving the same way is the strongest form this
// signal takes. One manager is an opinion; four separately reaching the same
// conclusion is harder to dismiss.
export function summarizeForIssuer(changes: HoldingChange[], issuerName: string): ConvictionSignal | null {
  const target = normalizeIssuer(issuerName)
  if (!target) return null

  const matched = changes.filter(c => {
    const n = normalizeIssuer(c.issuer)
    return n === target || n.startsWith(target) || target.startsWith(n)
  })
  if (matched.length === 0) return null

  const buyers = matched.filter(c => c.changeType === "new_position" || c.changeType === "increased")
  const sellers = matched.filter(c => c.changeType === "exited" || c.changeType === "reduced")

  const asOf = matched[0].asOfDate
  const parts: string[] = []
  if (buyers.length > 0) {
    parts.push(`${buyers.map(b => b.filer).join(", ")} ${buyers.length === 1 ? "was" : "were"} buying as of ${asOf}`)
  }
  if (sellers.length > 0) {
    parts.push(`${sellers.map(s => s.filer).join(", ")} exited`)
  }

  return {
    buyers: buyers.map(b => `${b.filer} — ${b.changeType === "new_position" ? "opened a new position" : `increased ${b.changePct?.toFixed(0)}%`} ($${(b.valueUsd / 1e6).toFixed(0)}M)`),
    sellers: sellers.map(s => `${s.filer} — exited a $${(s.previousValueUsd / 1e6).toFixed(0)}M position`),
    netBuyers: buyers.length - sellers.length,
    summary: `${parts.join("; ")}. 13F is filed 45 days after quarter end, so this is a research lead rather than a current position — the manager may already have changed it.`,
  }
}
