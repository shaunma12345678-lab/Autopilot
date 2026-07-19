# Autopilot — Deep Risk Analysis & Data Integrity Spec

**For:** Claude Code implementation — this is an *improve, don't replace* spec. It layers directly on top of `LEAD_ENGINE_SPEC.md` and `ADVANCED_PROPERTY_ANALYSIS_SPEC.md`. Do not rebuild the Deal Card, Motivation Score, or Property Distress Graph — extend them.
**Goal:** Take the Deal Card from "here's the opportunity" to "here's the opportunity *and* everything that could go wrong with it, backed by verified data, not a guess." This is the layer that makes Autopilot trustworthy enough for a customer to act on without independently re-checking everything themselves.
**Date:** July 17, 2026

---

## 0. Instructions for Claude Code

- This spec assumes Phases 1–4 of `ADVANCED_PROPERTY_ANALYSIS_SPEC.md` (Property Distress Graph, deal math, Motivation Score, Deal Card) are in place or in progress. Extend those data structures — add a `risk` and `data_confidence` layer to the existing Deal Card schema rather than creating a parallel one.
- Where a risk signal overlaps with something already captured (e.g., liens are already part of Motivation Score) — don't duplicate the fetch, just reuse the underlying data and add the risk-framing on top.
- Every new data point added here must carry a source and a confidence level. No silent estimates — if something is inferred rather than sourced, it must be labeled as an estimate in the data model, not presented identically to verified data.
- Flag paid API dependencies and their cost/rate-limit implications before wide rollout, same as the prior spec.

---

## 1. Why This Matters

A lead with great deal math and a high Motivation Score can still be a bad deal — a title defect, an environmental liability, or a declining micro-market can erase the spread entirely. Professionals don't just look for opportunity; they screen out landmines before they commit time or capital. Right now the product only tells the upside story. This spec builds the downside story next to it, so a customer sees the full picture in one place instead of finding out about a problem after they've already made an offer.

The second half of this — data integrity — addresses the "real data" requirement directly: a risk analysis is only as good as the data underneath it, so this spec also builds the verification layer that keeps the system honest about what it actually knows vs. what it's inferring.

---

## 2. Risk Categories to Add

### 2.1 Environmental & Hazard Risk
- **Flood zone** (already scoped in prior spec — extend with FEMA flood insurance cost estimate, not just a yes/no flag).
- **Wildfire risk** — state/federal wildfire hazard severity zone data where available.
- **Earthquake/seismic risk** — fault-line proximity and soil liquefaction zone data for applicable regions.
- **Environmental contamination** — proximity to EPA Superfund sites, known underground storage tanks, or brownfield registries.
- **Soil/subsidence risk** — where public data exists (varies heavily by state/county).

### 2.2 Legal & Title Risk (deepen beyond current caution flags)
- **Easements and encroachments** — surfaced from recorder data where available, since these can materially limit a property's usable value or redevelopment potential.
- **Boundary disputes** — flag if public record or litigation data suggests an active dispute.
- **Unresolved heirship/probate complexity** — go beyond "probate flag" to estimate complexity (single heir vs. multiple heirs, contested vs. uncontested) since this drives how hard the deal will be to close.
- **HOA standing** — liens, litigation, or restrictive covenants that could affect resale or rehab plans (e.g., rental restrictions, architectural review requirements).
- **Litigation history** tied to the property or owner beyond what's already captured for Motivation Score (e.g., active lawsuits that could cloud a sale).

### 2.3 Regulatory & Market Risk
- **Rent control / just-cause eviction jurisdiction status** — critical for buy-and-hold buyer scoring; a market with strict rent control changes the investment thesis entirely.
- **Short-term-rental restrictions** — relevant if the buyer network includes STR investors.
- **Pending zoning changes or planned assessments** — where municipal planning data is accessible, flag anything that could change the property's value or tax burden soon.
- **Special assessment districts** (e.g., Mello-Roos or equivalent) that add ongoing cost burden not obvious from the base tax record.

### 2.4 Physical & Structural Risk
- **Prior insurance claims history** where accessible (e.g., CLUE-type data) — strong signal of recurring issues (roof, water damage, foundation).
- **Roof/system age estimate** — derived from permit history and year-built data, flagged as an estimate, not fact, unless a permit confirms replacement date.
- **Foundation risk indicators** — regional soil data plus any permit history referencing foundation work.

### 2.5 Financial & Deal-Structure Risk
- **Lien stacking vs. equity** — go beyond counting liens (already in Motivation Score) to model whether total encumbrances actually exceed estimated equity, which changes deal viability, not just motivation.
- **Tax lien priority** — flag cases where a tax lien could take priority in a way that affects deal structure.
- **Judgment size relative to equity** — a large judgment against a low-equity property is a very different risk than the same judgment against a high-equity one.

### 2.6 Market & Timing Risk
- **Declining price trend** in the immediate area (extends the appreciation trend data from the prior spec into an explicit risk flag when the trend is negative).
- **Rising days-on-market / inventory trend** — signals a softening local market, relevant to how fast a rehab can be resold.
- **Oversupply signals** — e.g., unusually high concentration of recent flips or new listings in the immediate area.

---

## 3. Data Integrity Layer — "Real Data," Not Estimates Dressed Up as Facts

This is the layer that makes everything above trustworthy rather than just plausible-sounding.

- **Source attribution on every data point** — every field in the Deal Card and new risk layer must carry which source it came from and when it was last refreshed. No unattributed numbers.
- **Confidence scoring** — each estimate (ARV, repair cost, risk flags derived from inference rather than direct record) carries an explicit confidence level (e.g., high/medium/low) based on comp count, data recency, and source reliability. Low-confidence estimates should be visually distinct in the UI, not presented with the same weight as verified public record data.
- **Cross-source verification** — where more than one source can confirm the same fact (e.g., ownership, tax status), reconcile them automatically and flag conflicts rather than silently picking one.
- **Staleness flags** — every data point has a freshness window appropriate to its type (tax status might need monthly refresh, ownership records less often); anything past its freshness window should be flagged as potentially outdated rather than presented as current.
- **Fallback hierarchy** — define, per data type, the priority order of sources to try (e.g., county assessor first, AVM API fallback second) so the system degrades gracefully instead of failing silently when a preferred source is unavailable.
- **Human-review threshold** — for deals above a configurable value/complexity threshold, surface a clear "this deal has low-confidence data in these specific fields — verify before offering" prompt rather than letting a high-stakes deal proceed on unverified estimates.
- **Audit trail** — keep a record of what data a Deal Card was generated from and when, so if a customer acts on a lead and something turns out wrong, there's a clear trace of what was known at the time.

---

## 4. Updated Output: Deal Card v2

Extends the existing Deal Card (don't replace) with:
- A **Risk Summary** section listing every triggered risk flag by category, each with severity and source confidence.
- An **overall Risk Score** alongside the existing Motivation Score, so a lead can be sorted/filtered by both opportunity *and* risk — e.g., "high motivation, low risk" leads surfaced first.
- A **Data Confidence** indicator at the top of the card summarizing how much of the card is verified vs. estimated, so the customer knows at a glance how much independent verification they still need to do.

---

## 5. Data Sources to Evaluate

- **Hazard/environmental:** FEMA (flood), state wildfire hazard severity maps, USGS (seismic), EPA (Superfund/UST/brownfield registries) — mostly public/structured, good fit for the existing county-adapter pattern.
- **Insurance claims history:** typically a paid data source (e.g., CLUE-type providers) — evaluate cost vs. value before committing; may only be worth it for higher-tier customers initially.
- **Regulatory (rent control, STR restrictions, assessments):** municipal-level data, highly fragmented — build incrementally, prioritized by where current/target customers operate rather than trying to cover every jurisdiction at once.
- **Litigation/boundary disputes:** county court records — availability varies significantly; treat as a "where available" enhancement, not a guaranteed field.

---

## 6. Build Phases

| Phase | Scope |
|---|---|
| 1 | Data Integrity Layer (source attribution, confidence scoring, staleness flags) — build this first since everything else depends on it being trustworthy |
| 2 | Environmental & hazard risk signals |
| 3 | Deepened legal/title risk (easements, HOA standing, heirship complexity) |
| 4 | Financial/deal-structure risk (lien-vs-equity modeling) |
| 5 | Regulatory/market risk (rent control, STR restrictions, pending zoning/assessments) |
| 6 | Market/timing risk trend flags |
| 7 | Deal Card v2 UI with Risk Summary + Data Confidence indicator |
| 8 | Human-review threshold workflow for high-value/low-confidence deals |

---

## 7. Open Questions for Claude Code

- Should confidence scoring be a simple three-tier system (high/medium/low) initially, or does the data model need finer granularity from the start to avoid a rework later?
- Which risk categories are highest priority given where current/target customers are actually operating — should hazard data (wildfire/seismic) be prioritized by region rather than built uniformly everywhere at once?
- What's the right threshold (deal size, confidence level, or both) for triggering the human-review prompt, and should that threshold be configurable per customer or set globally?
- For paid data sources (insurance claims history, some AVM providers), is it better to gate them behind a higher pricing tier rather than applying the cost across all customers uniformly?
