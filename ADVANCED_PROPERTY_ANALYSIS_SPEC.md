# Autopilot — Advanced Property Analysis & Lead Engine Spec

**For:** Claude Code implementation — this is an *improve, don't replace* spec. Build on top of the existing lead engine and `LEAD_ENGINE_SPEC.md` roadmap, don't restart it.
**Goal:** Add the criteria professional real estate investors/wholesalers actually use to judge a property's raw potential — so a lead isn't just "this address is in foreclosure," it's "here's exactly why this is a deal, what it's worth, and what to offer."
**Date:** July 17, 2026

---

## 0. Instructions for Claude Code

- Review the existing lead engine implementation and `LEAD_ENGINE_SPEC.md` before starting — this spec extends that work, particularly the weak 12-of-13 lead types that currently rely on web search instead of structured sources.
- Do not remove or weaken the foreclosure recall pipeline — it's the one part of the system already working well. Everything here should be additive.
- Where a new data source or criterion can be added to an *existing* lead type rather than creating a new pipeline, prefer that — avoid duplicating logic across lead types.
- Flag anywhere a new data source requires a paid API or has rate limits so cost tradeoffs can be reviewed before wide rollout.

---

## 1. Why This Matters

Right now the product tells a wholesaler *that* a property might be distressed. It doesn't yet tell them *how good* the deal actually is or *why* — which is the actual skill a professional wholesaler/investor applies manually today. Closing that gap is what turns Autopilot from "a lead list" into "an underwriter that happens to also find the leads." That's the 100x-easier version: the customer opens a lead and already has the deal math done for them.

---

## 2. Current State (per prior audit)

- Foreclosure lead recall: strong, structured source.
- Other 12 lead types: currently sourced via general web search rather than dedicated structured feeds — inconsistent recall and no deep criteria attached.
- No unified "deal score" or repair/value estimate attached to a lead yet.
- Property Distress Graph and continuous county watchers are on the roadmap but not yet built (per innovation brief).

This spec assumes the Property Distress Graph becomes the backbone that holds all of the criteria below per property, rather than each lead type carrying its own disconnected data.

---

## 3. Criteria to Add — Organized the Way a Pro Underwrites a Deal

### 3.1 Deal Math (the core numbers every wholesaler needs)
- **ARV (After Repair Value)** — automated comparable sales analysis (comps): pull recent sales of similar properties (same beds/baths, similar sqft ±15%, within a reasonable radius and recency window), compute an ARV estimate with a confidence range, not a single number.
- **Repair/rehab cost estimate** — condition-based estimate (see 3.3 for condition signals) mapped to a $/sqft rehab cost model, tiered by scope (cosmetic / moderate / full gut).
- **MAO (Maximum Allowable Offer)** — computed automatically using the standard wholesaler formula (ARV × target percentage − repair costs − assignment fee/margin), with the target percentage configurable per user since investors vary (e.g., 70% rule as a default, adjustable).
- **Spread/margin** — MAO vs. estimated current owner asking or estimated payoff amount, surfaced as an at-a-glance dollar figure.
- **Cash-on-cash / cap rate estimate** — for buy-and-hold buyers in the buyer network, not just flippers — estimate rent via rental comps and compute expected yield.

### 3.2 Motivation Signal Stacking (this is the differentiator)
Professionals don't look at one distress signal — they look for *multiple stacked signals*, since a property with three distress indicators converts far better than one with just one. Build a **Motivation Score** that aggregates:
- Pre-foreclosure/auction proximity (already covered — keep and weight by days-to-auction)
- Tax delinquency (flag + dollar amount owed + years delinquent)
- Absentee/out-of-state owner status
- Vacancy indicators (utility disconnect signals, USPS vacancy data where available, code enforcement vacant-property registries)
- Probate/inherited property status
- Divorce filings tied to the property address
- Code violations or condemnation notices
- Length of ownership (very long tenure often correlates with high equity and motivation to simplify)
- Multiple liens (mechanic's, judgment, HOA) — more liens generally means more urgency to resolve
- Bankruptcy filings tied to the owner

Each signal contributes to a single composite Motivation Score per property so the customer can sort/filter by "most likely to say yes," not just by lead type.

### 3.3 Physical Condition & Raw Potential
This is the "see the raw potential" ask specifically:
- **Year built + permit history** — no recent permits on an older property is a signal of deferred maintenance (and thus more upside for a rehabber).
- **Satellite/street-view condition scoring** — where imagery APIs are available, a coarse automated condition flag (roof condition, overgrown lot, visible disrepair) adds real signal without requiring a site visit.
- **Lot size vs. built square footage** — surfaces ADU/expansion/subdivision potential, which is upside a lead list alone never shows.
- **Zoning and highest-and-best-use flags** — is the current use under-utilizing what's actually allowed on the lot (e.g., single-family on a lot zoned for multi-family)?

### 3.4 Location & Market Context
- **Neighborhood appreciation trend** (recent price trend in the immediate area) — so a good deal math number is contextualized against a rising vs. declining market.
- **Rent growth trend** for buy-and-hold scoring.
- **Flood zone / environmental hazard flags** — a deal-killer or major cost factor that pros always check before committing.
- **School district / walkability context** where relevant to the buyer type (owner-occupant resale potential vs. pure rental).

### 3.5 Title & Legal
- **Equity position estimate** — estimated current mortgage balance vs. estimated value, to flag high-equity vs. underwater properties (very different deal strategies).
- **Number of mortgages/liens on title** — more encumbrances = more complex closing = factor into deal viability, not just motivation.
- **Clouded title flags** where public record data suggests a title issue (e.g., unresolved probate, missing heirs) — worth surfacing as a caution flag on the deal, not just a motivation signal.

---

## 4. Unified Output: The "Deal Card"

Every lead should render as a single card/view containing:
1. Address + lead type(s) that surfaced it
2. Motivation Score (composite, with the contributing signals listed so the user can see *why*)
3. ARV estimate with confidence range and comp count
4. Repair estimate (tiered)
5. MAO and spread, using the user's configured target percentage
6. Raw potential flags (lot upside, zoning upside, condition flags)
7. Caution flags (title complexity, flood zone, declining market)
8. One-line plain-language summary — e.g., "High-equity, vacant, 3 distress signals stacked, ARV $410K, est. repairs $45K, MAO $232K." This is the "customer's life 100x easier" moment — they shouldn't have to assemble this themselves from six tabs.

---

## 5. Data Sources to Evaluate

- **Comps/valuation:** county assessor data (often free/structured), plus a paid AVM (automated valuation model) API if assessor data alone isn't reliable enough (e.g., ATTOM, CoreLogic, or a similar provider) — evaluate cost vs. the free/structured-only approach before committing.
- **Tax delinquency:** county treasurer records, typically structured and often free per-county.
- **Liens/judgments/bankruptcy/divorce/probate:** county recorder and court records — availability and structure vary heavily by county, so this should feed the existing county-watcher roadmap rather than being built as a one-off.
- **Vacancy signals:** USPS vacancy data (where licensable) or code-enforcement vacant-property registries.
- **Zoning/permits:** municipal GIS/permit portals, varies by jurisdiction.
- **Imagery/condition:** satellite/street-view imagery API for coarse condition scoring.
- **Flood zone:** FEMA flood map data (public, structured).

Recommend building a per-county source-adapter pattern (consistent with the existing `LEAD_ENGINE_SPEC.md` roadmap) so adding a new county means adding adapters, not rebuilding logic.

---

## 6. Website / Lead-Gen Tie-In

Since the ask also touches "get more leads" for the business itself, not just the product's own lead engine:
- The Deal Card concept above is a strong marketing asset — a "see what our AI sees" interactive example on a `/for-wholesalers` landing page (from the earlier website plan) showing a real (anonymized) Deal Card would be a far stronger conversion tool than the current generic homepage.
- Publish the Motivation Score methodology (at a high level, not the full scoring weights) as content — "the 10 signals professional wholesalers stack to find motivated sellers" is exactly the kind of content that ranks for buyer-intent search terms and doubles as product education.
- Consider a free single-address lookup tool on the marketing site (rate-limited) as a lead-gen mechanism — visitor enters an address, gets a taste of the Deal Card, has to sign up to unlock the full analysis. This is a strong top-of-funnel hook specific to this product in a way generic AI-ops messaging isn't.

---

## 7. Build Phases

| Phase | Scope |
|---|---|
| 1 | Property Distress Graph as the unified data backbone (if not already in progress) |
| 2 | Deal math: ARV via comps, repair estimate, MAO, spread |
| 3 | Motivation Score aggregation across existing + new signal sources |
| 4 | Physical/raw-potential signals (permits, lot/zoning, condition scoring) |
| 5 | Legal/title caution flags |
| 6 | Deal Card unified UI |
| 7 | Marketing tie-in: public single-address lookup tool + methodology content |

---

## 8. Open Questions for Claude Code

- Which counties currently have the most usable structured data (assessor/treasurer/recorder), and should the county-watcher rollout prioritize those first regardless of where current customers are concentrated?
- Should ARV/comps rely solely on free/structured county data initially, or is a paid AVM API justified from Phase 2 given how central deal math is to the product's value?
- What's the right default MAO percentage, and should it vary automatically by property type/market instead of being a single global default?
- How should confidence be communicated when comp count is low (e.g., rural counties with sparse recent sales)? Don't present a low-confidence ARV as if it were precise.
