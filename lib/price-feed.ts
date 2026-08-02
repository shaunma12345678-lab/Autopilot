// Free, no-key price feed for the stocks vertical. SEC EDGAR has zero price
// data (it's a filings archive, not a market feed), so valuation/dividend-yield
// ratios need this supplementary source. Stooq's CSV "last quote" endpoint is
// free and unauthenticated — no SLA, so every call degrades to null on failure
// rather than throwing.
export interface StockQuote {
  symbol: string
  price: number
  date: string
}

export async function fetchStockPrice(symbol: string): Promise<StockQuote | null> {
  try {
    const stooqSymbol = `${symbol.toLowerCase()}.us`
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const text = await res.text()
    const lines = text.trim().split("\n")
    if (lines.length < 2) return null

    const header = lines[0].split(",")
    const row = lines[1].split(",")
    const closeIdx = header.indexOf("Close")
    const dateIdx = header.indexOf("Date")
    if (closeIdx === -1 || dateIdx === -1) return null

    const closeStr = row[closeIdx]
    if (!closeStr || closeStr === "N/D") return null

    const price = Number(closeStr)
    if (!isFinite(price) || price <= 0) return null

    return { symbol: symbol.toUpperCase(), price, date: row[dateIdx] }
  } catch {
    return null
  }
}
