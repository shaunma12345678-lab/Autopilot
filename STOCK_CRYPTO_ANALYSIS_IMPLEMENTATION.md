# Stock & Crypto Analysis — Implementation

Companion to `STOCK_CRYPTO_ANALYSIS_SPEC.md`. The spec says what the analysis
should do; this says what the code actually does, where it lives, and — most
importantly — what it deliberately refuses to do.

---

## 1. The core problem this system solves

Almost every retail investing tool reads the same surface: price, P/E, market
cap, a chart, and a summary of what management said. All of that is public,
instantly, to everyone. There is no edge in it.

The things that are *not* uniformly read are the primary documents: the full
10-K, the proxy statement, Form 4 filings, 8-K item codes, and — critically —
what changed in those documents since last year. That reading is tedious,
which is exactly why it stays underpriced. It is the one durable advantage a
software system can actually have, because the advantage comes from doing the
work at scale rather than from having information nobody else could get.

This system is built around that premise. It is not a signal generator and it
does not try to predict price.

---

## 2. Architecture in one pass

```
EDGAR (filings, XBRL)  ─┐
Exchange APIs (CB/Kraken)├─→ normalize ─→ score (two-axis) ─→ gate ─→ rank
Price providers         ─┘                      │
                                                ├─ conviction gates
                                                ├─ contradiction check
                                                └─ action signal
```

Four principles govern everything downstream:

**Two-axis scoring.** Fundamental strength and risk are scored separately and
never collapsed into one number. A company can be excellent and fragile at the
same time; a single blended score destroys exactly the information a user needs.

**Weight renormalization, never zero-fill.** A missing metric has its weight
redistributed across the metrics that are present. Treating "no data" as a zero
silently punishes disclosure gaps as if they were bad results.

**Data-confidence gating.** Below 40% core completeness the system refuses to
emit a score at all. A confident-looking number built on thin data is worse
than no number, because it invites action.

**Every score ships its reasons.** No bare numbers anywhere in the UI.

---

## 3. What is implemented

### Validated academic composites
Not invented scoring. Published, peer-reviewed, independently replicated.

| Model | File | What it catches |
|---|---|---|
| Piotroski F-Score (9 tests) | `lib/stock-scores/piotroski.ts` | Financial-strength trend |
| Altman Z-Score | `lib/stock-scores/altman.ts` | Bankruptcy distance |
| Beneish M-Score | `lib/stock-scores/beneish.ts` | Earnings-manipulation likelihood |

### Reading the primary documents
| Concern | File |
|---|---|
| XBRL normalization, tag fallback chains | `lib/edgar-normalize.ts` |
| MD&A / business narrative | `lib/edgar-narrative.ts` |
| Proxy governance — pay alignment, related-party, auditor, dual-class | `lib/governance.ts` |
| 8-K live events (4.02 restatement, 3.01 delisting, 1.03 bankruptcy, 4.01 auditor change) | `lib/live-events.ts` |
| Form 4 insider buying (code `P` only; 10b5-1 sales excluded) | `lib/form4-insider.ts` |
| **Year-over-year risk-factor diff** | `lib/risk-factor-diff.ts` |

### Forward-looking and quality signals
| Concern | File |
|---|---|
| RPO/backlog, R&D intensity, capex growth, deferred revenue, revenue acceleration | `lib/forward-signals.ts` |
| Cash conversion, DSO trend, inventory turns | `lib/accounting-quality.ts` |
| Debt maturity wall, SBC/revenue, goodwill, leases, effective tax rate | `lib/balance-sheet-risk.ts` |
| Buyback timing vs. that year's price percentile | `lib/capital-allocation.ts` |
| Multi-year streaks, margin stability, dilution | `lib/consistency.ts` |

### The two mechanisms that do the most work

**Contradiction detection** (`lib/contradiction-check.ts`). An LLM reading a
10-K is reading a document the company wrote about itself. Ask it "is this
good?" and it will mostly say yes, because the text says yes. Prompting cannot
fix that — the model is faithfully summarizing a promotional source.

What works is refusing to trust either source alone. Management's narrative is
a *claim*; XBRL is an *audited number*. Where they diverge, the divergence is
the signal:

- "strong cash generation" + cash conversion below 0.75 → contradiction
- "disciplined capital allocation" + buybacks at the 72nd price percentile → contradiction
- no mention of debt + a maturity wall inside 12 months → omission

Every check is a deterministic comparison between a parsed claim and a computed
number. Nothing here asks an AI for a verdict, so the output is reproducible
rather than a model's mood on a given day.

**Conviction gating** (`lib/conviction.ts`). Ten independent gates for stocks,
nine for crypto, all of which must pass. Averaging lets a strong number hide a
disqualifying weakness; gates do not. Thin data can never reach a tier at all.

### Year-over-year risk-factor diffing
Item 1A is largely boilerplate that carries forward unchanged, which is exactly
what makes the *changes* informative. A company does not add a risk factor
casually — its lawyers add one when the exposure has become real enough that
omitting it creates liability. New language typically precedes the problem
reaching the numbers by several quarters.

Implementation notes that matter:

- **Selection is by language, not by heading.** Heading-anchored extraction
  fails on real filings in both directions. Intel's 10-K never uses the string
  "Item 1A." in its body — the only match in the entire 575k-character document
  is the cross-reference index at the end. Pfizer's has 29 matches with its only
  "Item 1B" sitting in the table of contents. Risk prose is instead selected by
  its own modal hedging density, which is format-independent and applied
  identically to both years.
- **The AI judges materiality only.** What counts as "new" is a deterministic
  text comparison and never depends on a model's judgment.

Verified output: INTC surfaces the newly-disclosed risk that it may pause or
discontinue Intel 14A absent an external foundry customer, plus the attendant
incentive-repayment and credit-rating exposure. PFE surfaces MFN drug pricing
and Section 232 tariff exposure. KO surfaces bottler-partner reputation risk.

### Crypto
`lib/exchange-aggregator.ts` is an own-built market-data engine on Coinbase and
Kraken directly rather than an aggregator. The reasons are specific:

- **Wash-trade resistance.** Aggregators sum volume across hundreds of venues,
  many of which inflate it. A smaller honest number beats a larger fictional one
  when the question is "can I actually exit this position?"
- **Cross-venue divergence** — a signal an aggregator structurally cannot
  provide, because it hands you one blended number. Tight agreement means deep
  two-sided liquidity; wide divergence means the quoted price is not the price
  you would get.
- **Listing quality as a tier.** Two regulated listings means two independent
  diligence processes. An aggregator treats a Coinbase listing and an anonymous
  DEX pair identically.

Registry: 763 assets, 291 dual-listed.

### Time dimension
`lib/score-history.ts` snapshots scores over time and detects deterioration
against each asset's own **best** reading in the window, not its first. This is
what makes SELL possible: a company that has quietly degraded from its own peak
is invisible to any point-in-time score.

`lib/action-signal.ts` emits `buy | hold | pass | sell` against thresholds
calibrated to the observed score distribution rather than to round numbers.

---

## 4. Verification

### Data health
`lib/data-health.ts` runs 8 checks asserting each source returns *usable* data —
concept depth, bar counts, non-empty not-null filters — not merely HTTP 200.
This exists because the recurring failure mode in this system has been **silent
degradation that still reports success**: Stooq returning zero bars, a
PostgREST `neq.null` filter matching nothing, a holding company resolving to a
shell entity, a CoinGecko 429 masquerading as "not found."

### Point-in-time backtesting
`lib/backtest.ts` + `scripts/run-backtest.ts`.

Everything above is *reasoned* — each criterion has a defensible economic
argument. That is not the same as evidence.

**No look-ahead bias.** This is the entire difficulty of backtesting and the
reason most retail backtests are worthless. SEC companyfacts stamps every
datapoint with the date it was `filed`, so `factsAsOf()` reconstructs exactly
what was knowable on a given historical day by discarding anything filed later.
Price metrics are computed only from bars up to the same date.

**Benchmark-relative.** Raw forward returns mostly measure whether the market
went up. Every return is excess of SPY over the identical window.

**Pre-registered.** This runs the criteria as they already exist. Testing forty
variants and shipping the ten that backtest best would overfit to noise and make
the resulting accuracy figure fiction — the single most common way backtests
lie. If results are weak, they get reported as weak.

#### Results — 90-day horizon

1,293 observations across 37 companies, as-of dates 2017-02-15 → 2026-02-15.

| Tier | n | mean excess | median excess | beat SPY |
|---|---|---|---|---|
| strong | 1041 | +0.91% | +0.05% | 50.3% |
| mixed | 206 | +0.86% | −1.43% | 47.6% |
| weak | 46 | +3.42% | −0.74% | 50.0% |

| Signal | n | mean excess | median excess | beat SPY |
|---|---|---|---|---|
| buy | 762 | +0.76% | +0.10% | 50.7% |
| hold | 341 | +1.11% | −1.14% | 47.8% |
| pass | 190 | +1.72% | +0.30% | 50.5% |

**Top-quartile minus bottom-quartile mean excess: +0.06%.**

**Reading this honestly: the score does not rank 90-day forward returns.** The
quartile spread is indistinguishable from zero, every hit rate is a coin flip,
and the "weak" bucket has the *highest* mean excess — the opposite of the
intended direction. Means and medians diverge throughout, meaning the means are
driven by a few outliers; the medians, all near zero, are the trustworthy
figure.

This result was pre-registered and is reported unchanged. **No criterion was
adjusted in response to it.** Tuning the criteria until this table looked good
would produce a number that describes this sample and nothing else.

What it does not establish: that the analysis is worthless. It establishes that
one specific claim — that the quality tier predicts near-term relative return —
is unsupported on this sample. Three sample properties matter. All 37 companies
are heavily-analyzed mega-caps, which is precisely where reading primary
documents has the least remaining edge. All 37 still exist, which biases results
optimistically. And the horizon is short, where price is dominated by flows and
sentiment rather than fundamentals.

#### Results — 365-day horizon

Horizon was the one pre-specified secondary variable, on the documented grounds
that fundamental signals act slowly. Both horizons tested are reported; neither
was chosen after seeing the other.

1,185 observations across the same 37 companies.

| Tier | n | mean excess | median excess | beat SPY |
|---|---|---|---|---|
| strong | 954 | +3.67% | −0.81% | 49.0% |
| mixed | 190 | +4.21% | −4.22% | 41.1% |
| weak | 41 | +26.20% | +16.05% | 61.0% |

| Signal | n | mean excess | median excess | beat SPY |
|---|---|---|---|---|
| buy | 708 | +2.66% | −0.52% | 49.6% |
| hold | 304 | +7.97% | −2.09% | 45.7% |
| pass | 173 | +6.22% | −1.88% | 46.2% |

**Top-quartile minus bottom-quartile mean excess: −0.60%.**

The longer horizon does not rescue the result — it is slightly worse, and the
spread is now *negative*. The "weak" bucket outperforms on every measure
including the median, though n=41 is small enough that a handful of names drive
it.

#### What both backtests actually diagnose

The inversion at the low end is the recognizable signature of value and mean
reversion: beaten-down companies rebound. Read together with the flat quartile
spread, the two runs point at one structural gap rather than at a broken
criterion.

**This system measures how good a business is. It does not measure whether that
business is mispriced.** Those are different questions, and only the second one
produces return. Quality is public, well-analyzed, and already reflected in the
price — which is exactly why a quality ranking of mega-caps should be expected
to have no forward-return edge. The backtest is consistent with the finance
literature, not at odds with it.

The scoring computes P/E, P/FCF and EV/EBITDA, but the action signal is driven
by quality, not by quality *relative to price paid*. A quality-versus-valuation
spread is therefore the natural next hypothesis — but it must be pre-registered
and tested on a broader universe, including small caps and delisted companies,
before it earns any claim in the product.

**No criterion was changed in response to either backtest.** Tuning until these
tables looked good is the failure mode the pre-registration exists to prevent.

**The product must not claim predictive accuracy.** What it can claim is what it
verifiably does: read primary disclosure at scale, surface contradictions
between narrative and audited numbers, and flag newly-disclosed risk.

### Forward track record
`lib/underwrite-tracker.ts` logs every assessment when made and grades it
against real price history 90 days later. This is pre-registered by
construction, since calls are recorded before outcomes are known. It records a
descriptive strength tier, never a recommendation (see §5).

---

## 5. Compliance posture

The system records **descriptive strength tiers** and impersonal analysis. It
does not provide personalized investment advice. The distinction is not
cosmetic: providing personalized or recommendation-shaped advice about
securities for compensation is what triggers investment-adviser regulation.
Everything here applies uniformly to every tracked asset and describes
fundamentals rather than instructing anyone to transact. See
`components/dashboard/MarketsDisclaimer.tsx`.

---

## 6. Deliberately not built, and why

Each of these would look impressive in a feature list and mislead in practice.

| Not built | Why |
|---|---|
| Projected price line | Reads as a price target. We do not forecast price. |
| RSI / MACD in scoring | Arbitraged away; adds the appearance of rigor, not rigor. |
| Crypto treasury/runway data | DefiLlama's endpoint is now paid (HTTP 402). Fabricating it is worse than omitting it. |
| SC 13D activist stakes | EDGAR full-text search returns zero results for these; the data is not reachable. |
| 13F institutional ownership | 45-day reporting lag makes it stale on arrival, and it needs bulk indexing. |
| Earnings call transcripts | Paywalled at every source with adequate coverage. |
| Crypto exchange flows | No free source of adequate quality. |
| Real-estate track record | Needs a genuine closed-deal outcome signal the app does not capture. Backtesting against nothing produces a fabricated number. |

---

## 7. Honest limitations

1. **Backtest breadth is bounded by price history.** The free providers serve
   roughly ten years, and free-tier depth varies; TwelveData's tier returns
   about 13 months, which is a single market regime. Yahoo throttles
   aggressively under burst.
2. **Cross-sectional correlation.** Observations sharing an as-of date are not
   independent — sector-wide moves affect many at once. Excess-vs-SPY controls
   for market direction but not for sector concentration.
3. **Survivorship bias.** The tested universe is companies that exist today.
   Companies that delisted or went bankrupt are absent, which biases results
   optimistically. This is a real limitation and not fully solved.
4. **Backtest coverage gaps.** The runner calls `resolveCik` directly rather
   than the `findOperatingCik` holdco fallback the live pipeline uses, so
   holdco-structured filers (XOM) produce zero observations. Financials
   (JPM, BAC) also drop out: Altman excludes SIC 6000-6799 and banks lack the
   industrial metrics needed to clear the medium-confidence bar. Both are
   conservative exclusions rather than bad data, but they skew the sample.
5. **The sample is 37 mega-caps.** This is the least favorable universe for the
   system's core premise. If reading primary documents at scale has an edge, it
   is largest among under-covered small and mid caps, which are absent here.
6. **Materiality judgments use an LLM.** The *diff* is deterministic, but which
   new risks count as material is a model judgment and will vary at the margin.
7. **Coverage is US-listed filers.** Foreign private issuers filing 20-F are not
   normalized to the same concept set.
8. **This is not a recommendation engine and does not predict price.** It reads
   disclosure at scale and reports what it finds.
