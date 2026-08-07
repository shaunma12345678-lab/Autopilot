// Market alerts — reaching the user when something actually changes.
//
// THE DESIGN CONSTRAINT IS ALERT FATIGUE, NOT COVERAGE. It is trivial to email
// on every event the discovery engine finds; that produces dozens of messages a
// day, the user stops reading them, and the one that mattered arrives in a
// stream they have learned to ignore. An alerting system that is ignored is
// worse than none, because it creates the belief that nothing is being missed.
//
// So the bar is deliberately high and stated as a rule: an alert must describe
// something that CHANGES A DECISION. Not "this company filed an 8-K" — filings
// happen constantly. Only the disclosures that invalidate an existing view:
//
//   A company we ranked as an opportunity just restated its financials, so
//   every ratio it was ranked on is unreliable.
//
//   A company we called sound just disclosed going-concern doubt.
//
//   A tracked company entered the Altman distress zone.
//
// Everything else stays in the feed to be read when the user chooses.
//
// DEDUPLICATION IS PART OF CORRECTNESS. The same restatement re-alerted every
// twenty minutes is the same failure as alerting on everything, so each alert
// is keyed on the fact rather than on the run that noticed it.
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"

export interface MarketAlert {
  key: string
  symbol: string
  name: string
  severity: "critical" | "high"
  headline: string
  detail: string
  whyItMatters: string
}

interface TickerRow {
  symbol: string; name: string
  qualityScore: number | null; valuationScore: number | null
  dataConfidence: string; altmanZone: string | null
  hasRestatement: boolean | null; goingConcernHits: number | null
  beneishFlag: boolean | null; benfordConformity: string | null
  shortTrend: string | null; materialNewRisks: unknown
  lastScoredAt: string | null
}

// Only companies that reached a ranking are alert-worthy. A disclosure by a
// company we never surfaced changes no decision the user has made.
function wasSurfaced(t: TickerRow): boolean {
  if (t.dataConfidence !== "high" && t.dataConfidence !== "medium") return false
  return (t.qualityScore ?? 0) >= 55 || (t.valuationScore ?? 0) >= 55
}

export function detectAlerts(tickers: TickerRow[]): MarketAlert[] {
  const alerts: MarketAlert[] = []

  for (const t of tickers) {
    if (!wasSurfaced(t)) continue

    if (t.hasRestatement) {
      alerts.push({
        key: `restatement:${t.symbol}`,
        symbol: t.symbol, name: t.name, severity: "critical",
        headline: `${t.symbol} restated its financial statements`,
        detail: "Filed an 8-K item 4.02 — previously issued financials can no longer be relied upon.",
        whyItMatters: "Every ratio this company was ranked on was computed from those statements. The ranking is not merely stale, it was built on numbers the company has now withdrawn.",
      })
    }

    if ((t.goingConcernHits ?? 0) > 0) {
      alerts.push({
        key: `going-concern:${t.symbol}`,
        symbol: t.symbol, name: t.name, severity: "critical",
        headline: `${t.symbol} disclosed going-concern doubt`,
        detail: "Auditors raised substantial doubt about its ability to continue operating.",
        whyItMatters: "This is a formal determination under ASC 205-40, not a turn of phrase. Auditors do not use this language lightly, and it sits at odds with a company being ranked as sound.",
      })
    }

    if (t.altmanZone === "distress") {
      alerts.push({
        key: `altman-distress:${t.symbol}`,
        symbol: t.symbol, name: t.name, severity: "high",
        headline: `${t.symbol} entered the Altman distress zone`,
        detail: "The Altman Z-Score now places it in the bankruptcy distress range.",
        whyItMatters: "Altman's model is a published, independently replicated bankruptcy predictor. A company that was surfaced as an opportunity crossing into distress is a direct contradiction of the reason it was surfaced.",
      })
    }

    if (t.beneishFlag) {
      alerts.push({
        key: `beneish:${t.symbol}`,
        symbol: t.symbol, name: t.name, severity: "high",
        headline: `${t.symbol} triggered the Beneish manipulation flag`,
        detail: "The M-Score exceeded -1.78, a statistically elevated likelihood of earnings manipulation.",
        whyItMatters: "This is a probability, not an accusation — but it applies to a company that was ranked on the earnings the model is questioning.",
      })
    }
  }

  return alerts
}

// Persisted so the same fact is never re-sent. Keyed on the fact itself, not on
// the run that observed it.
async function alreadySent(key: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = await (prisma.underwriteCall as any).findFirst({
      where: { subjectType: "alert", subjectId: key },
    })
    return Boolean(found)
  } catch {
    // Fail CLOSED. If the dedupe store cannot be read we skip sending rather
    // than risk re-alerting on every run, which is the failure this exists to
    // prevent.
    return true
  }
}

async function recordSent(alert: MarketAlert): Promise<void> {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  const id = `c${Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.underwriteCall as any).create({
      data: {
        id, subjectType: "alert", subjectId: alert.key,
        subjectLabel: `${alert.symbol} — ${alert.headline}`,
        verdict: alert.severity, predictedScore: 0,
        rationale: { detail: alert.detail, whyItMatters: alert.whyItMatters },
        confidenceAtCall: 100,
        predictedAt: new Date().toISOString(),
        reviewAt: new Date().toISOString(),
      },
    })
  } catch { /* recording failure must not block delivery */ }
}

function renderEmail(alerts: MarketAlert[]): string {
  const rows = alerts.map(a => `
    <div style="border-left:3px solid ${a.severity === "critical" ? "#dc2626" : "#f59e0b"};padding:12px 16px;margin:0 0 16px;background:#fafafa">
      <div style="font-size:15px;font-weight:600;color:#111">${a.headline}</div>
      <div style="font-size:13px;color:#444;margin-top:6px">${a.detail}</div>
      <div style="font-size:13px;color:#666;margin-top:8px"><strong>Why this matters:</strong> ${a.whyItMatters}</div>
    </div>`).join("")

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto">
    <h2 style="font-size:17px;color:#111">${alerts.length} material change${alerts.length === 1 ? "" : "s"} on companies you were shown</h2>
    <p style="font-size:13px;color:#666;line-height:1.5">These are disclosures that contradict the reason a company was surfaced. Routine filings are not sent — they stay in the feed.</p>
    ${rows}
    <p style="font-size:12px;color:#999;border-top:1px solid #eee;padding-top:12px;margin-top:20px">
      Impersonal analysis of public filings. Not investment advice, and not a recommendation to buy or sell any security.
    </p>
  </div>`
}

export async function runAlertScan(recipientEmail: string): Promise<{
  scanned: number; detected: number; sent: number; suppressed: number
}> {
  const rows: TickerRow[] = []
  const PAGE = 1000
  for (let skip = 0; skip < 20000; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.ticker as any).findMany({ take: PAGE, skip }) as TickerRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }

  const detected = detectAlerts(rows)
  const fresh: MarketAlert[] = []
  for (const a of detected) {
    if (await alreadySent(a.key)) continue
    fresh.push(a)
  }

  let sent = 0
  if (fresh.length > 0 && recipientEmail) {
    // One digest, not one email per alert. Ten separate messages about the same
    // scan is the fatigue problem in a different shape.
    const ok = await sendEmail(
      recipientEmail,
      `${fresh.length} material change${fresh.length === 1 ? "" : "s"} in your tracked companies`,
      renderEmail(fresh)
    )
    if (ok) {
      sent = fresh.length
      for (const a of fresh) await recordSent(a)
    }
  }

  return { scanned: rows.length, detected: detected.length, sent, suppressed: detected.length - fresh.length }
}
