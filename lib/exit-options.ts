// Exit Options — the per-property PLAYBOOK. For one lead, evaluate EVERY way
// to make money on it — wholesale, fix & flip, BRRRR, buy & hold, subject-to,
// seller finance, retail/novation — each with the actual numbers and a
// 0-100 "chance this makes money" score, ranked. Plus the REFINANCE analysis:
// the seller's estimated rate position vs today's real rate (locked-in sellers
// = subject-to gold; high-rate sellers = refi-relief talking point), cash-out
// headroom, payment delta, break-even. Pure and synchronous — today's rate
// arrives via ctx (fetched once from /api/market/rate). Never throws.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { analyzeDeal, estimateLoanPayoff, type DealAnalysis } from "@/lib/deal-analysis"
import { predictLikelyToSell } from "@/lib/sell-predictor"
import { fuseSignals } from "@/lib/signal-fusion"

export interface ExitOption {
  key: string
  name: string
  emoji: string
  viable: boolean
  moneyChance: number      // 0-100: chance this play actually makes money here
  headline: string         // the money line — "$22k assignment" / "+$310/mo"
  numbers: string[]        // the math, line by line
  why: string              // why it's (not) on the table for THIS property
}

export interface RefiAnalysis {
  available: boolean
  sellerRate: number | null      // est. rate on the seller's existing loan
  todayRate: number | null
  direction: "locked-in" | "refi-relief" | "neutral" | "unknown"
  estBalance: number | null
  currentPayment: number | null  // est. P&I on the existing loan
  refiPayment: number | null     // P&I if re-financed today (same balance, 30yr)
  monthlyDelta: number | null    // + = seller saves by refinancing
  cashOutAvailable: number | null // 75% LTV minus balance
  breakEvenMonths: number | null
  angle: string                  // what this means for the INVESTOR conversation
  buyerNote: string              // the BRRRR/holder refi line for the buyer side
}

export interface ExitPlaybook {
  options: ExitOption[]          // viable first, ranked by moneyChance
  best: ExitOption | null
  refi: RefiAnalysis
  deal: DealAnalysis
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const money = (n: number) => `$${Math.round(n).toLocaleString()}`

function pi(balance: number, ratePct: number, years = 30): number {
  const r = ratePct / 100 / 12
  const n = years * 12
  if (r <= 0) return Math.round(balance / n)
  return Math.round((balance * r) / (1 - Math.pow(1 + r, -n)))
}

export function exitOptions(lead: ForeclosureLead, ctx?: { todayRate?: number | null }): ExitPlaybook {
  const d = analyzeDeal(lead)
  const sell = predictLikelyToSell(lead)
  const fusion = fuseSignals(lead)
  const payoff = estimateLoanPayoff(lead)
  const todayRate = ctx?.todayRate ?? null
  const motivated = sell.score >= 45 || fusion.count >= 2
  const estPenalty = d.valueEstimated ? 12 : 0     // modeled values = less certainty
  const options: ExitOption[] = []

  // ── 1. Wholesale — contract at MAO, assign the spread ──────────────────────
  if (d.hasValue) {
    const spread = d.wholesaleSpread
    const chance = clampPct(30 + (spread >= 15000 ? 30 : spread >= 8000 ? 18 : spread > 3000 ? 6 : -20) + (motivated ? 18 : 0) + (d.equityPercent >= 25 ? 10 : -8) - estPenalty)
    options.push({
      key: "wholesale", name: "Wholesale", emoji: "🤝",
      viable: spread >= 5000 && d.equityPercent >= 10,
      moneyChance: chance,
      headline: `${money(spread)} assignment spread`,
      numbers: [
        `Contract at MAO ${money(d.mao)}, assign near ${money(d.mao + spread)}`,
        `Fastest exit — no rehab, no holding, capital at risk ≈ EMD only`,
      ],
      why: spread >= 5000 ? `${d.equityPercent}% equity leaves room to contract below investor value${motivated ? "; seller shows real motivation" : ""}` : "Spread too thin to interest cash buyers after your fee",
    })

    // ── 2. Fix & Flip ─────────────────────────────────────────────────────────
    const marginPct = d.arv > 0 ? (d.flipProfit / d.arv) * 100 : 0
    options.push({
      key: "flip", name: "Fix & Flip", emoji: "🔨",
      viable: d.flipProfit >= 15000,
      moneyChance: clampPct(28 + Math.min(marginPct * 2.2, 35) + (d.profitRange ? (d.profitRange.low > 0 ? 12 : -10) : 0) - estPenalty),
      headline: `${money(d.flipProfit)} flip profit${d.profitRange ? ` (${money(d.profitRange.low)}–${money(d.profitRange.high)})` : ""}`,
      numbers: [
        `Buy ≤ ${money(d.mao)} · rehab ${money(d.repairCost)} · resell ~${money(d.arv)}`,
        `ROI ~${d.roiPct ?? 0}% on cash in`,
        ...(d.profitRange && d.profitRange.low <= 0 ? ["⚠ Downside case loses money — negotiate deeper or pass"] : []),
      ],
      why: d.flipProfit >= 15000 ? `${Math.round(marginPct)}% margin on ARV clears the risk bar` : "Margin under $15k doesn't pay for flip risk",
    })

    // ── 3. BRRRR — rehab, rent, refinance at TODAY's rate ────────────────────
    const rent = d.rental?.rent ?? 0
    if (rent > 0) {
      const allIn = d.mao + d.repairCost
      const refiLoan = Math.round(d.arv * 0.75)
      const capitalLeft = Math.max(0, allIn - refiLoan)
      const rate = todayRate ?? 6.5
      const refiPay = pi(refiLoan, rate)
      const noiMo = Math.round(rent * 0.6)
      const cfAfterRefi = noiMo - refiPay
      const infinite = capitalLeft <= 0
      options.push({
        key: "brrrr", name: "BRRRR", emoji: "🔁",
        viable: cfAfterRefi > -100 && d.equityPercent >= 15,
        moneyChance: clampPct(30 + (infinite ? 30 : capitalLeft < allIn * 0.15 ? 18 : 5) + (cfAfterRefi >= 100 ? 18 : cfAfterRefi >= 0 ? 8 : -15) - estPenalty),
        headline: infinite ? "♾ Infinite return — all capital back at refi" : `${money(capitalLeft)} left in after refi`,
        numbers: [
          `All-in ${money(allIn)} → refi 75% of ARV = ${money(refiLoan)}${todayRate ? ` @ today's ${rate}%` : ` @ ~${rate}%`}`,
          `Rent ${money(rent)}/mo → ~${cfAfterRefi >= 0 ? "+" : ""}${money(cfAfterRefi)}/mo after refi payment`,
        ],
        why: infinite ? "Refi returns your whole basis — the deal pays for the next one" : cfAfterRefi >= 0 ? "Cash-flows even after pulling most capital out" : "Negative after refi — needs a better buy price",
      })

      // ── 4. Buy & Hold rental ────────────────────────────────────────────────
      const holdLoan = Math.round(d.mao * 0.75)
      const holdPay = pi(holdLoan, todayRate ?? 6.5)
      const holdCf = noiMo - holdPay
      options.push({
        key: "hold", name: "Buy & Hold", emoji: "🏘",
        viable: holdCf > -50,
        moneyChance: clampPct(35 + (holdCf >= 200 ? 25 : holdCf >= 50 ? 14 : holdCf >= 0 ? 6 : -18) + ((d.rental?.capRate ?? 0) >= 7 ? 10 : 0) - estPenalty),
        headline: `${holdCf >= 0 ? "+" : ""}${money(holdCf)}/mo at today's rate`,
        numbers: [
          `Buy ${money(d.mao)} (75% LTV${todayRate ? ` @ ${todayRate}%` : ""}) · rent ${money(rent)}/mo`,
          `Cap rate ${d.rental?.capRate ?? "—"}% · DSCR ${d.rental?.dscr ?? "—"}`,
        ],
        why: holdCf >= 0 ? "Pays you monthly from day one at your buy price" : "Underwater monthly at today's rates — only works with more discount",
      })
    }
  }

  // ── 5. Subject-to / wrap — take over a locked-in cheap loan ────────────────
  if (payoff && payoff.balance > 0) {
    const lockedIn = todayRate != null && payoff.rate <= todayRate - 1.5
    const existingPay = pi(payoff.balance, payoff.rate, 30)
    const rentForSubto = d.rental?.rent ?? 0
    const subtoCf = rentForSubto > 0 ? Math.round(rentForSubto * 0.6) - existingPay : null
    options.push({
      key: "subto", name: "Subject-to", emoji: "📜",
      viable: lockedIn && d.equityPercent < 35,
      moneyChance: clampPct((lockedIn ? 45 : 15) + (d.equityPercent < 20 ? 15 : 0) + (subtoCf != null && subtoCf > 0 ? 15 : 0) + (motivated ? 10 : 0)),
      headline: lockedIn ? `Take over the seller's ~${payoff.rate}% loan` : "Seller's rate isn't cheap enough",
      numbers: [
        `Est. balance ${money(payoff.balance)} @ ~${payoff.rate}% → payment ~${money(existingPay)}/mo`,
        ...(subtoCf != null ? [`Rent ${money(rentForSubto)}/mo → ~${subtoCf >= 0 ? "+" : ""}${money(subtoCf)}/mo keeping their loan`] : []),
        "⚠ Due-on-sale clause risk — use proper subject-to docs + servicing",
      ],
      why: lockedIn ? "Low equity + below-market debt: buying the LOAN is worth more than buying the house" : "Existing financing carries no advantage over new money",
    })
  }

  // ── 6. Seller finance — high equity / free-and-clear owners ────────────────
  const freeClear = (lead.totalLiens ?? 0) === 0 && (!payoff || payoff.balance === 0)
  const highEq = d.equityPercent >= 65 || freeClear
  if (d.hasValue) {
    options.push({
      key: "sellerfi", name: "Seller Finance", emoji: "🏦",
      viable: highEq,
      moneyChance: clampPct((highEq ? 40 : 10) + (motivated ? 15 : 0) + ((d.rental?.rent ?? 0) > 0 ? 10 : 0)),
      headline: highEq ? "Owner can carry — buy on terms" : "Not enough equity to carry",
      numbers: [
        `Offer near ${money(Math.round(d.arv * 0.85))} on terms vs ${money(d.mao)} cash — price for time`,
        "Low/no bank financing → speed + monthly spread if held",
      ],
      why: highEq ? `${freeClear ? "Free & clear" : `${d.equityPercent}% equity`} — the owner IS the bank; motivated owners take terms for full price` : "Owner's own loan blocks a meaningful carry",
    })
  }

  const viable = options.filter((o) => o.viable).sort((a, b) => b.moneyChance - a.moneyChance)
  const rest = options.filter((o) => !o.viable).sort((a, b) => b.moneyChance - a.moneyChance)
  const ranked = [...viable, ...rest]

  // ── The refinance section ────────────────────────────────────────────────────
  let refi: RefiAnalysis
  if (payoff && payoff.balance > 0 && todayRate != null) {
    const currentPayment = pi(payoff.balance, payoff.rate)
    const refiPayment = pi(payoff.balance, todayRate)
    const monthlyDelta = currentPayment - refiPayment
    const value = d.hasValue ? d.arv : null
    const cashOut = value != null ? Math.max(0, Math.round(value * 0.75 - payoff.balance)) : null
    const closingCosts = Math.round(payoff.balance * 0.02) + 1500
    const breakEven = monthlyDelta > 25 ? Math.ceil(closingCosts / monthlyDelta) : null
    const direction: RefiAnalysis["direction"] =
      payoff.rate <= todayRate - 1 ? "locked-in" : payoff.rate >= todayRate + 0.75 ? "refi-relief" : "neutral"
    refi = {
      available: true,
      sellerRate: payoff.rate, todayRate,
      direction,
      estBalance: payoff.balance,
      currentPayment, refiPayment, monthlyDelta,
      cashOutAvailable: cashOut,
      breakEvenMonths: breakEven,
      angle:
        direction === "locked-in"
          ? `Seller sits on ~${payoff.rate}% money (today: ${todayRate}%). Refinancing would RAISE their payment ~${money(Math.abs(monthlyDelta))}/mo — they're locked in. That's your subject-to angle: their loan is the asset.`
          : direction === "refi-relief"
            ? `Seller pays ~${payoff.rate}% (today: ${todayRate}%). A refi could save them ~${money(monthlyDelta)}/mo${breakEven ? ` (breaks even in ~${breakEven} months)` : ""}${cashOut ? ` and free up to ${money(cashOut)} cash-out at 75% LTV` : ""}. Present it honestly — if a refi truly solves their problem, you build trust; if they can't qualify (credit/income/arrears), your cash offer is the real relief.`
            : `Seller's rate is near today's — refinancing changes little. The conversation is about equity and timeline, not the loan.`,
      buyerNote:
        cashOut != null && cashOut > 0
          ? `For a buyer/holder: ~${money(cashOut)} of trapped equity is refinance-able at 75% LTV — fuel for the next purchase.`
          : "For a buyer/holder: little cash-out headroom at 75% LTV — this is a cash-flow hold, not an equity ATM.",
    }
  } else {
    refi = {
      available: false,
      sellerRate: payoff?.rate ?? null, todayRate,
      direction: "unknown",
      estBalance: payoff?.balance ?? null,
      currentPayment: null, refiPayment: null, monthlyDelta: null,
      cashOutAvailable: null, breakEvenMonths: null,
      angle: payoff == null ? "No purchase record → can't model the seller's loan. Enrich the lead (last sale) to unlock the refinance analysis." : "Needs today's mortgage rate to compare — retrying on next load.",
      buyerNote: "",
    }
  }

  return { options: ranked, best: viable[0] ?? null, refi, deal: d }
}
