// Data-source health checks — the answer to "we do not want any failures".
//
// You cannot guarantee a prediction is right. You CAN guarantee you'll know
// when the inputs break, and that is where real systems actually fail. This
// project has already hit three silent breakages that produced no error at all:
//
//   • Stooq began serving a JavaScript proof-of-work page instead of CSV. Every
//     price fetch returned zero bars. Nothing threw. Momentum, volatility, beta
//     and the Altman market-cap term silently vanished from every score.
//   • The Supabase REST shim translated `{ not: null }` into `neq.null`, which
//     matches nothing in SQL. Every top-picks and screen query returned empty
//     while the database held hundreds of rows.
//   • SEC's ticker map pointed XOM at a post-reorganization holding company
//     with no financial history, so Exxon scored "insufficient data" forever.
//
// Every one of those degraded output while reporting success. So each source
// gets an assertion that its response actually contains usable data — not just
// that the HTTP call returned 200.
import { getCompanyTickers, getCompanyFacts, countGaapConcepts } from "./edgar-client"
import { fetchHistory } from "./price-history"
import { prisma } from "./prisma"
import { runAgent } from "./claude"

export interface HealthCheck {
  source: string
  ok: boolean
  detail: string
  critical: boolean
}

export interface HealthReport {
  healthy: boolean
  criticalFailures: number
  checks: HealthCheck[]
  checkedAt: string
}

async function check(
  source: string,
  critical: boolean,
  fn: () => Promise<{ ok: boolean; detail: string }>
): Promise<HealthCheck> {
  try {
    const r = await fn()
    return { source, critical, ...r }
  } catch (err) {
    return { source, critical, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks = await Promise.all([
    // AI PROVIDER — every comprehension feature depends on this, and every one
    // of them catches its own errors and returns an empty fallback, so a dead
    // provider looks exactly like "this company had no news".
    //
    // The failure this exists to catch: ANTHROPIC_API_KEY was PRESENT in the
    // environment but empty. An empty string is falsy, so provider selection
    // silently fell through to a free-tier model, which then exhausted its
    // daily token cap and 429'd every call. News, the bear case, narrative
    // reading and risk materiality were all returning empty for days while
    // reporting success.
    check("ai-provider", true, async () => {
      const anthropic = process.env.ANTHROPIC_API_KEY ?? ""
      const groq = process.env.GROQ_API_KEY ?? ""
      if (!anthropic && !groq) {
        return { ok: false, detail: "no AI provider key configured — every comprehension feature is dead" }
      }
      if (!anthropic && groq) {
        return {
          ok: false,
          detail: "ANTHROPIC_API_KEY is missing or empty, so analysis is falling back to the free-tier model — set a real key",
        }
      }
      // Assert the key actually WORKS, not merely that it is non-empty.
      const r = await runAgent("Reply with the single word: ok", "ok", { maxTokens: 16 })
      const text = typeof r === "string" ? r : JSON.stringify(r)
      return text.length > 0
        ? { ok: true, detail: `AI provider responding (${text.slice(0, 20).trim()})` }
        : { ok: false, detail: "AI provider returned an empty response" }
    }),

    // SEC ticker map — every stock lookup starts here.
    check("sec-ticker-map", true, async () => {
      const t = await getCompanyTickers()
      return t.length > 5000
        ? { ok: true, detail: `${t.length.toLocaleString()} tickers mapped` }
        : { ok: false, detail: `only ${t.length} tickers returned — expected 10,000+` }
    }),

    // XBRL fundamentals — assert real concept depth, not just a 200.
    check("sec-xbrl-facts", true, async () => {
      const facts = await getCompanyFacts("0000789019") // Microsoft
      const n = countGaapConcepts(facts)
      return n >= 150
        ? { ok: true, detail: `${n} us-gaap concepts for the reference filer` }
        : { ok: false, detail: `only ${n} concepts — XBRL payload is thin or malformed` }
    }),

    // Price history — the exact failure mode Stooq exhibited.
    check("price-history", true, async () => {
      const { bars, latestPrice } = await fetchHistory("AAPL")
      if (bars.length < 100) return { ok: false, detail: `only ${bars.length} bars returned — every price-derived metric is degraded` }
      if (!latestPrice || latestPrice <= 0) return { ok: false, detail: "bars returned but no usable latest price" }
      return { ok: true, detail: `${bars.length} bars, last $${latestPrice.toFixed(2)}` }
    }),

    // CoinGecko — crypto universe depends on it entirely.
    check("coingecko", true, async () => {
      const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=5&page=1", {
        signal: AbortSignal.timeout(15000),
      })
      if (res.status === 429) return { ok: false, detail: "rate limited (429) — set COINGECKO_API_KEY to raise the ceiling" }
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const d = await res.json()
      return Array.isArray(d) && d.length > 0
        ? { ok: true, detail: `${d.length} assets returned` }
        : { ok: false, detail: "empty response" }
    }),

    // GoPlus — contract security is the crypto hard-fail input.
    check("goplus-security", false, async () => {
      const res = await fetch("https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", {
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const d = await res.json()
      return d?.result && Object.keys(d.result).length > 0
        ? { ok: true, detail: "contract security data returned" }
        : { ok: false, detail: "empty result" }
    }),

    // DefiLlama — protocol revenue and discovery.
    check("defillama", false, async () => {
      const res = await fetch("https://api.llama.fi/protocols", { signal: AbortSignal.timeout(20000) })
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` }
      const d = await res.json()
      return Array.isArray(d) && d.length > 100
        ? { ok: true, detail: `${d.length} protocols` }
        : { ok: false, detail: "unexpected shape" }
    }),

    // The not-null bug class: assert a real query returns real rows.
    check("db-query-integrity", true, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const total = await (prisma.ticker as any).findMany({ take: 200 }) as unknown[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notNull = await (prisma.ticker as any).findMany({
        where: { qualityScore: { not: null } }, take: 200,
      }) as unknown[]
      if (total.length === 0) return { ok: true, detail: "no tickers stored yet — nothing to verify" }
      return notNull.length > 0
        ? { ok: true, detail: `"is not null" filter returns ${notNull.length} of ${total.length} rows` }
        : { ok: false, detail: `${total.length} tickers stored but the "is not null" filter returned 0 — query translation is broken` }
    }),

    // Environment: the silent 403 generator.
    check("sec-user-agent", true, async () => {
      return process.env.SEC_EDGAR_USER_AGENT
        ? { ok: true, detail: "configured" }
        : { ok: false, detail: "SEC_EDGAR_USER_AGENT unset — SEC will block every request" }
    }),
  ])

  const criticalFailures = checks.filter(c => !c.ok && c.critical).length
  return {
    healthy: criticalFailures === 0,
    criticalFailures,
    checks,
    checkedAt: new Date().toISOString(),
  }
}
