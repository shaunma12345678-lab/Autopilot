// Live corporate events from 8-K filings — what has ACTUALLY changed recently,
// as opposed to what the annual report said months ago.
//
// This is the highest-signal free data in EDGAR that almost nobody surfaces.
// Every 8-K is tagged with numeric item codes describing exactly what happened,
// and a handful of those codes are among the most serious warnings a public
// company can issue:
//
//   4.02 — Non-reliance on previously issued financials. This is a RESTATEMENT:
//          the company is telling you its past numbers were wrong. Every ratio
//          computed from those filings is now suspect.
//   3.01 — Delisting notice.
//   1.03 — Bankruptcy or receivership.
//   4.01 — Auditor change. Benign sometimes; a classic precursor to trouble
//          when it follows a disagreement.
//   2.06 — Material impairment (writing down assets).
//   2.04 — Triggering event accelerating a financial obligation (covenant breach).
//
// A company can pass every fundamental screen and still have filed a 4.02 last
// week. Backward-looking ratios cannot see that; this can.

export interface LiveEvent {
  date: string
  itemCodes: string[]
  label: string
  severity: "severe" | "warning" | "watch" | "routine"
  note: string
  accessionNumber: string
}

// Item code -> meaning. Only codes with genuine interpretive value are mapped;
// unmapped codes fall through as routine rather than being invented.
const ITEM_MEANINGS: Record<string, { label: string; severity: LiveEvent["severity"]; note: string }> = {
  "4.02": {
    label: "Financial restatement",
    severity: "severe",
    note: "The company has stated its previously issued financial statements should no longer be relied on. Historical ratios built from those filings are unreliable until restated figures are filed.",
  },
  "3.01": {
    label: "Delisting notice",
    severity: "severe",
    note: "Notice of delisting or failure to satisfy a continued listing rule.",
  },
  "1.03": {
    label: "Bankruptcy or receivership",
    severity: "severe",
    note: "Bankruptcy or receivership proceedings.",
  },
  "4.01": {
    label: "Auditor change",
    severity: "warning",
    note: "The certifying accountant changed. Often routine, but an auditor departing after a disagreement is a well-known precursor to accounting problems — worth reading the filing itself.",
  },
  "2.06": {
    label: "Material impairment",
    severity: "warning",
    note: "The company wrote down the value of assets, meaning prior carrying values overstated what those assets were worth.",
  },
  "2.04": {
    label: "Debt obligation accelerated",
    severity: "warning",
    note: "A triggering event accelerated a financial obligation — typically a covenant breach.",
  },
  "5.02": {
    label: "Executive or director change",
    severity: "watch",
    note: "A director or principal officer departed, was elected, or was appointed. Routine individually; a cluster of departures is worth noticing.",
  },
  "2.05": {
    label: "Restructuring or exit costs",
    severity: "watch",
    note: "Costs associated with exit or disposal activities — typically restructuring or layoffs.",
  },
  "2.03": {
    label: "New financial obligation",
    severity: "watch",
    note: "The company took on a direct financial obligation, usually new debt.",
  },
  "1.01": {
    label: "Material agreement signed",
    severity: "routine",
    note: "Entry into a material definitive agreement — often a significant customer, partnership, or financing deal.",
  },
  "2.01": {
    label: "Acquisition or disposition completed",
    severity: "routine",
    note: "Completed an acquisition or disposition of assets.",
  },
  "2.02": {
    label: "Earnings released",
    severity: "routine",
    note: "Results of operations and financial condition — a routine earnings release.",
  },
  "5.07": {
    label: "Shareholder vote",
    severity: "routine",
    note: "Submission of matters to a vote of security holders — routine annual meeting business.",
  },
}

const SEVERITY_RANK: Record<LiveEvent["severity"], number> = { severe: 3, warning: 2, watch: 1, routine: 0 }

export interface RecentFiling {
  form: string
  filingDate: string
  accessionNumber: string
  items?: string
}

export interface LiveEventSummary {
  events: LiveEvent[]
  severeCount: number
  warningCount: number
  execChangeCount: number
  hasRestatement: boolean
  hasAuditorChange: boolean
  /** 0-100 penalty applied to the risk axis. */
  riskPenalty: number
  flags: string[]
}

const LOOKBACK_DAYS = 365

export function summarizeLiveEvents(filings: RecentFiling[]): LiveEventSummary {
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000
  const events: LiveEvent[] = []

  for (const f of filings) {
    if (f.form !== "8-K" || !f.items) continue
    const filed = new Date(f.filingDate).getTime()
    if (!isFinite(filed) || filed < cutoff) continue

    const codes = f.items.split(",").map(c => c.trim()).filter(Boolean)
    if (codes.length === 0) continue

    // An 8-K carries several item codes; classify it by its most serious one.
    let worst: { code: string; meaning: (typeof ITEM_MEANINGS)[string] } | null = null
    for (const code of codes) {
      const meaning = ITEM_MEANINGS[code]
      if (!meaning) continue
      if (!worst || SEVERITY_RANK[meaning.severity] > SEVERITY_RANK[worst.meaning.severity]) {
        worst = { code, meaning }
      }
    }
    if (!worst) continue

    events.push({
      date: f.filingDate,
      itemCodes: codes,
      label: worst.meaning.label,
      severity: worst.meaning.severity,
      note: worst.meaning.note,
      accessionNumber: f.accessionNumber,
    })
  }

  events.sort((a, b) => b.date.localeCompare(a.date))

  const severeCount = events.filter(e => e.severity === "severe").length
  const warningCount = events.filter(e => e.severity === "warning").length
  const execChangeCount = events.filter(e => e.itemCodes.includes("5.02")).length
  const hasRestatement = events.some(e => e.itemCodes.includes("4.02"))
  const hasAuditorChange = events.some(e => e.itemCodes.includes("4.01"))

  const flags: string[] = []
  let riskPenalty = 0

  if (hasRestatement) {
    riskPenalty += 35
    flags.push("🚨 Filed a restatement (8-K item 4.02) in the past year — the company stated prior financials should not be relied on. Every fundamental metric here derives from those filings.")
  }
  if (events.some(e => e.itemCodes.includes("3.01"))) {
    riskPenalty += 30
    flags.push("🚨 Received a delisting notice in the past year.")
  }
  if (events.some(e => e.itemCodes.includes("1.03"))) {
    riskPenalty += 40
    flags.push("🚨 Filed for bankruptcy or receivership in the past year.")
  }
  if (hasAuditorChange) {
    riskPenalty += 12
    flags.push("⚠ Changed auditors in the past year — worth reading the filing to see whether it followed a disagreement.")
  }
  if (events.some(e => e.itemCodes.includes("2.06"))) {
    riskPenalty += 8
    flags.push("⚠ Recorded a material asset impairment in the past year.")
  }
  if (events.some(e => e.itemCodes.includes("2.04"))) {
    riskPenalty += 12
    flags.push("⚠ A financial obligation was accelerated — typically a debt covenant breach.")
  }
  // Isolated executive changes are noise; a cluster is a pattern.
  if (execChangeCount >= 4) {
    riskPenalty += 10
    flags.push(`⚠ ${execChangeCount} separate executive or director changes filed in the past year — unusual turnover at the top.`)
  }

  return {
    events: events.slice(0, 12),
    severeCount, warningCount, execChangeCount,
    hasRestatement, hasAuditorChange,
    riskPenalty: Math.min(riskPenalty, 60),
    flags,
  }
}
