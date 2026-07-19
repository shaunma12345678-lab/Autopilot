// Deal Financing — for one lead, every realistic way to FUND the purchase,
// with the actual numbers at today's rate: down payment, monthly payment,
// cash-to-close, DSCR qualification, and a 0-100 fit score for THIS deal.
// Complements exit-options (how you MAKE money) with how you PAY for it.
// Pure and synchronous — today's rate arrives via ctx. Never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { analyzeDeal, estimateLoanPayoff } from "@/lib/deal-analysis"

export interface FinanceOption {
  key: string
  name: string
  emoji: string
  viable: boolean
  fit: number              // 0-100: how well this funding fits THIS deal
  headline: string         // the one-line money summary
  ratePct: number | null   // est. annual rate for this product
  cashToClose: number | null
  monthly: number | null   // est. monthly P&I (or interest-only where noted)
  bestFor: string          // which exit strategy this pairs with
  numbers: string[]
  why: string
  caution?: string
}

export interface FinancingPlan {
  options: FinanceOption[]     // viable first, ranked by fit
  best: FinanceOption | null
  cheapestEntry: FinanceOption | null   // lowest viable cash-to-close
  headline: string
  todayRate: number | null
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const money = (n: number) => `$${Math.round(n).toLocaleString()}`

function pi(balance: number, ratePct: number, years = 30): number {
  const r = ratePct / 100 / 12
  const n = years * 12
  if (r <= 0) return Math.round(balance / n)
  return Math.round((balance * r) / (1 - Math.pow(1 + r, -n)))
}

// Monthly taxes + insurance estimate: ~1.1%/yr property tax + ~$1,400/yr insurance.
const monthlyTI = (value: number) => Math.round((value * 0.011 + 1400) / 12)

export function financingPlan(lead: ForeclosureLead, ctx?: { todayRate?: number | null }): FinancingPlan {
  const d = analyzeDeal(lead)
  const payoff = estimateLoanPayoff(lead)
  const todayRate = ctx?.todayRate ?? null
  const base = todayRate ?? 6.5
  const price = d.hasValue ? d.mao : (lead.estimatedValue ?? 0)
  const rehab = d.repairCost
  const rent = d.rental?.rent ?? 0
  const options: FinanceOption[] = []

  if (price > 0) {
    // ── Hard money — the flip/BRRRR acquisition engine ──────────────────────
    const hmRate = Math.round((base + 4.5) * 100) / 100
    const hmDown = Math.round(price * 0.1)
    const hmPoints = Math.round((price + rehab) * 0.02)
    const hmCash = hmDown + hmPoints + 2000
    const hmMonthly = Math.round(((price - hmDown + rehab) * (hmRate / 100)) / 12)   // interest-only
    const flipFit = d.flipProfit >= 15000
    options.push({
      key: "hardmoney", name: "Hard Money", emoji: "🏗",
      viable: flipFit || d.equityPercent >= 25,
      fit: clampPct(30 + (flipFit ? 30 : 0) + (d.equityPercent >= 25 ? 15 : 0) - (d.valueEstimated ? 10 : 0)),
      headline: `${money(hmCash)} in → funds purchase + 100% of rehab`,
      ratePct: hmRate, cashToClose: hmCash, monthly: hmMonthly,
      bestFor: "Fix & Flip / BRRRR acquisition",
      numbers: [
        `~10% down (${money(hmDown)}) + ~2 pts (${money(hmPoints)}) + closing ≈ ${money(hmCash)} cash-to-close`,
        `Interest-only ~${hmRate}% → ~${money(hmMonthly)}/mo while you rehab; rehab budget ${money(rehab)} typically 100% financed in draws`,
        `Exit by resale or refi within 6-12 months — this is bridge money, not hold money`,
      ],
      why: flipFit ? "Flip margin covers hard-money cost with room to spare" : d.equityPercent >= 25 ? "Equity cushion supports an asset-based lender" : "Margin too thin to pay bridge rates",
      caution: "Rate hurts if the project runs long — pad the timeline before you sign",
    })

    // ── DSCR loan — the property qualifies, not your W-2 ────────────────────
    if (rent > 0) {
      const dscrRate = Math.round((base + 0.65) * 100) / 100
      const dscrDown = Math.round(price * 0.2)
      const dscrLoan = price - dscrDown
      const dscrPay = pi(dscrLoan, dscrRate)
      const piti = dscrPay + monthlyTI(d.hasValue ? d.arv : price)
      const dscr = piti > 0 ? Math.round((rent / piti) * 100) / 100 : 0
      const qualifies = dscr >= 1.0
      options.push({
        key: "dscr", name: "DSCR Loan", emoji: "📊",
        viable: qualifies,
        fit: clampPct(25 + (dscr >= 1.25 ? 35 : dscr >= 1.1 ? 25 : dscr >= 1.0 ? 12 : -20) + (rent > 0 ? 10 : 0)),
        headline: qualifies ? `DSCR ${dscr} — the rent qualifies the loan` : `DSCR ${dscr} — rent doesn't cover the payment`,
        ratePct: dscrRate, cashToClose: dscrDown + Math.round(price * 0.02), monthly: dscrPay,
        bestFor: "Buy & Hold / BRRRR refi",
        numbers: [
          `20% down (${money(dscrDown)}) · ~${dscrRate}% → P&I ${money(dscrPay)}/mo`,
          `Rent ${money(rent)}/mo vs PITI ~${money(piti)}/mo → DSCR ${dscr} (lenders want ≥ 1.0-1.2)`,
          `No income docs / DTI — the property's rent is the qualification`,
        ],
        why: qualifies ? "Rental income carries the note on its own" : "At this price the rent can't carry the debt — buy deeper or raise rent first",
      })
    }

    // ── Conventional investor loan ──────────────────────────────────────────
    const convRate = Math.round((base + 0.35) * 100) / 100
    const convDown = Math.round(price * 0.2)
    const convPay = pi(price - convDown, convRate)
    options.push({
      key: "conventional", name: "Conventional", emoji: "🏛",
      viable: true,
      fit: clampPct(40 + (rent > 0 && rent - convPay - monthlyTI(price) > 0 ? 15 : 0) - (rehab > 40000 ? 15 : 0)),
      headline: `${money(convDown)} down · ${money(convPay)}/mo P&I`,
      ratePct: convRate, cashToClose: convDown + Math.round(price * 0.025), monthly: convPay,
      bestFor: "Buy & Hold in livable condition",
      numbers: [
        `20% down (${money(convDown)}) · ~${convRate}% investor rate → ${money(convPay)}/mo`,
        `Cheapest long-term money — but needs income docs, DTI room, and a property that passes appraisal`,
      ],
      why: rehab > 40000 ? "Heavy rehab usually fails conventional appraisal condition — bridge first, refi conventional after" : "Cheapest debt if you and the property both qualify",
    })

    // ── FHA house-hack — lowest entry if the buyer will live there ──────────
    const fhaDown = Math.round(price * 0.035)
    const fhaPay = pi(price - fhaDown, base)
    options.push({
      key: "fha", name: "FHA House-Hack", emoji: "🏠",
      viable: rehab <= 30000,
      fit: clampPct(20 + (price <= 350000 ? 15 : 5) + (rehab <= 15000 ? 10 : 0)),
      headline: `${money(fhaDown)} down (3.5%) — lowest cash entry`,
      ratePct: base, cashToClose: fhaDown + Math.round(price * 0.03), monthly: fhaPay,
      bestFor: "First deal / live-in then rent",
      numbers: [
        `3.5% down (${money(fhaDown)}) at ~${base}% → ${money(fhaPay)}/mo + MIP`,
        `Live in it 12 months, then keep it as a rental and repeat`,
      ],
      why: rehab <= 30000 ? "By far the least cash in — if owner-occupying is on the table" : "FHA appraisal won't pass with this much rehab (203k rehab loan is the workaround)",
      caution: "Owner-occupancy is a legal requirement, not a suggestion",
    })
  }

  // ── Seller carry / subject-to — financing FROM the seller ─────────────────
  const freeClear = (lead.totalLiens ?? 0) === 0 && (!payoff || payoff.balance === 0)
  const lockedIn = payoff != null && todayRate != null && payoff.rate <= todayRate - 1.5
  if (freeClear || d.equityPercent >= 65 || lockedIn) {
    options.push({
      key: "sellerterms", name: "Seller Terms", emoji: "🤝",
      viable: true,
      fit: clampPct(45 + (freeClear ? 20 : 0) + (lockedIn ? 20 : 0)),
      headline: lockedIn && payoff ? `Take over ~${payoff.rate}% seller debt — cheaper than any bank` : "Owner can be the bank — negotiate the terms",
      ratePct: lockedIn && payoff ? payoff.rate : null,
      cashToClose: null, monthly: lockedIn && payoff ? pi(payoff.balance, payoff.rate) : null,
      bestFor: "Low-cash entry / locked-in low rates",
      numbers: [
        ...(lockedIn && payoff ? [`Subject-to: est. balance ${money(payoff.balance)} @ ~${payoff.rate}% stays in place — below today's ${todayRate}%`] : []),
        ...(freeClear || d.equityPercent >= 65 ? [`${freeClear ? "Free & clear" : `${d.equityPercent}% equity`} — seller carry: price for time, small down, monthly terms`] : []),
        `Cash-to-close is whatever you negotiate — often the smallest entry of any option here`,
      ],
      why: "The seller's situation IS the financing — no lender approval, speed wins deals",
      caution: lockedIn ? "Due-on-sale clause risk — proper subject-to docs + servicing required" : undefined,
    })
  }

  const viable = options.filter((o) => o.viable).sort((a, b) => b.fit - a.fit)
  const rest = options.filter((o) => !o.viable).sort((a, b) => b.fit - a.fit)
  const ranked = [...viable, ...rest]
  const cheapest = viable.filter((o) => o.cashToClose != null).sort((a, b) => (a.cashToClose ?? 0) - (b.cashToClose ?? 0))[0] ?? null

  const headline = !price
    ? "No value on this lead yet — enrich it (valuation / county record) to unlock financing math."
    : viable.length === 0
      ? "Nothing pencils at this price — the deal needs a deeper discount before any lender's math works."
      : `Best fit: ${viable[0].emoji} ${viable[0].name}${cheapest ? ` · least cash in: ${cheapest.emoji} ${cheapest.name} (${money(cheapest.cashToClose ?? 0)})` : ""}`

  return { options: ranked, best: viable[0] ?? null, cheapestEntry: cheapest, headline, todayRate }
}
