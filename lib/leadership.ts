// Who actually runs this company.
//
// THE GAP THIS CLOSES. lib/governance.ts reads the proxy for STRUCTURE — how
// pay is measured, whether related-party deals exist, whether there are two
// classes of stock. All of that is about the rules the company operates under.
// None of it is about the people operating it.
//
// That is a real omission, because the questions an investor actually asks
// about management are person-shaped: how long has this CEO been here, did
// they found the company, do they own enough of it to feel a bad decision, is
// the executive team stable or churning, and are the people who know the most
// buying their own stock or selling it.
//
// Every one of those is disclosed. The DEF 14A carries executive tenure, age,
// biography and beneficial ownership; Form 4 carries who bought and sold; 8-K
// item 5.02 carries every departure and appointment with a stated reason. The
// facts exist and simply were not being read.
//
// WHAT THIS DELIBERATELY DOES NOT DO. Judge character. A proxy is written by
// the company about itself, and a model asked whether a CEO is "good" will
// mostly paraphrase the company's own framing of them. So this reports
// DISCLOSED FACTS — tenure, ownership, turnover counts, trade direction — and
// the scoring is arithmetic over those facts. Where a narrative summary is
// produced it is explicitly labelled as management describing itself.
import { runAgent } from "./claude"

const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data"
const PROXY_BUDGET = 26000

function userAgent(): string {
  const ua = process.env.SEC_EDGAR_USER_AGENT
  if (!ua) throw new Error("SEC_EDGAR_USER_AGENT is not set — SEC requires it on every request.")
  return ua
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

// Leadership material clusters around different headings than governance
// structure does — biographies and ownership tables rather than pay policy.
function extractLeadershipSections(text: string): string {
  const anchors = [
    /executive officers of the (registrant|company)/i,
    /director since|has served as|joined the company in/i,
    /biograph|professional experience/i,
    /security ownership of (certain beneficial owners|management)/i,
    /beneficial ownership/i,
    /stock ownership guidelines|ownership requirement/i,
    /board leadership structure|lead independent director/i,
    /director independence/i,
  ]
  const windows: string[] = []
  for (const anchor of anchors) {
    const m = text.match(anchor)
    if (m?.index === undefined) continue
    windows.push(text.slice(Math.max(0, m.index - 300), m.index + 4000))
  }
  return (windows.length ? windows.join("\n\n---\n\n") : text).slice(0, PROXY_BUDGET)
}

export interface Executive {
  name: string
  role: string
  /** Years in the current role, where the filing states it. */
  tenureYears: number | null
  isFounder: boolean
  background: string
}

export interface LeadershipRead {
  ceoName: string | null
  ceoTenureYears: number | null
  ceoIsFounder: boolean
  executives: Executive[]
  /** Percentage of shares held by officers and directors as a group. */
  insiderOwnershipPct: number | null
  boardSize: number | null
  independentDirectors: number | null
  /** 0-100. Arithmetic over disclosed facts, not a character judgment. */
  leadershipScore: number
  strengths: string[]
  concerns: string[]
  summary: string
  riskPenalty: number
  flags: string[]
  sourceUrl: string
  filingDate: string
}

const LEADERSHIP_SYSTEM = `You extract facts about a company's leadership from its DEF 14A proxy statement.

Hard rules:
- Report ONLY what the document states. Never infer, never speculate, never use outside knowledge.
- A proxy is written by the company about itself. Extract disclosed FACTS (names, roles, dates, percentages), not the company's characterisation of its own executives.
- tenureYears: compute from a stated start date if one is given, else null. Never estimate.
- isFounder: true only if the document explicitly says the person founded or co-founded the company.
- insiderOwnershipPct: the "all directors and executive officers as a group" percentage from the beneficial ownership table. Null if not stated.
- background: one factual sentence of prior roles as the filing lists them. No adjectives about quality.
- Never output a price target, investment opinion, or advice.

Return ONLY valid JSON, no markdown fences.`

export async function readLeadership(
  cik: string,
  accessionNumber: string,
  primaryDocument: string,
  filingDate: string,
  insiderContext?: { buyCount90d: number; sellCount90d: number; clusterBuy: boolean } | null,
  execChangeCount?: number,
): Promise<LeadershipRead | null> {
  try {
    const cikNum = String(Number(cik.replace(/\D/g, "")))
    const accession = accessionNumber.replace(/-/g, "")
    const sourceUrl = `${SEC_ARCHIVES}/${cikNum}/${accession}/${primaryDocument}`

    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": userAgent(), Accept: "text/html" },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return null

    const text = htmlToText(await res.text())
    if (text.length < 3000) return null

    const raw = await runAgent(
      LEADERSHIP_SYSTEM,
      `Extract leadership facts from this DEF 14A filed ${filingDate}.

${extractLeadershipSections(text)}

Return JSON exactly in this shape:
{
  "ceoName": "full name or null",
  "ceoTenureYears": number or null,
  "ceoIsFounder": true or false,
  "executives": [{"name":"","role":"","tenureYears":null,"isFounder":false,"background":"one factual sentence"}],
  "insiderOwnershipPct": number or null,
  "boardSize": number or null,
  "independentDirectors": number or null,
  "summary": "2-3 sentences on who runs this company, stated as fact from the filing"
}

Cap executives at 6, most senior first.`,
      { maxTokens: 1800, jsonMode: true }
    )

    const p = typeof raw === "string" ? JSON.parse(raw.replace(/```json|```/g, "").trim()) : raw
    const num = (v: unknown): number | null =>
      typeof v === "number" && isFinite(v) ? v : null

    const executives: Executive[] = Array.isArray(p?.executives)
      ? (p.executives as Record<string, unknown>[]).slice(0, 6).map(e => ({
          name: String(e?.name ?? "").trim(),
          role: String(e?.role ?? "").trim(),
          tenureYears: num(e?.tenureYears),
          isFounder: e?.isFounder === true,
          background: String(e?.background ?? "").trim(),
        })).filter(e => e.name)
      : []

    const ceoTenureYears = num(p?.ceoTenureYears)
    const insiderOwnershipPct = num(p?.insiderOwnershipPct)
    const boardSize = num(p?.boardSize)
    const independentDirectors = num(p?.independentDirectors)
    const ceoIsFounder = p?.ceoIsFounder === true

    // ── Scoring: arithmetic over disclosed facts ─────────────────────────────
    let score = 60
    const strengths: string[] = []
    const concerns: string[] = []
    const flags: string[] = []
    let riskPenalty = 0

    // Tenure. Very short CEO tenure is not itself bad, but it means the
    // company's record was made by someone else — the track record you are
    // looking at is not theirs.
    if (ceoTenureYears !== null) {
      if (ceoTenureYears >= 10) {
        score += 12
        strengths.push(`The CEO has run the company for ${ceoTenureYears} years, so its long-run record is genuinely theirs to be judged on.`)
      } else if (ceoTenureYears >= 4) {
        score += 6
        strengths.push(`${ceoTenureYears} years in the role — long enough that recent results reflect their decisions.`)
      } else if (ceoTenureYears < 2) {
        concerns.push(`The CEO has been in post under ${ceoTenureYears < 1 ? "a year" : "two years"}, so the company's historical record was produced by different management and says little about them.`)
      }
    }

    if (ceoIsFounder) {
      score += 8
      strengths.push("The CEO founded the company — founder-led businesses typically carry a longer planning horizon and far larger personal stake.")
    }

    // Skin in the game. This is the single most informative leadership number
    // in the proxy: it is what management loses if they destroy value.
    if (insiderOwnershipPct !== null) {
      if (insiderOwnershipPct >= 10) {
        score += 15
        strengths.push(`Officers and directors hold ${insiderOwnershipPct}% of the company — a stake large enough that a bad decision costs them personally.`)
      } else if (insiderOwnershipPct >= 3) {
        score += 7
        strengths.push(`Insiders hold ${insiderOwnershipPct}%, a meaningful personal stake.`)
      } else if (insiderOwnershipPct < 1) {
        score -= 10
        riskPenalty += 5
        concerns.push(`Officers and directors together own only ${insiderOwnershipPct}% of the company, so management's personal downside from destroying value is small.`)
        flags.push(`⚠ Insider ownership is just ${insiderOwnershipPct}% — leadership has limited financial exposure to their own decisions.`)
      }
    }

    // Board independence — who can actually say no to the CEO.
    if (boardSize !== null && independentDirectors !== null && boardSize > 0) {
      const pct = (independentDirectors / boardSize) * 100
      if (pct >= 75) {
        score += 8
        strengths.push(`${independentDirectors} of ${boardSize} directors are independent, so the board can credibly overrule management.`)
      } else if (pct < 50) {
        score -= 12
        riskPenalty += 8
        concerns.push(`Only ${independentDirectors} of ${boardSize} directors are independent — the board may not be able to check the executives it is meant to supervise.`)
        flags.push(`⚠ Board is less than half independent (${independentDirectors}/${boardSize}).`)
      }
    }

    // Turnover. One departure is noise; a cluster is a pattern, and the 8-K
    // count already computed by lib/live-events.ts is the honest source.
    if (typeof execChangeCount === "number" && execChangeCount >= 4) {
      score -= 12
      riskPenalty += 8
      concerns.push(`${execChangeCount} separate executive or director changes were filed in the past year — unusual churn at the top, which usually precedes or follows a problem.`)
      flags.push(`⚠ ${execChangeCount} executive/director changes in twelve months.`)
    }

    // What the best-informed people are doing with their own money.
    if (insiderContext) {
      const { buyCount90d, sellCount90d, clusterBuy } = insiderContext
      if (clusterBuy) {
        score += 10
        strengths.push("Several insiders bought stock in the open market within the same window — the one insider signal with real documented predictive value, since there are many reasons to sell and only one to buy.")
      } else if (sellCount90d > 0 && buyCount90d === 0 && sellCount90d >= 4) {
        concerns.push(`${sellCount90d} insider sales and no purchases in the last 90 days. Sales alone are weak evidence — scheduled 10b5-1 plans and tax bills explain most of them — but a complete absence of buying is worth noting.`)
      }
    }

    score = Math.max(0, Math.min(100, score))

    return {
      ceoName: typeof p?.ceoName === "string" && p.ceoName.trim() ? p.ceoName.trim() : null,
      ceoTenureYears, ceoIsFounder, executives,
      insiderOwnershipPct, boardSize, independentDirectors,
      leadershipScore: score, strengths, concerns,
      summary: typeof p?.summary === "string" ? p.summary : "",
      riskPenalty, flags, sourceUrl, filingDate,
    }
  } catch {
    return null
  }
}
