// Free, no-key price quote for the stocks vertical. SEC EDGAR has zero price
// data (it's a filings archive, not a market feed), so valuation and
// dividend-yield ratios need this supplementary source.
//
// Delegates to lib/price-history.ts so there is ONE place that knows how to
// talk to a price provider. That module fetches the live quote and the full
// daily series in a single request, so callers that need both (the analysis
// pipeline) should call fetchHistory directly rather than paying for two round
// trips. This wrapper exists for callers that only want a spot price — notably
// the underwrite backtest.
//
// Note: the original Stooq CSV endpoint no longer works server-side (it now
// serves a JavaScript proof-of-work challenge). See price-history.ts.
import { fetchHistory } from "./price-history"

export interface StockQuote {
  symbol: string
  price: number
  date: string
}

export async function fetchStockPrice(symbol: string): Promise<StockQuote | null> {
  const { bars, latestPrice } = await fetchHistory(symbol)
  if (latestPrice === null || !isFinite(latestPrice) || latestPrice <= 0) return null
  return {
    symbol: symbol.toUpperCase(),
    price: latestPrice,
    date: bars.length > 0 ? bars[bars.length - 1].date : new Date().toISOString().slice(0, 10),
  }
}
