// Universe seeding — the real bottleneck behind "the leads aren't good".
//
// The tracked universe was 257 companies out of ~10,400 SEC registrants, and it
// was composed of exactly two things: mega-caps seeded as a starter watchlist,
// and companies surfaced by distress triggers. Both are bad sources of
// investment ideas, for opposite reasons.
//
// The mega-caps are where twenty analysts already publish and where this
// system's own backtest measured no edge — a quality ranking of Apple and
// Alphabet is not a discovery. The distress discoveries are companies in
// serious trouble by construction, since every trigger looks for restatements,
// bankruptcies and going-concern doubt. Neither population contains the thing a
// good list should contain: sound, under-covered companies at a reasonable
// price.
//
// Nothing was ever seeded from that population because there is no filing event
// for "quietly doing fine and reasonably valued" — good companies do not
// announce themselves. They have to be enumerated and screened.
//
// EXCHANGE IS THE QUALITY FILTER THAT MATTERS. SEC publishes the listing venue
// for every registrant. Nasdaq (4,339) and NYSE (3,314) carry continuous
// listing standards — minimum price, market value, governance requirements,
// audited financials. OTC (2,514) does not, and that is precisely where the
// shells and defunct registrants sit. Excluding OTC removes most of the junk
// with one field rather than with a dozen heuristics.
import { prisma } from "@/lib/prisma"

const TICKERS_EXCHANGE = "https://www.sec.gov/files/company_tickers_exchange.json"

// Venues with continuous listing standards. CBOE is included: only 27
// registrants, but it is a real exchange with real requirements.
const ACCEPTED_EXCHANGES = new Set(["Nasdaq", "NYSE", "CBOE"])

function userAgent(): string {
  const ua = process.env.SEC_EDGAR_USER_AGENT
  if (!ua) throw new Error("SEC_EDGAR_USER_AGENT is not set — SEC requires it on every request.")
  return ua
}

// Mirrors isAnalyzableSecurity() in lib/edgar-discovery.ts. Derivative
// securities and blank-check shells have no operating financials to score.
function isAnalyzable(symbol: string, name: string): boolean {
  if (!symbol || symbol.length > 5) return false
  if (!/^[A-Z]+$/.test(symbol)) return false          // excludes dash-suffixed classes
  if (symbol.length === 5 && /[WUR]$/.test(symbol)) return false
  if (/\b(acquisition|blank check)\b/i.test(name)) return false
  if (/\btrust\b/i.test(name) && /\bunit\b/i.test(name)) return false
  return true
}

export interface SeedResult {
  fetched: number
  eligible: number
  created: number
  alreadyTracked: number
  skipped: number
}

export async function seedUniverse(limit: number): Promise<SeedResult> {
  const res = await fetch(TICKERS_EXCHANGE, {
    headers: { "User-Agent": userAgent(), Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`SEC ticker file returned ${res.status}`)

  const payload = await res.json() as { fields: string[]; data: unknown[][] }
  const idx = {
    cik: payload.fields.indexOf("cik"),
    name: payload.fields.indexOf("name"),
    ticker: payload.fields.indexOf("ticker"),
    exchange: payload.fields.indexOf("exchange"),
  }
  if (Object.values(idx).some(i => i < 0)) {
    throw new Error("SEC ticker file schema changed — expected cik/name/ticker/exchange")
  }

  const result: SeedResult = {
    fetched: payload.data.length, eligible: 0, created: 0, alreadyTracked: 0, skipped: 0,
  }

  // PAGINATED DELIBERATELY. PostgREST caps an unbounded select at 1,000 rows,
  // and the shim only passes a limit when `take` is set — so a plain findMany
  // silently returns a truncated set with no error. That produced a seeding
  // deadlock: with 1,900 rows already stored the query saw 1,000, ~900
  // already-created symbols were treated as new, and every insert collided on
  // the unique index while the batch reported zero progress.
  const tracked = new Set<string>()
  const PAGE = 1000
  for (let skip = 0; ; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.ticker as any).findMany({
      select: { symbol: true }, take: PAGE, skip,
    }) as Array<{ symbol: string }>
    for (const t of page) tracked.add(t.symbol)
    if (page.length < PAGE) break
  }

  const candidates: Array<{ cik: string; symbol: string; name: string; exchange: string }> = []
  for (const row of payload.data) {
    const exchange = String(row[idx.exchange] ?? "")
    const symbol = String(row[idx.ticker] ?? "").toUpperCase()
    const name = String(row[idx.name] ?? "")

    if (!ACCEPTED_EXCHANGES.has(exchange)) { result.skipped++; continue }
    if (!isAnalyzable(symbol, name)) { result.skipped++; continue }

    result.eligible++
    if (tracked.has(symbol)) { result.alreadyTracked++; continue }

    candidates.push({
      cik: String(row[idx.cik] ?? "").padStart(10, "0"),
      symbol,
      name,
      exchange,
    })
  }

  for (const c of candidates.slice(0, limit)) {
    try {
      // A stub, not an analysis. dataConfidence stays "insufficient" and
      // lastScoredAt stays null, so the refresh cron — which orders by
      // lastScoredAt ascending — picks these up ahead of already-scored rows
      // and fills them in over subsequent runs. Nothing unscored can reach a
      // ranking, because every screen gates on dataConfidence.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.ticker as any).create({
        data: {
          cik: c.cik,
          symbol: c.symbol,
          name: c.name,
          exchange: c.exchange,
          dataConfidence: "insufficient",
        },
      })
      result.created++
    } catch {
      // Unique violation on symbol/cik — already seeded by a concurrent run.
      result.alreadyTracked++
    }
  }

  return result
}
