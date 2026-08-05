// Seeds the markets universe with a real, diversified set of companies and
// crypto assets so the screens have something to screen against.
//
// Run:  npx tsx scripts/seed-markets.ts stocks 20
//       npx tsx scripts/seed-markets.ts crypto 10
//
// Requires SEC_EDGAR_USER_AGENT, the Supabase env vars, and (for narrative/news)
// GROQ_API_KEY. Idempotent: re-running re-scores existing rows rather than
// duplicating them.
//
// Universe design: this is deliberately NOT just mega-cap tech. The screens
// only produce useful contrast if the universe spans sectors, sizes, and
// business models — a dividend screen needs actual dividend payers, a
// turnaround screen needs beaten-down names, and a growth screen needs
// companies with real backlog. A universe of 20 tech giants would make every
// screen return the same seven names.

import { analyzeAndUpsertTicker } from "../lib/stock-pipeline"
import { analyzeAndUpsertCrypto } from "../lib/crypto-pipeline"

// Diversified across sector, market cap, and profile so screens differentiate.
const STOCK_UNIVERSE = [
  // Mega-cap technology — backlog, R&D, buybacks
  "MSFT", "AAPL", "GOOGL", "NVDA", "AMZN", "META", "AVGO", "ORCL", "CRM", "ADBE",
  // Semis and hardware
  "AMD", "QCOM", "TXN", "INTC", "MU", "AMAT",
  // Healthcare and pharma — steady cash generators
  "JNJ", "UNH", "LLY", "PFE", "ABBV", "MRK", "TMO", "AMGN",
  // Financials
  "JPM", "BAC", "GS", "MS", "V", "MA", "AXP", "BLK",
  // Consumer staples — the dividend/steady-holdings backbone
  "KO", "PEP", "PG", "COST", "WMT", "MCD", "CL", "KMB", "GIS", "SYY",
  // Industrials and defense — backlog-heavy, good for the growth screen
  "CAT", "DE", "HON", "GE", "LMT", "RTX", "BA", "UNP", "UPS", "ETN",
  // Energy and materials
  "XOM", "CVX", "COP", "SLB", "LIN", "SHW", "NUE",
  // Utilities and telecom — low beta, high yield
  "NEE", "DUK", "SO", "D", "T", "VZ",
  // Consumer discretionary and retail
  "HD", "LOW", "NKE", "SBUX", "TJX", "TGT", "DIS",
  // Software and internet growth
  "NOW", "INTU", "PANW", "SNOW", "UBER", "ABNB", "SHOP", "NFLX",
  // Mid-caps and second-tier names — the screens need breadth beyond mega-caps
  // to have anything to discriminate between.
  "ADSK", "WDAY", "TEAM", "DDOG", "NET", "ZS", "CRWD", "MDB", "HUBS", "TTD",
  "FTNT", "ANET", "KLAC", "LRCX", "ADI", "NXPI", "ON", "MCHP", "SWKS", "TER",
  "REGN", "VRTX", "BIIB", "GILD", "ZTS", "IDXX", "DXCM", "ISRG", "EW", "SYK",
  "SCHW", "PNC", "USB", "TFC", "COF", "DFS", "SPGI", "MCO", "ICE", "CME",
  "MDLZ", "HSY", "K", "CAG", "CPB", "CHD", "CLX", "MKC", "STZ", "TAP",
  "EMR", "PH", "ITW", "ROK", "CMI", "PCAR", "FAST", "GWW", "URI", "CSX",
  "PSX", "VLO", "MPC", "OXY", "HAL", "BKR", "EOG", "DVN", "FCX", "APD",
  "AEP", "EXC", "XEL", "ED", "WEC", "PEG", "SRE", "PPL", "CMS", "AEE",
  "ORLY", "AZO", "ROST", "ULTA", "BBY", "DKS", "YUM", "CMG", "DRI", "MAR",
  // Beaten-down / turnaround candidates — the screens need these to have range
  "PARA", "WBA", "F", "GM", "PYPL", "NKE", "EL", "DG", "CVS", "MMM",
]

// Spans L1s, DeFi with real revenue, and infrastructure — again for contrast.
const CRYPTO_UNIVERSE = [
  "bitcoin", "ethereum", "solana", "binancecoin", "ripple", "cardano",
  "avalanche-2", "chainlink", "polkadot", "cosmos", "near", "aptos",
  "uniswap", "aave", "maker", "lido-dao", "curve-dao-token", "pancakeswap-token",
  "arbitrum", "optimism", "the-graph", "injective-protocol", "render-token", "filecoin",
]

const DEEP = process.argv.includes("--deep")

function dedupe(list: string[]): string[] {
  return [...new Set(list)]
}

async function seedStocks(limit: number) {
  const universe = dedupe(STOCK_UNIVERSE).slice(0, limit)
  console.log(`Seeding ${universe.length} companies...\n`)

  let ok = 0, failed = 0
  for (const [i, symbol] of universe.entries()) {
    const started = Date.now()
    try {
      // Narrative (an 8MB filing fetch + AI read) and news (web search + AI)
      // are the expensive steps — 15-70s per company versus ~5s without. Bulk
      // seeding skips them by default so a full universe finishes in one run;
      // both still populate automatically the first time a user looks the
      // company up. Pass --deep to include them here.
      const r = await analyzeAndUpsertTicker(symbol, { includeNarrative: DEEP, includeNews: DEEP })
      if (r.ok) {
        const t = r.ticker as Record<string, unknown>
        ok++
        console.log(
          `[${i + 1}/${universe.length}] ${symbol.padEnd(6)} ` +
          `signal=${String(t.actionSignal ?? "—").toUpperCase().padEnd(5)} ` +
          `strength=${String(t.qualityScore ?? "—").padStart(3)} ` +
          `risk=${String(t.riskScore ?? "—").padStart(3)} ` +
          `fwd=${String(t.forwardScore ?? "—").padStart(3)} ` +
          `F=${String(t.piotroskiScore ?? "—")}/9 ` +
          `(${((Date.now() - started) / 1000).toFixed(1)}s)`
        )
      } else {
        failed++
        console.log(`[${i + 1}/${universe.length}] ${symbol.padEnd(6)} FAILED: ${r.error}`)
      }
    } catch (err) {
      failed++
      console.log(`[${i + 1}/${universe.length}] ${symbol.padEnd(6)} ERROR: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\nDone. ${ok} scored, ${failed} failed.`)
}

async function seedCrypto(limit: number) {
  const universe = dedupe(CRYPTO_UNIVERSE).slice(0, limit)
  console.log(`Seeding ${universe.length} crypto assets...\n`)

  let ok = 0, failed = 0
  for (const [i, id] of universe.entries()) {
    const started = Date.now()
    try {
      const r = await analyzeAndUpsertCrypto(id)
      if (r.ok) {
        const a = r.asset as Record<string, unknown>
        ok++
        console.log(
          `[${i + 1}/${universe.length}] ${String(a.symbol ?? id).padEnd(8)} ` +
          `signal=${String(a.actionSignal ?? "—").toUpperCase().padEnd(5)} ` +
          `strength=${String(a.qualityScore ?? "—").padStart(3)} ` +
          `risk=${String(a.riskScore ?? "—").padStart(3)} ` +
          `sec=${String(a.securityScore ?? "—").padStart(3)} ` +
          `(${((Date.now() - started) / 1000).toFixed(1)}s)`
        )
      } else {
        failed++
        console.log(`[${i + 1}/${universe.length}] ${id.padEnd(8)} FAILED: ${r.error}`)
      }
    } catch (err) {
      failed++
      console.log(`[${i + 1}/${universe.length}] ${id.padEnd(8)} ERROR: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\nDone. ${ok} scored, ${failed} failed.`)
}

async function main() {
  const kind = process.argv[2] ?? "stocks"
  const limit = Number(process.argv[3] ?? 20)
  if (kind === "crypto") await seedCrypto(limit)
  else await seedStocks(limit)
}

main()
