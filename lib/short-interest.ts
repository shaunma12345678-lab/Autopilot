// Short interest — the only free source of what informed money is betting
// AGAINST a company.
//
// Everything else in this system reads what a company says about itself and
// what its audited numbers show. Short interest is structurally different: it
// is a position taken by people with capital at risk who have concluded the
// opposite, and it is reported to FINRA under regulation rather than
// volunteered.
//
// HOW TO READ IT, WHICH IS WHERE MOST TOOLS GET IT WRONG. High short interest is
// not bearish on its own and low short interest is not bullish. What carries
// information is short interest AGAINST the fundamentals:
//
//   Rising shorts + deteriorating fundamentals -> confirmation. Someone did the
//   work before we did.
//
//   Rising shorts + improving fundamentals -> genuine disagreement. Either they
//   see something the filings do not yet show, or the position is crowded and
//   wrong. Both are worth knowing, and neither is a verdict.
//
//   Very high days-to-cover -> a crowded exit. It says how violently the price
//   could move on good news, not which direction it will go.
//
// So this never scores directionally on its own. It is context that changes how
// the other evidence should be read, which is exactly how a professional would
// use it.
const FINRA_API = "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest"

export interface ShortInterestRead {
  currentShares: number
  previousShares: number
  changePct: number
  daysToCover: number | null
  settlementDate: string
  /** Direction over the last two reporting periods. */
  trend: "building" | "covering" | "stable"
  crowded: boolean
  notes: string[]
}

// FINRA reports twice monthly. Beyond a few months a reading describes a
// position that has almost certainly been closed or rolled.
const MAX_AGE_DAYS = 75

// Days-to-cover above this means the existing short position needs more than
// two full weeks of average volume to exit. That is a genuinely crowded trade.
const CROWDED_DAYS_TO_COVER = 10

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

// FINRA returns CSV (text/plain), not JSON, despite an Accept header, and it
// REJECTS sortFields unless settlementDate is given as an EQUAL filter, since
// it is a partition key. So the newest reading is found by requesting a recent
// date window and taking the maximum client-side.
// Quote-aware CSV splitting. A naive split(",") breaks on commas INSIDE quoted
// fields, which shifts every column after them — and issuer names routinely
// contain one ("Skyworks Solutions, Inc. Commo"). That silently produced a
// wrong settlementDate for exactly those companies while working fine for
// issuers whose names happen to have no comma, which is the worst kind of bug:
// it looks like it works.
//
// FINRA also sends CRLF, so cells are trimmed BEFORE quotes are stripped —
// otherwise the closing quote of the final cell is not at the end of the string
// and the `$` anchor leaves it in place, making every header key unmatchable.
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // A doubled quote inside a quoted field is an escaped literal quote.
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      cells.push(cur.trim())
      cur = ""
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]))
  })
}

export async function getShortInterest(symbol: string): Promise<ShortInterestRead | null> {
  try {
    const end = new Date()
    const start = new Date(end.getTime() - MAX_AGE_DAYS * 86_400_000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const res = await fetch(FINRA_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: 20,
        compareFilters: [{ fieldName: "symbolCode", fieldValue: symbol.toUpperCase(), compareType: "EQUAL" }],
        dateRangeFilters: [{ fieldName: "settlementDate", startDate: iso(start), endDate: iso(end) }],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null

    const rows = parseCsv(await res.text())
    if (rows.length === 0) return null

    // Newest settlement in the window. The range filter already bounds staleness.
    const latest = rows.reduce((best, r) =>
      (r.settlementDate ?? "") > (best.settlementDate ?? "") ? r : best, rows[0])

    const settlementDate = latest.settlementDate ?? ""
    if (!settlementDate) return null

    const currentShares = num(latest.currentShortPositionQuantity) ?? 0
    const previousShares = num(latest.previousShortPositionQuantity) ?? 0
    const daysToCover = num(latest.daysToCoverQuantity)
    const changePct = num(latest.changePercent) ?? 0
    if (currentShares <= 0) return null

    const trend: ShortInterestRead["trend"] =
      changePct > 10 ? "building" : changePct < -10 ? "covering" : "stable"

    const crowded = daysToCover !== null && daysToCover >= CROWDED_DAYS_TO_COVER

    const notes: string[] = []
    if (trend === "building") {
      notes.push(`Short interest rose ${changePct.toFixed(0)}% in the latest reporting period, to ${(currentShares / 1e6).toFixed(1)}M shares — someone with capital at risk is taking the other side.`)
    } else if (trend === "covering") {
      notes.push(`Short interest fell ${Math.abs(changePct).toFixed(0)}% to ${(currentShares / 1e6).toFixed(1)}M shares — positions against the company are being closed.`)
    }
    if (crowded && daysToCover !== null) {
      notes.push(`It would take about ${daysToCover.toFixed(1)} days of average volume for shorts to exit. A crowded exit says how violently the price could move on news, not which way it will go.`)
    }

    return { currentShares, previousShares, changePct, daysToCover, settlementDate, trend, crowded, notes }
  } catch {
    return null
  }
}

// Short interest read AGAINST the fundamentals. This is the whole point: the
// same short position means opposite things depending on what the filings say.
export function interpretShortInterest(
  si: ShortInterestRead | null,
  qualityScore: number | null,
  deteriorating: boolean
): { flags: string[]; riskPenalty: number } {
  if (!si) return { flags: [], riskPenalty: 0 }

  const flags = [...si.notes]
  let riskPenalty = 0

  if (si.trend === "building" && deteriorating) {
    flags.push("⚠ Short interest is building while the fundamentals are deteriorating — the two independent signals agree, which makes each more credible than it would be alone.")
    riskPenalty = 10
  } else if (si.trend === "building" && qualityScore !== null && qualityScore >= 65) {
    flags.push("Short interest is building against a business that still scores as sound. That is a real disagreement: either shorts see something the filings have not yet shown, or the position is crowded and wrong.")
    riskPenalty = 3
  }

  return { flags, riskPenalty }
}
