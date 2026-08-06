// Offline point-in-time backtest runner.
//
// Run: npx tsx scripts/run-backtest.ts
//
// This is deliberately a script and not a Vercel route. It fetches multi-MB
// companyfacts plus ten years of daily bars per symbol, which will not finish
// inside a 300s function limit, and it should be run intentionally rather than
// on a schedule so results aren't quietly regenerated and re-tuned against.
import { resolveCik, getSubmissions, getCompanyFacts } from "../lib/edgar-client"
import { fetchDeepHistory } from "../lib/price-history"
import { scoreAsOf, aggregate, type BacktestObservation } from "../lib/backtest"

const HORIZON_DAYS = 90
// Yahoo throttles aggressively on burst. Pacing between symbols keeps a long
// run alive; without it a 429 cascade silently empties the whole sample.
const SYMBOL_DELAY_MS = 3000
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Quarterly as-of dates. Each is a day on which we pretend to stand, knowing
// only what had been filed by then.
function asOfDates(startYear: number, endYear: number): string[] {
  const out: string[] = []
  for (let y = startYear; y <= endYear; y++) {
    for (const md of ["-02-15", "-05-15", "-08-15", "-11-15"]) out.push(`${y}${md}`)
  }
  const cutoff = new Date(Date.now() - (HORIZON_DAYS + 5) * 86400000).toISOString().slice(0, 10)
  return out.filter(d => d <= cutoff)
}

function addDays(iso: string, n: number): string {
  return new Date(new Date(iso).getTime() + n * 86400000).toISOString().slice(0, 10)
}

function closeOn(bars: { date: string; close: number }[], iso: string): number | null {
  let found: number | null = null
  for (const b of bars) {
    if (b.date <= iso) found = b.close
    else break
  }
  return found
}

const UNIVERSE = process.argv[2]
  ? process.argv[2].split(",")
  : ["AAPL","MSFT","GOOGL","AMZN","NVDA","META","JPM","JNJ","PG","KO","XOM","WMT","DIS","V","MA","HD",
     "INTC","PFE","CSCO","ORCL","CRM","ADBE","NFLX","T","VZ","CVX","MRK","ABBV","LLY","BAC","WFC","GS",
     "CAT","DE","BA","GE","MMM","HON","UPS","LOW","TGT","COST","NKE","SBUX","MCD","QCOM","TXN","AMD",
     "MU","AMAT","LRCX","KLAC","GILD","AMGN","BMY","UNH","CVS","CI","F","GM"]

async function main() {
  const dates = asOfDates(2017, new Date().getFullYear())
  console.log(`Backtest: ${UNIVERSE.length} symbols x ${dates.length} as-of dates, ${HORIZON_DAYS}-day horizon`)
  console.log(`As-of range: ${dates[0]} -> ${dates[dates.length - 1]}\n`)

  // The benchmark is load-bearing — every excess return depends on it — so it
  // retries patiently rather than aborting the run on a transient throttle.
  let benchmark: Awaited<ReturnType<typeof fetchDeepHistory>> = []
  for (let attempt = 1; attempt <= 10 && benchmark.length < 500; attempt++) {
    benchmark = await fetchDeepHistory("SPY")
    if (benchmark.length < 500) {
      console.log(`  SPY attempt ${attempt}: ${benchmark.length} bars, waiting 60s...`)
      await sleep(60000)
    }
  }
  if (benchmark.length < 500) throw new Error(`Benchmark history unavailable after retries`)
  console.log(`SPY: ${benchmark.length} bars ${benchmark[0].date} -> ${benchmark[benchmark.length - 1].date}\n`)

  const observations: BacktestObservation[] = []
  let done = 0

  for (const symbol of UNIVERSE) {
    done++
    if (done > 1) await sleep(SYMBOL_DELAY_MS)
    try {
      const resolved = await resolveCik(symbol)
      if (!resolved) { console.log(`  ${symbol}: no CIK`); continue }

      const [facts, subs, bars] = await Promise.all([
        getCompanyFacts(resolved.cik),
        getSubmissions(resolved.cik),
        fetchDeepHistory(symbol),
      ])
      if (!facts || bars.length < 500) { console.log(`  ${symbol}: insufficient data`); continue }

      const sicCode = subs?.sic ?? null
      let kept = 0

      for (const asOf of dates) {
        const exitDate = addDays(asOf, HORIZON_DAYS)
        const entry = closeOn(bars, asOf)
        const exit = closeOn(bars, exitDate)
        const bEntry = closeOn(benchmark, asOf)
        const bExit = closeOn(benchmark, exitDate)
        if (!entry || !exit || !bEntry || !bExit) continue
        // Guard against the bar series simply not reaching the exit date.
        if (bars[bars.length - 1].date < exitDate) continue

        const scored = scoreAsOf(facts, bars, benchmark, asOf, sicCode)
        if (!scored || scored.qualityScore === null || !scored.strengthTier) continue
        // Same gate the live product applies — thin data never gets ranked,
        // so it must not be counted as a call here either.
        if (scored.dataConfidence === "insufficient" || scored.dataConfidence === "low") continue

        const fwd = (exit / entry - 1) * 100
        const bench = (bExit / bEntry - 1) * 100
        observations.push({
          symbol, asOf,
          qualityScore: scored.qualityScore,
          strengthTier: scored.strengthTier,
          actionSignal: scored.actionSignal,
          dataConfidence: scored.dataConfidence,
          forwardReturnPct: fwd,
          benchmarkReturnPct: bench,
          excessReturnPct: fwd - bench,
        })
        kept++
      }
      console.log(`  [${done}/${UNIVERSE.length}] ${symbol}: ${kept} observations`)
    } catch (err) {
      console.log(`  ${symbol}: ${err instanceof Error ? err.message : "failed"}`)
    }
  }

  const result = aggregate(observations, HORIZON_DAYS)
  console.log(`\n${"=".repeat(64)}`)
  console.log(`RESULTS — ${result.observations} observations across ${result.symbolsTested} companies`)
  console.log(`${"=".repeat(64)}`)

  const row = (t: { tier: string; n: number; meanExcessPct: number; medianExcessPct: number; hitRatePct: number }) =>
    `  ${t.tier.padEnd(10)} n=${String(t.n).padStart(4)}  mean ${t.meanExcessPct >= 0 ? "+" : ""}${t.meanExcessPct.toFixed(2)}%  median ${t.medianExcessPct >= 0 ? "+" : ""}${t.medianExcessPct.toFixed(2)}%  beat-SPY ${t.hitRatePct.toFixed(1)}%`

  console.log(`\nBy strength tier (excess return vs SPY over ${HORIZON_DAYS} days):`)
  result.byTier.forEach(t => console.log(row(t)))
  console.log(`\nBy action signal:`)
  result.bySignal.forEach(t => console.log(row(t)))
  console.log(`\nTop-quartile minus bottom-quartile mean excess: ${
    result.quartileSpreadPct === null ? "n/a" : `${result.quartileSpreadPct >= 0 ? "+" : ""}${result.quartileSpreadPct.toFixed(2)}%`}`)
  console.log(`\nNotes:`)
  result.notes.forEach(n => console.log(`  - ${n}`))
}

main().catch(e => { console.error(e); process.exit(1) })
