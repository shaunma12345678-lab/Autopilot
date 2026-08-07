// Verification against known outcomes — does the risk detection catch failures
// it should have caught?
//
// Every measurement so far tested RETURN prediction, and the answer was no:
// quality quartile spread -1.00% at 90 days. But return prediction was never
// this system's strongest claim. The defensible claim is RISK DETECTION — that
// reading primary documents surfaces problems before they are widely known.
//
// That claim has never been tested, and it is testable in exactly one honest
// way: take companies whose accounting problems are now publicly documented,
// reconstruct what was knowable BEFORE the disclosure using factsAsOf(), and
// check which signals fired. Nothing here uses hindsight in the inputs — the
// only hindsight is in choosing which companies to examine, which is disclosed
// rather than hidden.
//
// WHAT A HONEST RESULT LOOKS LIKE. A signal that fires on every company catches
// every fraud and is worthless. So each case is run alongside a control group
// of companies with no known accounting problem in the same window. A signal
// only earns credit if it fires on the failures and stays quiet on the controls.
//
// Run: npx tsx scripts/verify-known-outcomes.ts
import { resolveCik, getCompanyFacts, getSubmissions, countGaapConcepts, findOperatingCik } from "../lib/edgar-client"
import { factsAsOf } from "../lib/backtest"
import { extractSeries, normalizeFundamentals } from "../lib/edgar-normalize"
import { computePiotroski } from "../lib/stock-scores/piotroski"
import { computeAltmanZ } from "../lib/stock-scores/altman"
import { computeBeneishM } from "../lib/stock-scores/beneish"
import { analyzeBenford } from "../lib/benford"
import { checkDataIntegrity } from "../lib/filing-integrity"
import { fetchDeepHistory } from "../lib/price-history"

interface Case {
  symbol: string
  label: string
  /** The date the problem became public. We analyse strictly BEFORE this. */
  disclosureDate: string
  known: "accounting_problem" | "control"
}

// Documented cases, with the date the issue became public. Controls are large
// filers with no known accounting problem over the same period.
const CASES: Case[] = [
  // Documented accounting or disclosure failures, with the date each became
  // public. Chosen for XBRL-era coverage — pre-2010 cases have no structured
  // financial data to reconstruct.
  { symbol: "KHC",  label: "Kraft Heinz — SEC subpoena, procurement accounting, $15B writedown", disclosureDate: "2019-02-21", known: "accounting_problem" },
  { symbol: "UAA",  label: "Under Armour — revenue pull-forward, SEC charged",                   disclosureDate: "2019-11-03", known: "accounting_problem" },
  { symbol: "GE",   label: "General Electric — SEC investigation, insurance/power charges",      disclosureDate: "2018-01-24", known: "accounting_problem" },
  { symbol: "WFC",  label: "Wells Fargo — unauthorised accounts scandal",                        disclosureDate: "2016-09-08", known: "accounting_problem" },
  { symbol: "VRX",  label: "Valeant — Philidor channel stuffing, restatement",                   disclosureDate: "2015-10-21", known: "accounting_problem" },
  { symbol: "TUP",  label: "Tupperware — going concern, restatement of prior periods",           disclosureDate: "2023-06-01", known: "accounting_problem" },
  { symbol: "LUMN", label: "Lumen — multi-billion goodwill impairments",                         disclosureDate: "2019-02-13", known: "accounting_problem" },
  { symbol: "BBBY", label: "Bed Bath & Beyond — collapse into bankruptcy",                       disclosureDate: "2022-08-31", known: "accounting_problem" },

  // Controls: large filers with no known accounting problem in the same window.
  { symbol: "JNJ",  label: "Johnson & Johnson (control)", disclosureDate: "2019-02-21", known: "control" },
  { symbol: "PG",   label: "Procter & Gamble (control)",  disclosureDate: "2019-02-21", known: "control" },
  { symbol: "KO",   label: "Coca-Cola (control)",         disclosureDate: "2019-11-03", known: "control" },
  { symbol: "COST", label: "Costco (control)",            disclosureDate: "2018-01-24", known: "control" },
  { symbol: "MMM",  label: "3M (control)",                disclosureDate: "2016-09-08", known: "control" },
  { symbol: "HD",   label: "Home Depot (control)",        disclosureDate: "2015-10-21", known: "control" },
  { symbol: "LMT",  label: "Lockheed Martin (control)",   disclosureDate: "2023-06-01", known: "control" },
  { symbol: "UNP",  label: "Union Pacific (control)",     disclosureDate: "2019-02-13", known: "control" },
  { symbol: "TGT",  label: "Target (control)",            disclosureDate: "2022-08-31", known: "control" },
]


// Analyse this many days before the problem surfaced, so the test asks whether
// the signals were available IN ADVANCE rather than concurrently.
const LEAD_DAYS = 60

function daysBefore(iso: string, n: number): string {
  return new Date(new Date(iso).getTime() - n * 86400000).toISOString().slice(0, 10)
}

async function run(c: Case) {
  const asOf = daysBefore(c.disclosureDate, LEAD_DAYS)
  const resolved = await resolveCik(c.symbol)
  if (!resolved) return { c, asOf, error: "no CIK" }

  const [rawFacts, subs] = await Promise.all([getCompanyFacts(resolved.cik), getSubmissions(resolved.cik)])
  if (!rawFacts) return { c, asOf, error: "no facts" }

  let facts = rawFacts
  if (countGaapConcepts(rawFacts) < 150) {
    const op = await findOperatingCik(subs?.name ?? resolved.name).catch(() => null)
    if (op && op !== resolved.cik) {
      const better = await getCompanyFacts(op)
      if (countGaapConcepts(better) > countGaapConcepts(rawFacts)) facts = better!
    }
  }

  // Point-in-time: everything filed after asOf is discarded.
  const pit = factsAsOf(facts, asOf)
  const series = extractSeries(pit)
  const f = normalizeFundamentals(pit, series)

  // MARKET CAP AT asOf, not null. The previous run passed null here, which
  // meant computeAltmanZ could never produce a zone and one of six signals was
  // silently dead across every case — a flaw in the test, not the system.
  const bars = await fetchDeepHistory(c.symbol).catch(() => [])
  let priceAt: number | null = null
  for (const b of bars) {
    if (b.date <= asOf) priceAt = b.close
    else break
  }
  const sharesAt = series.sharesOutstanding?.[0]?.value ?? null
  const marketCapAt = priceAt && sharesAt ? priceAt * sharesAt : null

  const piotroski = computePiotroski(series)
  const altman = computeAltmanZ(series, marketCapAt, subs?.sic ?? null)
  const beneish = computeBeneishM(series)
  const benford = analyzeBenford(pit)
  const integrity = checkDataIntegrity(series)

  const fired: string[] = []
  if (beneish.flagged) fired.push("Beneish")
  if (altman.zone === "distress") fired.push("Altman-distress")
  if ((piotroski.normalized ?? 9) <= 3) fired.push("F-Score<=3")
  if (benford.conformity === "nonconforming") fired.push("Benford")
  if (integrity.failed > 0) fired.push("Integrity")
  if (f.accrualsRatioPct !== null && f.accrualsRatioPct < -10) fired.push("Accruals")

  return { c, asOf, fired, piotroski: piotroski.normalized, beneishFlag: beneish.flagged,
           altman: altman.zone, benford: benford.conformity, accruals: f.accrualsRatioPct }
}

async function main() {
  console.log(`Point-in-time risk detection, ${LEAD_DAYS} days BEFORE each disclosure\n`)
  const rows = []
  for (const c of CASES) {
    const r = await run(c)
    rows.push(r)
    if ("error" in r) { console.log(`  ${c.symbol.padEnd(5)} ${r.error}`); continue }
    const tag = c.known === "accounting_problem" ? "PROBLEM" : "control"
    console.log(`  ${c.symbol.padEnd(5)} ${tag.padEnd(8)} asOf=${r.asOf}  fired=[${(r.fired ?? []).join(", ") || "nothing"}]`)
    console.log(`        F=${r.piotroski} beneish=${r.beneishFlag} altman=${r.altman} benford=${r.benford} accruals=${r.accruals?.toFixed(1) ?? "n/a"}`)
  }

  const probs = rows.filter(r => !("error" in r) && r.c.known === "accounting_problem")
  const ctrls = rows.filter(r => !("error" in r) && r.c.known === "control")
  const hit = probs.filter(r => (r.fired ?? []).length > 0).length
  const fp  = ctrls.filter(r => (r.fired ?? []).length > 0).length

  console.log(`\n${"=".repeat(60)}`)
  console.log(`  Fired on ${hit}/${probs.length} known accounting problems`)
  console.log(`  Fired on ${fp}/${ctrls.length} controls (false positives)`)
  console.log(`\n  A signal that fires on everything catches every fraud and is worthless.`)
  console.log(`  Only the gap between these two lines is evidence.`)
}

main().catch(e => { console.error(e); process.exit(1) })
