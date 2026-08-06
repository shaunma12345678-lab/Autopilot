// Event-driven company discovery across ALL ~10,400 SEC filers.
//
// This is the structural fix for the real bottleneck. A hand-typed watchlist of
// 80 mega-caps is 0.77% of the market, and it's the 0.77% that twenty analysts
// already cover — there is nothing left to discover there. Piotroski's
// documented outperformance was concentrated in small, low-coverage names, so
// applying good tools to famous companies is applying them where they have the
// least edge.
//
// The architecture deliberately mirrors the residential lead engine: a cheap
// discovery pass writes event rows, and a separate analysis pass processes the
// highest-priority ones. Discovery scanning stays fast; the expensive per-
// company work is rate-limited and prioritized.
//
// FORMS WE USE, AND WHY (all verified live against EDGAR):
//   NT 10-K / NT 10-Q — a company formally notifying the SEC that it CANNOT
//     file on time. Only 45 filed in a two-month window across the entire
//     market, which makes this extraordinarily high signal-to-noise. It is the
//     closest equity analog to a notice of default.
//   S-1 / S-1/A — the IPO pipeline. Companies that will be investable soon.
//   8-K item 1.01 — material definitive agreements: major contracts,
//     partnerships, financings.
//
// FORMS WE DELIBERATELY DO NOT USE:
//   SC 13D / SC 13G (activist and >5% ownership stakes) would be excellent
//   signals, but EDGAR's full-text search returns zero results for them —
//   they're indexed separately from the full-text corpus. Rather than ship a
//   silently-empty feed, they're omitted until a working source is found.
import { prisma } from "@/lib/prisma"
import { getCompanyTickers } from "@/lib/edgar-client"

const FULLTEXT = "https://efts.sec.gov/LATEST/search-index"

function userAgent(): string {
  const ua = process.env.SEC_EDGAR_USER_AGENT
  if (!ua) throw new Error("SEC_EDGAR_USER_AGENT is not set — SEC requires it on every request.")
  return ua
}

let lastRequestAt = 0
async function throttledFetch(url: string): Promise<Response> {
  const wait = Math.max(0, lastRequestAt + 250 - Date.now())
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
  return fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  })
}


// Filters out securities that aren't operating companies.
//
// Discovery scans every registrant, which surfaces a meaningful share of things
// that look like leads but can't be analyzed. Measured on a live sample: ~17%
// of discovered rows were warrants, units, rights, or blank-check shells.
//
//   • NASDAQ 5-character tickers use the final letter as a class suffix:
//     W = warrant, U = unit, R = rights. TMSWW, BENFW, ZPTAW, RDACU and AXINR
//     are all derivative securities, not businesses with financials.
//     The rule applies ONLY at length 5 — plenty of real 4-letter companies end
//     in those letters (ATYR is aTyr Pharma, NNBR is NN Inc), and blanket
//     suffix matching would throw them away.
//   • SPACs ("... Acquisition Corp") are blank-check shells with no operating
//     business. They always resolve to insufficient data, so analyzing them
//     just burns cron budget that should go to real companies.
function isAnalyzableSecurity(symbol: string, companyName: string): boolean {
  if (symbol.length === 5 && /[WUR]$/.test(symbol)) return false
  // Dash-suffixed share classes are the same problem in different notation and
  // were slipping through: BBBY-WT (warrant), XRN-PB / GPUS-PD (preferred),
  // ADIG-WI (when-issued). None of them is a business with financials.
  if (/-(WT|WS|WI|RT|U|P[A-Z]?)$/i.test(symbol)) return false
  if (/\b(acquisition|blank check)\b/i.test(companyName)) return false
  if (/\btrust\b/i.test(companyName) && /\bunit\b/i.test(companyName)) return false
  return true
}

export type DiscoveryEventType =
  | "late_filing"
  | "ipo_pipeline"
  | "material_agreement"
  | "insider_cluster_buy"
  | "restatement"
  | "going_concern"
  | "bankruptcy"
  | "delisting_risk"
  | "auditor_change"
  | "annual_report"

interface DiscoverySpec {
  eventType: DiscoveryEventType
  forms: string
  /** Base priority; higher gets analyzed sooner. */
  priority: number
  rationale: string
  /** Optional full-text query to narrow the form set. */
  q?: string
}

const DISCOVERY_SPECS: DiscoverySpec[] = [
  {
    eventType: "late_filing",
    forms: "NT 10-K,NT 10-Q",
    priority: 90,
    rationale:
      "Filed notice that it could not submit a periodic report on time. Rare across the whole market and a well-known precursor to accounting or solvency trouble.",
  },
  {
    eventType: "ipo_pipeline",
    forms: "S-1",
    priority: 55,
    rationale: "Filed a registration statement — approaching a public listing.",
  },
  {
    eventType: "material_agreement",
    forms: "8-K",
    priority: 45,
    q: '"material definitive agreement"',
    rationale: "Disclosed a material definitive agreement — a significant contract, partnership, or financing.",
  },

  // The distress set. Every query below was verified against live EDGAR
  // full-text search before being added, with its three-month hit count
  // recorded — a query that silently returns nothing is worse than no trigger,
  // because the feed still looks like it is working.
  {
    // A freshly filed 10-K is the trigger for year-over-year risk-factor
    // diffing (lib/risk-factor-diff.ts). Without this the diff only runs on a
    // rotation through already-tracked companies, so the single moment when a
    // newly disclosed risk is genuinely news — the day it is filed — is the
    // moment the system is least likely to look at it.
    eventType: "annual_report",
    forms: "10-K",
    priority: 62,
    rationale:
      "Filed its annual report. Analyzed on arrival so newly added risk-factor language is compared against last year's filing while it is still new.",
  },
  {
    eventType: "restatement",
    forms: "8-K",
    priority: 98,
    q: '"non-reliance on previously issued financial statements"',
    rationale:
      "Told investors its own previously published financial statements can no longer be relied upon. This is the strongest single red flag a filing can carry: it invalidates the historical numbers every ratio was computed from. 48 filings market-wide in three months.",
  },
  {
    eventType: "bankruptcy",
    forms: "8-K",
    priority: 95,
    // The Item 1.03 title, not the phrase "chapter 11". The looser phrase
    // returns 251 hits but matches any filing that MENTIONS bankruptcy —
    // a counterparty's, a customer's, or boilerplate risk language — which is
    // not the same event at all. The item title matches companies filing the
    // disclosure about themselves.
    q: '"bankruptcy or receivership"',
    rationale: "Filed the disclosure item reserved for its own bankruptcy or receivership. 106 filings in three months.",
  },
  {
    eventType: "going_concern",
    forms: "8-K",
    priority: 92,
    q: '"ability to continue as a going concern"',
    rationale:
      "Raised substantial doubt about its ability to continue operating. Auditors do not use this language lightly — it is a formal determination under ASC 205-40, not a turn of phrase. 452 filings in three months.",
  },
  {
    eventType: "auditor_change",
    forms: "8-K",
    priority: 88,
    q: '"dismissed as the Company\'s independent registered public accounting firm"',
    rationale:
      "Dismissed its auditor. Rare enough to be meaningful — only 70 filings matched this exact phrasing across the entire market — and it frequently precedes a restatement.",
  },
  {
    eventType: "delisting_risk",
    forms: "8-K",
    priority: 75,
    q: '"delisting determination"',
    rationale:
      "Received a delisting determination from its exchange. Uses the determination phrasing rather than the Item 3.01 title, which returns zero hits because filers do not write it that way. 103 filings in three months.",
  },
]

interface FtsHit {
  _source?: {
    file_date?: string
    file_type?: string
    display_names?: string[]
    ciks?: string[]
    adsh?: string
  }
}

// EDGAR embeds the ticker inside display_names as "Company Name  (TICK)  (CIK 000...)".
function parseDisplayName(display: string | undefined): { name: string; symbol: string | null } {
  if (!display) return { name: "Unknown", symbol: null }
  const symbolMatch = display.match(/\(([A-Z][A-Z0-9.\-]{0,5})\)\s*\(CIK/)
  const name = display.split("(")[0].trim() || "Unknown"
  return { name, symbol: symbolMatch ? symbolMatch[1] : null }
}

export interface DiscoveryRun {
  scanned: number
  created: number
  skipped: number
  byType: Record<string, number>
  errors: string[]
}

export async function runDiscovery(opts: { lookbackDays?: number; perFormLimit?: number } = {}): Promise<DiscoveryRun> {
  const lookbackDays = opts.lookbackDays ?? 14
  const perFormLimit = opts.perFormLimit ?? 60

  const enddt = new Date().toISOString().slice(0, 10)
  const startdt = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10)

  // Ticker map lets us skip filers with no tradeable ticker (shells, trusts,
  // foreign private issuers filing without a US listing).
  const tickerMap = new Map<string, { symbol: string; name: string }>()
  for (const t of await getCompanyTickers()) tickerMap.set(t.cik, { symbol: t.symbol, name: t.name })

  const run: DiscoveryRun = { scanned: 0, created: 0, skipped: 0, byType: {}, errors: [] }

  for (const spec of DISCOVERY_SPECS) {
    try {
      const params = new URLSearchParams({
        q: spec.q ?? "",
        forms: spec.forms,
        dateRange: "custom",
        startdt,
        enddt,
      })
      const res = await throttledFetch(`${FULLTEXT}?${params}`)
      if (!res.ok) { run.errors.push(`${spec.eventType}: HTTP ${res.status}`); continue }

      const data = await res.json()
      const hits = (data?.hits?.hits ?? []) as FtsHit[]
      run.scanned += hits.length

      for (const hit of hits.slice(0, perFormLimit)) {
        const src = hit._source
        if (!src) continue
        const cikRaw = src.ciks?.[0]
        if (!cikRaw) continue
        const cik = cikRaw.padStart(10, "0")

        const parsed = parseDisplayName(src.display_names?.[0])
        const mapped = tickerMap.get(cik)
        const symbol = mapped?.symbol ?? parsed.symbol
        const companyName = mapped?.name ?? parsed.name

        // No ticker means it isn't analyzable by the stock pipeline.
        if (!symbol) { run.skipped++; continue }
        // Nor are warrants, units, rights, or blank-check shells.
        if (!isAnalyzableSecurity(symbol, companyName)) { run.skipped++; continue }

        const eventDate = src.file_date ?? enddt

        try {
          // The unique index on (cik, eventType, eventDate) makes re-running
          // idempotent, but the REST shim doesn't surface conflict handling —
          // so check first.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const existing = await (prisma.discoveryEvent as any).findFirst({
            where: { cik, eventType: spec.eventType, eventDate: new Date(eventDate).toISOString() },
          })
          if (existing) { run.skipped++; continue }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma.discoveryEvent as any).create({
            data: {
              cik,
              symbol,
              companyName,
              eventType: spec.eventType,
              eventDate: new Date(eventDate).toISOString(),
              formType: src.file_type ?? spec.forms.split(",")[0],
              accessionNumber: src.adsh ?? null,
              sourceUrl: src.adsh
                ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${src.adsh.replace(/-/g, "")}/`
                : null,
              priority: spec.priority,
              rationale: spec.rationale,
            },
          })
          run.created++
          run.byType[spec.eventType] = (run.byType[spec.eventType] ?? 0) + 1
        } catch {
          run.skipped++
        }
      }
    } catch (err) {
      run.errors.push(`${spec.eventType}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return run
}

// Returns the discovered companies most worth analyzing next: highest priority
// first, oldest first within a priority so nothing starves.
export async function nextDiscoveriesToAnalyze(limit: number): Promise<Array<{ id: string; symbol: string; cik: string; eventType: string }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma.discoveryEvent as any).findMany({
    where: { processed: false },
    orderBy: { priority: "desc" },
    take: limit * 3,
  }) as Array<{ id: string; symbol: string | null; cik: string; eventType: string; eventDate: string }>

  return rows
    .filter(r => Boolean(r.symbol))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .slice(0, limit)
    .map(r => ({ id: r.id, symbol: r.symbol as string, cik: r.cik, eventType: r.eventType }))
}

export async function markDiscoveryProcessed(id: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.discoveryEvent as any).update({
      where: { id },
      data: { processed: true, processedAt: new Date().toISOString() },
    })
  } catch { /* best effort */ }
}
