// Finance engine tests — the pure layers: universal statement parsing (CSV
// variants / OFX / QIF), dedupe hashing, categorization precedence, recurring
// detection, transfer matching, and the books math.

import { describe, it, expect } from "vitest"
import { parseStatement, txnHash } from "@/lib/finance/ingest"
import { normalizeMerchant, categorizeRules, detectRecurring, markTransfers } from "@/lib/finance/categorize"
import { summarizeBooks } from "@/lib/finance/books"

describe("parseStatement (universal ingestion)", () => {
  it("standard CSV with header + $ and parens negatives", () => {
    const csv = `Date,Description,Amount\n01/05/2026,"GOOGLE ADS #4821","($250.00)"\n01/07/2026,STRIPE PAYOUT,"$1,200.50"`
    const r = parseStatement(csv, "chase.csv")
    expect(r.format).toBe("csv")
    expect(r.transactions).toHaveLength(2)
    expect(r.transactions[0]).toMatchObject({ date: "2026-01-05", amount: -250 })
    expect(r.transactions[1].amount).toBe(1200.5)
  })

  it("debit/credit split columns + preamble junk above the header", () => {
    const csv = `Account: ****1234\nStatement period: Jan 2026\nPosted Date,Details,Debit,Credit\n2026-01-03,AWS BILL,45.10,\n2026-01-04,CLIENT PAYMENT,,900.00`
    const r = parseStatement(csv)
    expect(r.transactions).toHaveLength(2)
    expect(r.transactions[0].amount).toBe(-45.1)
    expect(r.transactions[1].amount).toBe(900)
  })

  it("DMY dates are detected from samples (day > 12)", () => {
    const csv = `Date,Description,Amount\n25/01/2026,COFFEE,-4.50\n26/01/2026,RENT,-1200`
    const r = parseStatement(csv)
    expect(r.transactions[0].date).toBe("2026-01-25")
  })

  it("OFX blocks with FITID drive the dedupe hash", () => {
    const ofx = `OFXHEADER:100\n<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260110120000<TRNAMT>-52.25<FITID>T-991<NAME>VERCEL INC</STMTTRN></OFX>`
    const r = parseStatement(ofx, "export.qfx")
    expect(r.format).toBe("ofx")
    expect(r.transactions[0]).toMatchObject({ date: "2026-01-10", amount: -52.25, fitId: "T-991" })
    // Same FITID → same hash even if the descriptor changes.
    const h1 = txnHash("acct", r.transactions[0])
    const h2 = txnHash("acct", { ...r.transactions[0], name: "VERCEL*" })
    expect(h1).toBe(h2)
  })

  it("QIF entries parse and hash dedupes identical re-imports", () => {
    const qif = `!Type:Bank\nD1/15'26\nT-99.00\nPADOBE SYSTEMS\n^\nD1/16'26\nT450.00\nPCLIENT ACH\n^`
    const r = parseStatement(qif, "old-bank.qif")
    expect(r.format).toBe("qif")
    expect(r.transactions).toHaveLength(2)
    expect(txnHash("a", r.transactions[0])).toBe(txnHash("a", r.transactions[0]))
    expect(txnHash("a", r.transactions[0])).not.toBe(txnHash("b", r.transactions[0]))
  })
})

describe("categorize", () => {
  it("merchant normalization strips processor junk", () => {
    expect(normalizeMerchant("SQ *BLUE BOTTLE COFFEE #402")).toMatch(/Blue Bottle Coffee/)
    expect(normalizeMerchant("PAYPAL *UPWORK 402-935")).toMatch(/Upwork/i)
  })

  it("learned rules outrank builtin; builtin catches common vendors; unknowns stay honest", () => {
    const rules = new Map([["figma", "advertising"]])   // deliberately "wrong" user rule — must still win
    const res = categorizeRules([
      { merchant: "Figma", name: "FIGMA", amount: -15 },
      { merchant: "Google Ads", name: "GOOGLE ADS", amount: -300 },
      { merchant: "Zzyzx Widgets", name: "ZZYZX", amount: -80 },
    ], rules)
    expect(res[0]).toMatchObject({ category: "advertising", source: "rule", confidence: 1 })
    expect(res[1]).toMatchObject({ category: "advertising", source: "builtin" })
    expect(res[2].category).toBe("other")   // unknown stays honest without AI
  })

  it("detects monthly recurring with a price-hike flag", () => {
    const txns = ["2026-01-05", "2026-02-05", "2026-03-06", "2026-04-05"].map((date, i) => ({
      merchant: "Adobe", category: "software", date, amount: i === 3 ? -70 : -60,
    }))
    const streams = detectRecurring(txns)
    expect(streams).toHaveLength(1)
    expect(streams[0]).toMatchObject({ merchant: "Adobe", cadence: "monthly", occurrences: 4 })
    expect(streams[0].priceChangePct).toBeGreaterThan(0)
  })

  it("marks mirrored amounts across accounts as transfers", () => {
    const txns = [
      { accountId: "a", date: "2026-03-01", amount: -500, transfer: false },
      { accountId: "b", date: "2026-03-02", amount: 500, transfer: false },
      { accountId: "a", date: "2026-03-05", amount: -75, transfer: false },
    ]
    expect(markTransfers(txns)).toBe(2)
    expect(txns[0].transfer && txns[1].transfer).toBe(true)
    expect(txns[2].transfer).toBe(false)
  })
})

describe("summarizeBooks", () => {
  const now = new Date("2026-07-15T12:00:00Z")
  it("transfers are excluded from P&L; burn + days-cash math holds", () => {
    const txns = [
      // 3 complete months of −$1000 net burn, plus a big transfer that must NOT count.
      ...["2026-04", "2026-05", "2026-06"].flatMap((m) => [
        { date: `${m}-05`, amount: 2000, merchant: "Client", category: "income", transfer: false, catSource: "builtin" },
        { date: `${m}-10`, amount: -3000, merchant: "Payroll Co", category: "payroll", transfer: false, catSource: "builtin" },
      ]),
      { date: "2026-06-20", amount: 50000, merchant: "Transfer In", category: "transfer", transfer: true, catSource: "builtin" },
    ]
    const s = summarizeBooks(txns, { balances: 12000, now })
    expect(s.burnRate).toBe(-1000)
    expect(s.daysCashOnHand).toBe(Math.round(12000 / (1000 / 30.4)))
    const june = s.months.find((m) => m.month === "2026-06")!
    expect(june.income).toBe(2000)   // the 50k transfer never inflated revenue
  })

  it("anomaly = 3x+ a vendor's own median; briefing says something useful", () => {
    const txns = [
      ...[1, 2, 3, 4].map((i) => ({ date: `2026-0${i}-10`, amount: -100, merchant: "Facebook Ads", category: "advertising", transfer: false, catSource: "builtin" })),
      { date: "2026-07-01", amount: -900, merchant: "Facebook Ads", category: "advertising", transfer: false, catSource: "builtin" },
    ]
    const s = summarizeBooks(txns, { balances: null, now })
    expect(s.anomalies.length).toBeGreaterThanOrEqual(1)
    expect(s.anomalies[0].merchant).toBe("Facebook Ads")
    expect(s.briefing.join(" ")).toContain("Facebook Ads")
  })
})
