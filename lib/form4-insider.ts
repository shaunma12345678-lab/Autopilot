// Form 4 insider transactions — parsed from the raw ownership XML.
//
// The academic literature is specific about what carries signal here, and it is
// NOT "insider activity" generically:
//
//   • Insider BUYING predicts returns, modestly but persistently. Executives
//     have one reason to spend their own money on their own stock.
//   • Insider SELLING is close to noise. People sell to diversify, to pay
//     taxes, to buy a house, and on pre-scheduled 10b5-1 plans set months in
//     advance. Treating a sale as bearish is a well-known amateur error.
//   • CLUSTERS matter far more than individuals. Several insiders buying
//     independently in a short window is a much stronger signal than one
//     purchase by one officer.
//
// Transaction codes are what make this tractable, and filtering them correctly
// is the whole game. Verified against a live Apple Form 4 whose codes were
// M (option exercise) and F (shares withheld for taxes) — compensation
// mechanics that look like "acquisitions" in the raw data but represent zero
// conviction. Only code P is an open-market purchase.
import { prisma } from "@/lib/prisma"

const CODE_OPEN_MARKET_BUY = "P"
const CODE_OPEN_MARKET_SELL = "S"
const CLUSTER_WINDOW_DAYS = 90
const CLUSTER_MIN_DISTINCT_BUYERS = 2

function userAgent(): string {
  const ua = process.env.SEC_EDGAR_USER_AGENT
  if (!ua) throw new Error("SEC_EDGAR_USER_AGENT is not set — SEC requires it on every request.")
  return ua
}

let lastRequestAt = 0
async function throttledFetch(url: string, timeoutMs = 15000): Promise<Response> {
  const wait = Math.max(0, lastRequestAt + 130 - Date.now())
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequestAt = Date.now()
  return fetch(url, { headers: { "User-Agent": userAgent() }, signal: AbortSignal.timeout(timeoutMs) })
}

interface Form4Transaction {
  owner: string
  ownerTitle: string | null
  code: string
  shares: number
  pricePerShare: number | null
  acquired: boolean
  date: string
  /** True when the filing footnotes reference a pre-scheduled 10b5-1 plan. */
  planned: boolean
}

// Deliberately regex-based rather than pulling in an XML parser: Form 4 has a
// flat, stable schema and this keeps the dependency surface at zero.
function parseForm4(xml: string): Form4Transaction[] {
  const owner = xml.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/)?.[1]?.trim() ?? "Unknown"
  const isOfficer = /<isOfficer>\s*(1|true)\s*<\/isOfficer>/i.test(xml)
  const isDirector = /<isDirector>\s*(1|true)\s*<\/isDirector>/i.test(xml)
  const titleMatch = xml.match(/<officerTitle>([^<]+)<\/officerTitle>/)?.[1]?.trim()
  const ownerTitle = titleMatch ?? (isOfficer ? "Officer" : isDirector ? "Director" : null)

  // A 10b5-1 plan means the trade was scheduled months earlier and carries no
  // information about current conviction.
  const planned = /10b5-1/i.test(xml)

  const transactions: Form4Transaction[] = []

  // Each non-derivative transaction block holds one code/shares/price triple.
  const blocks = xml.split(/<nonDerivativeTransaction>/).slice(1)
  for (const block of blocks) {
    const code = block.match(/<transactionCode>([A-Z])<\/transactionCode>/)?.[1]
    if (!code) continue
    const shares = Number(block.match(/<transactionShares>\s*<value>([\d.]+)<\/value>/)?.[1] ?? NaN)
    const price = Number(block.match(/<transactionPricePerShare>\s*<value>([\d.]+)<\/value>/)?.[1] ?? NaN)
    const ad = block.match(/<transactionAcquiredDisposedCode>\s*<value>([AD])<\/value>/)?.[1]
    const date = block.match(/<transactionDate>\s*<value>([\d-]+)<\/value>/)?.[1] ?? ""
    if (!isFinite(shares)) continue

    transactions.push({
      owner,
      ownerTitle,
      code,
      shares,
      pricePerShare: isFinite(price) ? price : null,
      acquired: ad === "A",
      date,
      planned,
    })
  }
  return transactions
}

export interface InsiderActivity {
  buyCount90d: number
  sellCount90d: number
  netSharesBought90d: number
  distinctBuyers: number
  clusterBuy: boolean
  summary: string
  /** Positive adjustment to the opportunity score when a real cluster exists. */
  scoreBonus: number
}

export interface Form4Filing {
  form: string
  filingDate: string
  accessionNumber: string
  primaryDocument: string
}

// Wall-clock ceiling for the whole insider pass. Large filers submit dozens of
// Form 4s and each is a separate throttled request; without a budget this alone
// can exceed a serverless function's entire time limit.
const INSIDER_TIME_BUDGET_MS = 20000

export async function analyzeInsiderActivity(
  cik: string,
  filings: Form4Filing[],
  maxFilings = 12
): Promise<InsiderActivity> {
  const deadline = Date.now() + INSIDER_TIME_BUDGET_MS
  const cutoff = Date.now() - CLUSTER_WINDOW_DAYS * 86400000
  const recent = filings
    .filter(f => f.form === "4" && new Date(f.filingDate).getTime() >= cutoff)
    .slice(0, maxFilings)

  const empty: InsiderActivity = {
    buyCount90d: 0, sellCount90d: 0, netSharesBought90d: 0, distinctBuyers: 0,
    clusterBuy: false, summary: "No insider transactions filed in the past 90 days.", scoreBonus: 0,
  }
  if (recent.length === 0) return empty

  const cikNum = String(Number(cik.replace(/\D/g, "")))
  const buyers = new Set<string>()
  const sellers = new Set<string>()
  let buyCount = 0, sellCount = 0, netShares = 0
  let buyValue = 0

  for (const filing of recent) {
    if (Date.now() > deadline) break // partial read beats a timeout
    try {
      const accession = filing.accessionNumber.replace(/-/g, "")
      // The primaryDocument path points at the styled rendering; the raw XML
      // sits alongside it at form4.xml.
      const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession}/form4.xml`
      const res = await throttledFetch(url, 6000)
      if (!res.ok) continue

      const txns = parseForm4(await res.text())
      for (const t of txns) {
        // Skip pre-scheduled sales: they say nothing about current conviction.
        if (t.planned && t.code === CODE_OPEN_MARKET_SELL) continue

        if (t.code === CODE_OPEN_MARKET_BUY && t.acquired) {
          buyCount++
          buyers.add(t.owner)
          netShares += t.shares
          if (t.pricePerShare) buyValue += t.shares * t.pricePerShare
        } else if (t.code === CODE_OPEN_MARKET_SELL && !t.acquired) {
          sellCount++
          sellers.add(t.owner)
          netShares -= t.shares
        }
        // Every other code (M option exercise, F tax withholding, A grant,
        // G gift) is compensation mechanics, not a market transaction.
      }
    } catch { /* one unreadable filing shouldn't void the whole read */ }
  }

  const clusterBuy = buyers.size >= CLUSTER_MIN_DISTINCT_BUYERS && buyCount > sellCount

  let summary: string
  if (clusterBuy) {
    summary = `${buyers.size} different insiders made open-market purchases in the past 90 days` +
      (buyValue > 0 ? `, roughly $${Math.round(buyValue).toLocaleString()} of stock` : "") +
      ". Independent buying by multiple insiders is the strongest form of this signal."
  } else if (buyCount > 0) {
    summary = `${buyCount} open-market purchase${buyCount === 1 ? "" : "s"} by ${buyers.size} insider${buyers.size === 1 ? "" : "s"} in the past 90 days.`
  } else if (sellCount > 0) {
    summary = `${sellCount} open-market sale${sellCount === 1 ? "" : "s"} and no purchases in the past 90 days. Selling is weak evidence on its own — insiders sell for many reasons unrelated to their view of the business.`
  } else {
    summary = "Insider filings in the past 90 days were compensation-related only (option exercises, tax withholding) — no open-market buying or selling."
  }

  // Modest by design. This is a real but small effect, and overweighting it
  // would let a couple of token purchases override the fundamentals.
  const scoreBonus = clusterBuy ? 6 : buyCount > 0 && sellCount === 0 ? 3 : 0

  return {
    buyCount90d: buyCount,
    sellCount90d: sellCount,
    netSharesBought90d: netShares,
    distinctBuyers: buyers.size,
    clusterBuy,
    summary,
    scoreBonus,
  }
}

// Records a cluster buy as a discovery event so it surfaces in the same feed
// as late filings and IPO registrations.
export async function recordClusterBuyDiscovery(params: {
  cik: string; symbol: string; companyName: string; activity: InsiderActivity
}): Promise<void> {
  if (!params.activity.clusterBuy) return
  const eventDate = new Date().toISOString().slice(0, 10)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.discoveryEvent as any).findFirst({
      where: { cik: params.cik, eventType: "insider_cluster_buy", eventDate: new Date(eventDate).toISOString() },
    })
    if (existing) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.discoveryEvent as any).create({
      data: {
        cik: params.cik,
        symbol: params.symbol,
        companyName: params.companyName,
        eventType: "insider_cluster_buy",
        eventDate: new Date(eventDate).toISOString(),
        formType: "4",
        priority: 75,
        rationale: params.activity.summary,
        processed: true, // already analyzed — this row exists to surface the event
        processedAt: new Date().toISOString(),
      },
    })
  } catch { /* best effort */ }
}
