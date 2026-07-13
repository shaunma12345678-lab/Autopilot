# AutoPilot — Moat Audit (2026-07-12)

Response to `CLAUDE_CODE_MOAT_BRIEF.md`. Grounded in the actual code as of today. Blunt by request.

---

## The honest one-paragraph read

AutoPilot's finding engine is genuinely ahead of retail competitors, and four real moat-starters now exist: the **Property Index** (canonical records + provenance), the **outcome ledger** (verified predictions), the **inbound seller channel** (/sell + 65 SEO pages), and **verified county connectors** (assessor/recorder/buyer layers). But the business-critical workflow layer — CRM, buyers, farms, reminders — lives in **9 browser localStorage keys**, which means zero switching costs, zero team support, and data that dies with a cleared cache. There are **0 tests** across ~90k lines, **47 files** carry a hardcoded admin-password fallback, and monetization is a pricing page with no enforcement. The moat ingredients are real; the vessel holding them is thin.

---

## Where we're strong (verified, keep compounding)

| Asset | Moat type | State |
|---|---|---|
| Property Index (`lib/property-index.ts`, PropertyIndex table) | **Data** — compounds daily | Live; fed by every search + cron; provenance + confidence + Potential Score v1 |
| Outcome ledger (`lib/forecast-ledger.ts`, /proof) | **Data + brand** — accuracy no one else can publish | Live; young; every day adds evidence |
| Inbound sellers (/sell + city pages + instant alerts) | **Data** — leads that cannot be scraped | Live; needs traffic (SEO compounds) |
| Verified connectors (parcels: LA/Wayne/Maricopa/Marion/Cuyahoga; recorder: LA registry; buyers: Wayne/Marion) | **Data + speed** | Live; verify-then-pin method proven; AGOL-hosted layers never block, self-hosted (gis.indy.gov) sometimes do — prefer AGOL |
| Own access layer (`lib/own-access.ts` Google News RSS) | **Speed/cost** — no per-query data bill | Live; verified from Vercel datacenter today |
| Rental Intelligence + Markets engine (Zillow/PMMS/ACS/BLS fused) | Feature → **brand** if published | Live; publishable as public market reports |
| Learning engine + adaptive ranking | **Data** — needs outcome volume | Live but starved (outcomes come from localStorage CRM) |

## Where we're weak (the uncomfortable list)

1. **localStorage is our system of record.** `ap_crm_v1`, `ap_buyers_v1`, `ap_farm_zones_v1`, reminders, seen-leads, driving routes — one device, one browser, no team, no backup, no server-side learning signal, no reason not to churn. This single fact negates the switching-cost moat and starves the feedback-loop moat.
2. **Zero tests.** ~90k hand-written lines, 96 lib modules, 0 test files. Every deploy is faith + smoke tests. The deal-math libs (`deal-analysis`, `potential-score`, `forecast-ledger` merge logic) are pure functions begging for unit tests — cheapest insurance available.
3. **Security debt.** `ADMIN_PASSWORD ?? "ap2026admin"` fallback in **47 files**; admin pw in sessionStorage; Supabase personal token and admin password recorded in project notes. One env misconfig = fully open admin. PII (owner names, phones, mailing addresses) stored with no retention policy.
4. **Monolith pages.** `app/admin/page.tsx` (2,478 lines) and `ForeclosureSearch.tsx` (2,228) are where velocity goes to die — every feature this month touched them, and the pre-existing lint errors live there.
5. **Court-record lead types are still thin** (probate/divorce/eviction/bankruptcy lean on web search). The engine fills honestly, but "13 lead types" oversells ~7 strong ones.
6. **Two products in one repo.** The business-OS half (agents/automations/content) is largely demo-fixture depth, dilutes focus, and confuses the pitch. The RE product is the business.
7. **Compliance surface unaudited.** Zillow/Redfin scraping is ToS-gray (mitigation: keep shifting weight to public records — already the trend); outreach auto-email is fine but any future auto-SMS needs the TCPA design we specced; no DNC scrub.
8. **No observability.** `console.error` + Vercel logs; the dashboard 500 hid behind an empty error message for days. No Sentry, no source-health dashboard beyond the agents page.

---

## Prioritized plan

### NOW (0–2 weeks)
1. **Migrate CRM/buyers/farms/reminders to the database.** *Switching-cost moat + unlocks the learning loop.* Effort: ~1 wk. First step: `WorkspaceItem` table (or reuse AgentMemory pattern with real tables: CrmEntry, Buyer, FarmZone) + read/write API + one-time localStorage import button. Risk: migration bugs — ship import as additive, keep localStorage as fallback read.
2. **Kill the hardcoded admin fallback.** Table-stakes security. Effort: hours. First step: central `requireAdmin()` in `lib/auth-helper` that throws if `ADMIN_PASSWORD` unset; replace 47 inline fallbacks.
3. **Unit tests for the money math.** Table-stakes. Effort: 2–3 days. First step: vitest + tests for `deal-analysis` (MAO breakdown), `potential-score`, `forecast-ledger.applyOutcomes`, `rental-intel` scoring.
4. **Split the monoliths.** Velocity. Effort: 3–4 days. First step: extract admin tabs into `components/admin/*` one tab at a time (no behavior change), then carve `ForeclosureSearch` (LeadRow/OutreachPanel/CampaignTab already separable).

### NEXT (1–3 months) — the real moat work
5. **Close the deal-outcome loop.** *Data moat (the big one).* Track saved→offer→contract→closed in DB (needs #1), feed `deal-learning`/`forecast-ledger`, surface "verified user results." Every closed deal makes scoring smarter and marketing stronger.
6. **Coverage flywheel, industrialized.** *Data + speed moat.* Target: 2 new verified counties/week (parcel/recorder/buyer adapters), AGOL-hosted preferred; per-metro recorder feeds ranked by earliest signal (NOD-equivalent registries first). First step: `scripts/verify-county.ts` harness that probes candidate layers and emits registry entries.
7. **Latency: county watchers.** *Speed moat.* The discovery cron is 2-hourly on 5 SoCal counties; recorder-direct is LA-only. Add per-source watcher jobs (Inngest already installed, underused) with per-source freshness SLAs; alert on new filings in minutes, not hours.
8. **Enforce plans + billing.** Monetization table-stakes: wire `hasFeature()` (built) into the dashboard/API surface once public signups open; Stripe founding prices.
9. **Observability.** Sentry (or minimal error-webhook), plus a source-health board fed by watcher runs.

### LATER (3–12 months, needs the above)
10. **Buyer marketplace / dispositions.** *Network-effects moat.* v1: verified buyer buy-boxes (server-side, from #1) + "N buyers match this contract" + intro-fee mechanics. Needs server-side buyers + deal tracking.
11. **Market-intelligence brand.** Publish the Markets/Rental-Intel engine as free monthly metro reports (auto-generated) → top-of-funnel + backlinks → feeds the inbound channel. *Brand moat.*
12. **Data product for funds** (Distress Velocity Index) once the Index has 6+ months of longitudinal coverage.

---

## If I could only do three things

1. **Move the workspace into the database and close the outcome loop** (#1 + #5). Everything compounds from real, durable user data: switching costs, the learning moat, verified results, team plans, honest billing. This is the single highest-leverage move and it's boring — that's why competitors' products all have it and ours doesn't.
2. **Industrialize the coverage flywheel** (#6 + #7). The verify-then-pin connector method is proven and repeatable; 50 covered metros with watcher-grade latency is a dataset that takes a competitor a year of grinding to copy — a true data+speed moat that widens weekly.
3. **Publish the proof** (accuracy record + market reports + verified results). We are the only player structurally able to say "here's our track record, live." Brand moats in data businesses are built on receipts, and we're already collecting them.

Everything else — more AI features, more tabs, more scores — is feature work. Good, sellable, copyable. The three above are the ones that make month 12 unreachable for a fast follower.
