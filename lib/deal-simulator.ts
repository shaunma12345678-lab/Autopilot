// Deal Simulator — runs thousands of Monte-Carlo negotiations against a modeled
// seller (their reservation price varies with motivation, equity, and auction
// urgency) to find the OPENING OFFER that maximizes your expected spread, plus
// the odds of a deal and the likely settle range. Pure & synchronous.

export interface SimInput {
  arv:          number
  mao:          number
  motivation:   number        // 0-100
  equityPct:    number        // 0-100
  daysToAuction?: number | null
}

export interface SimResult {
  runs:           number
  recommendedOpen: number     // opening offer to lead with
  dealProb:       number      // % of simulations that reached a deal
  expectedBuy:    number      // average accepted purchase price
  p10: number; p50: number; p90: number  // accepted-price distribution
  advice:         string
}

// Standard normal via Box–Muller.
function randn(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function simulateNegotiation(inp: SimInput, runs = 3000): SimResult | null {
  const { arv, mao, motivation, equityPct } = inp
  if (arv <= 0 || mao <= 0) return null

  // Seller's reservation price = ARV minus a discount that grows with how
  // motivated / pressured / equity-rich they are.
  let discount = 0.05 + (Math.max(0, Math.min(100, motivation)) / 100) * 0.22
  if (inp.daysToAuction != null && inp.daysToAuction >= 0 && inp.daysToAuction <= 30) discount += 0.05
  if (equityPct >= 40) discount += 0.03
  discount = Math.min(discount, 0.4)
  const resMean = arv * (1 - discount)
  const resSd = arv * 0.06

  // Try a grid of opening offers up to the MAO; keep the best expected spread.
  let best: { open: number; ep: number; prob: number; buys: number[] } | null = null
  for (let f = 0.65; f <= 1.0001; f += 0.05) {
    const open = Math.round(mao * f)
    let spreadSum = 0, deals = 0
    const buys: number[] = []
    for (let i = 0; i < runs; i++) {
      const reservation = Math.max(arv * 0.4, Math.min(arv, resMean + randn() * resSd))
      let buy: number | null = null
      if (open >= reservation) buy = open                                   // they take your offer
      else if (reservation <= mao) {
        if (open < reservation * 0.65 && Math.random() < 0.35) buy = null    // insult → walk away
        else buy = Math.min(mao, Math.round(open + 0.6 * (reservation - open))) // meet in the middle
      }
      if (buy != null) { deals++; buys.push(buy); spreadSum += arv - buy }
    }
    const ep = spreadSum / runs
    if (!best || ep > best.ep) best = { open, ep, prob: deals / runs, buys }
  }
  if (!best) return null

  const sorted = best.buys.sort((a, b) => a - b)
  const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)
  const expectedBuy = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0
  const prob = Math.round(best.prob * 100)
  const advice = prob >= 60 ? "Strong odds — open here and be ready to close fast."
    : prob >= 35 ? "Workable — open here and negotiate patiently."
    : "Long shot at a wholesale price — only pencils with a very motivated seller."

  return { runs, recommendedOpen: best.open, dealProb: prob, expectedBuy, p10: q(0.1), p50: q(0.5), p90: q(0.9), advice }
}
