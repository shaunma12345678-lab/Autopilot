# Autopilot — Finance & Accounting Operator Spec

**Goal:** Build a Finance/Accounting Operator inside Autopilot that does for a business owner's books what the Inbox Operator does for their email — runs continuously in the background, uses real accounting methodology (not just categorization), and hands the owner decision-ready numbers instead of raw data.

**Positioning:** Most small-business "finance tools" are either a dumb transaction categorizer (Quickbooks/Wave) or a static dashboard. This is neither — it's an agent that closes the books, catches problems before they're expensive, and explains what the numbers mean in plain language, every week, without the owner lifting a finger.

---

## 1. The Problem This Solves

Business owners running lean (like Autopilot and Volleyball Collective) typically have one of two failure modes:
- They don't look at the numbers closely enough, and find out about a cash problem after it's already a crisis.
- They spend hours doing bookkeeping/reconciliation themselves, which is time not spent on the business.

A good Finance Operator should make both of these impossible: numbers stay current automatically, and the owner gets a distilled view instead of raw transaction noise.

---

## 2. What the Operator Actually Does

### 2.1 Continuous Bookkeeping (the "shadow mode" for finance)
- Pulls every transaction from connected bank accounts, cards, Stripe, and payment processors via **Plaid** (banking) and native **Stripe/Shopify** APIs.
- Auto-categorizes transactions using historical patterns + vendor recognition, not just keyword matching.
- Flags anything it's not confident about for a 10-second owner approval — same shadow-mode pattern as the Inbox Operator (drafts, doesn't act, until trust is established).
- Reconciles bank/card balances against the books automatically each day, not just at month-end.

### 2.2 Real Accounting Methodology, Not Just Categorization
This is the differentiator — most tools stop at categorization. This operator applies actual accounting practice:
- **Accrual-based books** maintained alongside cash-basis, so the owner sees both "cash in the bank" and "true profitability this period" — critical because cash and profit tell different stories, especially for e-commerce with inventory lag (Volleyball Collective) or deferred revenue (Autopilot subscriptions).
- **COGS and gross margin tracking per product/SKU** (Volleyball Collective) — automatically pulls cost basis from purchase records and computes margin per drop/auction item, not just overall.
- **Deferred revenue recognition** (Autopilot) — subscription revenue recognized over the service period, not on the day cash lands, so MRR/ARR reporting is accurate.
- **Inventory costing method applied consistently** (FIFO/weighted-average) — picks one and applies it automatically rather than ad hoc.
- **Working capital tracking** — AR aging, AP aging, and a running "days cash on hand" number.

### 2.3 Forecasting & Scenario Planning
- **Driver-based cash flow forecast** — instead of a flat trendline, the model is built on actual drivers (new customers × average deal size for Autopilot; units sold × average order value for Volleyball Collective) so forecasts update automatically when the drivers change.
- **Rolling 13-week cash flow** — the standard operator-grade cash visibility tool, auto-updated instead of manually rebuilt in a spreadsheet weekly.
- **Scenario/sensitivity modeling** — "what happens to runway if churn increases 5%" or "what happens to margin if COGS rises 10%" generated on request in plain language, not just a spreadsheet the owner has to interpret alone.

### 2.4 The Weekly Finance Briefing
Mirrors the existing 7am Daily Brief pattern, but weekly and finance-specific:
- Revenue this week vs. last week vs. trend
- Cash position and runway (or days-cash-on-hand for the e-commerce side)
- Anything flagged as an anomaly (an expense that's 3x its usual size, a customer payment that didn't land, margin on a specific product dropping)
- One or two numbers that actually moved and a plain-language reason why, not just a wall of charts

### 2.5 Tax-Ready, Year-Round
- Maintains books in a state that's audit/tax-ready continuously, instead of a scramble every March.
- Flags deductible expenses as they happen (home office, software subscriptions, contractor payments) rather than trying to reconstruct a year later.
- Surfaces potential tax-saving items worth a real accountant's attention (e.g., R&D credit eligibility for Autopilot's engineering spend) — the operator flags candidates, a licensed professional makes the actual call.
- Generates a clean handoff package for a CPA at tax time — no more exporting a mess of CSVs.

### 2.6 Invoicing & Collections
- Auto-generates and sends invoices for anything recurring or milestone-based.
- Tracks AR aging and sends automatic, tone-matched follow-ups on overdue invoices (same "in your voice" approach as the Inbox Operator) before it becomes a collections problem.

---

## 3. How This Fits Autopilot's Existing Architecture

- Becomes the 13th operator alongside Inbox Operator, Lead Engine, CRM Keeper, etc. — same agent-orchestrator pattern, same shadow-mode trust-building rollout (draft → approve → autonomous).
- Data sources: Plaid (banking), Stripe (payments/subscriptions), Shopify or equivalent (Volleyball Collective inventory/sales), QuickBooks/Xero API (if the owner already has books started there — sync rather than replace).
- Output surfaces: the existing Daily/Weekly Brief pattern, plus a dedicated Finance dashboard view.
- Same "context once, runs forever" philosophy — a short onboarding conversation captures chart-of-accounts preferences, entity structure, and what counts as "flag this" vs. "handle automatically," the same way the Brief step captures tone and priorities for the Inbox Operator.

---

## 4. Why This Is a Strong Product Bet

- Every business owner has this pain, regardless of industry — unlike the real-estate-specific Lead Engine, this operator has universal appeal and could be a wedge into a broader SMB market beyond wholesalers.
- High switching cost once adopted — books are sticky; once a business's finance history lives in Autopilot, moving away is expensive, which is good for retention.
- Natural upsell path — a business that trusts Autopilot with email/CRM is a natural next customer for "also trust it with your books," and vice versa.

---

## 5. Build Phases

| Phase | Scope |
|---|---|
| 1 | Bank/card sync via Plaid, auto-categorization, daily reconciliation, shadow-mode approval flow |
| 2 | Accrual books alongside cash-basis, COGS/margin tracking, AR/AP aging |
| 3 | Weekly Finance Briefing (mirrors existing Daily Brief pattern) |
| 4 | Driver-based forecasting + 13-week rolling cash flow |
| 5 | Invoicing/collections automation |
| 6 | Tax-ready book maintenance + CPA handoff package |
| 7 | Scenario/sensitivity modeling on request |

Recommend building Phase 1–3 first and using it internally on both Autopilot and Volleyball Collective's own books before offering it externally — the best proof this works is running it on your own business first.

---

## 6. Open Questions for Claude Code / Implementation

- Does this live as a new top-level module in the existing Prisma schema, or a separate service given the sensitivity of financial data?
- What's the right boundary for "auto-handle" vs. "always ask" for financial actions — likely stricter than email drafting, given real money is involved (e.g., never auto-send an invoice above a threshold without approval, even post-trust-period).
- Compliance/security requirements for handling banking data (Plaid has its own security review process) — factor this in before general availability, not after.
