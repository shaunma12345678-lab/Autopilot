// Pre-foreclosure lead intelligence engine.
// 40-signal scoring model, personalized outreach generation, deal calculator.

import { runAgent } from "@/lib/claude"
import type { AttomForeclosureRecord, AttomPropertyBundle } from "@/lib/attom"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  equity: number        // 0-35: equity position & financial strength
  distress: number      // 0-25: depth of financial distress
  stage: number         // 0-20: urgency and timing
  owner: number         // 0-12: owner motivation signals
  property: number      // 0-8:  investability of the property
}

export interface DealCalc {
  arv: number                    // after-repair value
  estimatedRepairs: number
  maxOffer: number               // 70% rule: ARV × 0.70 - repairs
  totalDebt: number              // all open liens
  equityAvailable: number        // ARV - totalDebt
  potentialProfit: number        // maxOffer - totalDebt
  dealGrade: "A" | "B" | "C" | "D"  // A=excellent, D=marginal
}

export interface OutreachPackage {
  yellowLetter: string   // handwritten-style personal letter
  phoneScript: string    // opening 30-second phone script
  smsOpener: string      // ≤160 char text opener
}

export interface ForeclosureLead {
  attomId: number
  address: string
  city: string
  state: string
  zip: string
  // Owner
  ownerName: string
  ownerName2: string | null
  ownerType: "individual" | "corporate"
  isAbsentee: boolean
  mailingAddress: string | null
  yearsOwned: number | null
  // Contact (discovered)
  phone: string | null
  email: string | null
  linkedInUrl: string | null
  contactConfidence: "high" | "medium" | "low" | null
  // Foreclosure
  foreclosureType: string
  foreclosureStage: "NOTICE_OF_DEFAULT" | "LIS_PENDENS" | "NOTICE_OF_SALE" | "PRE_FORECLOSURE" | "AUCTION"
  recordingDate: string
  daysOnFile: number
  defaultAmount: number | null
  lender: string | null
  auctionDate: string | null
  // Finances
  estimatedValue: number | null     // best available value estimate
  avmValue: number | null           // ATTOM AVM (most accurate)
  avmConfidence: number | null
  purchasePrice: number | null
  purchaseDate: string | null
  totalLiens: number                // total open lien amount
  lienCount: number
  estimatedEquity: number | null
  equityPercent: number | null
  taxDelinquent: boolean
  // Property
  propertyType: string | null
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  lotSize: number | null
  // Scoring
  score: number
  priority: "HOT" | "WARM" | "COLD"
  scoreBreakdown: ScoreBreakdown
  scoreReason: string
  distressSignals: string[]
  // Deal & outreach (generated on demand)
  dealCalc: DealCalc | null
  outreach: OutreachPackage | null
}

// ─── Stage mapping ────────────────────────────────────────────────────────────

const STAGE_MAP: Record<string, ForeclosureLead["foreclosureStage"]> = {
  NOTICE_OF_DEFAULT: "NOTICE_OF_DEFAULT",
  NOD: "NOTICE_OF_DEFAULT",
  "NOTICE OF DEFAULT": "NOTICE_OF_DEFAULT",
  LIS_PENDENS: "LIS_PENDENS",
  LP: "LIS_PENDENS",
  "LIS PENDENS": "LIS_PENDENS",
  NOTICE_OF_SALE: "NOTICE_OF_SALE",
  NTS: "NOTICE_OF_SALE",
  NOS: "NOTICE_OF_SALE",
  "NOTICE OF SALE": "NOTICE_OF_SALE",
  AUCTION: "AUCTION",
}

function mapStage(raw: string): ForeclosureLead["foreclosureStage"] {
  return STAGE_MAP[raw.toUpperCase()] ?? "PRE_FORECLOSURE"
}

function daysFromDate(dateStr: string): number {
  if (!dateStr) return 0
  const filed = new Date(dateStr).getTime()
  if (isNaN(filed)) return 0
  return Math.floor((Date.now() - filed) / 86400000)
}

function yearsOwnedFrom(dateStr: string | null): number | null {
  if (!dateStr) return null
  const bought = new Date(dateStr).getTime()
  if (isNaN(bought)) return null
  return Math.floor((Date.now() - bought) / (365.25 * 86400000))
}

// ─── 40-Signal scoring model ──────────────────────────────────────────────────

export function computeScore(
  lead: Omit<ForeclosureLead, "score" | "priority" | "scoreBreakdown" | "scoreReason" | "distressSignals" | "dealCalc" | "outreach">
): { score: number; priority: ForeclosureLead["priority"]; breakdown: ScoreBreakdown; signals: string[] } {
  const signals: string[] = []
  const B: ScoreBreakdown = { equity: 0, distress: 0, stage: 0, owner: 0, property: 0 }

  const value = lead.avmValue ?? lead.estimatedValue ?? 0

  // ── A. Equity & Financial Position (max 35) ──────────────────────────────
  if (value > 0 && lead.estimatedEquity !== null) {
    const ep = lead.equityPercent ?? 0
    if (ep >= 50) {
      B.equity += 30
      signals.push(`${ep}% equity — exceptional cushion`)
    } else if (ep >= 35) {
      B.equity += 22
      signals.push(`${ep}% equity — strong position`)
    } else if (ep >= 20) {
      B.equity += 14
      signals.push(`${ep}% equity — room to negotiate`)
    } else if (ep >= 5) {
      B.equity += 6
      signals.push(`${ep}% equity — thin but workable`)
    } else if (ep < 0) {
      B.equity -= 10
      signals.push(`Negative equity — underwater property`)
    }

    // AVM confidence bonus
    if (lead.avmConfidence && lead.avmConfidence >= 75) {
      B.equity += 3
    }

    // Purchase price appreciation
    if (lead.purchasePrice && value > lead.purchasePrice * 1.5) {
      B.equity += 2
      signals.push(`Bought at $${(lead.purchasePrice / 1000).toFixed(0)}k — major appreciation`)
    }
  }

  // ── B. Depth of Distress (max 25) ────────────────────────────────────────
  if (lead.defaultAmount && value > 0) {
    const ratio = lead.defaultAmount / value
    if (ratio >= 0.2) {
      B.distress += 12
      signals.push(`$${(lead.defaultAmount / 1000).toFixed(0)}k default — severe (${Math.round(ratio * 100)}% of value)`)
    } else if (ratio >= 0.1) {
      B.distress += 7
      signals.push(`$${(lead.defaultAmount / 1000).toFixed(0)}k default — significant`)
    } else if (ratio >= 0.05) {
      B.distress += 3
      signals.push(`$${(lead.defaultAmount / 1000).toFixed(0)}k default amount`)
    }
  }

  if (lead.taxDelinquent) {
    B.distress += 6
    signals.push("Tax delinquent — compound distress")
  }

  if (lead.lienCount >= 3) {
    B.distress += 5
    signals.push(`${lead.lienCount} open liens — multiple creditors pressing`)
  } else if (lead.lienCount === 2) {
    B.distress += 2
    signals.push("2 open liens — dual pressure")
  }

  // Over-leveraged penalty
  if (value > 0 && lead.totalLiens > value * 0.95) {
    B.distress -= 8
    signals.push("Total debt exceeds 95% of value — limited equity deal")
  }

  // ── C. Stage & Timing (max 20) ───────────────────────────────────────────
  const stage = lead.foreclosureStage
  const days = lead.daysOnFile

  if (stage === "NOTICE_OF_DEFAULT") {
    B.stage += 18
    signals.push("Notice of Default — earliest stage, most negotiation time")
  } else if (stage === "LIS_PENDENS") {
    B.stage += 15
    signals.push("Lis Pendens — judicial process begun")
  } else if (stage === "NOTICE_OF_SALE") {
    B.stage += 10
    signals.push("Notice of Sale — auction coming, owner motivated")
  } else if (stage === "AUCTION") {
    B.stage += 5
    signals.push("Auction scheduled — urgent")
  } else {
    B.stage += 8
  }

  if (days <= 30) {
    B.stage += 2
    signals.push(`Filed ${days} days ago — very fresh filing`)
  } else if (days > 180) {
    B.stage -= 3
    signals.push(`Filed ${days} days ago — may have partially resolved`)
  }

  if (lead.auctionDate) {
    const auctionDays = daysFromDate(lead.auctionDate) * -1
    if (auctionDays > 0 && auctionDays <= 30) {
      B.stage -= 5
      signals.push(`Auction in ${auctionDays} days — very limited time`)
    }
  }

  // ── D. Owner Motivation (max 12) ─────────────────────────────────────────
  if (lead.isAbsentee) {
    B.owner += 8
    signals.push("Absentee owner — not living in property, likely investor/landlord distress")
  }

  if (lead.mailingAddress) {
    const mailState = lead.mailingAddress.slice(-10).match(/\b[A-Z]{2}\b/)?.[0]
    if (mailState && mailState !== lead.state) {
      B.owner += 4
      signals.push(`Owner mails to ${mailState} — out-of-state, distant from problem`)
    }
  }

  if (lead.ownerType === "individual") {
    B.owner += 3
    signals.push("Individual owner — emotional, more likely to negotiate")
  } else if (lead.ownerType === "corporate") {
    signals.push("LLC/corporate owner — business decision, less emotional")
  }

  if (lead.yearsOwned !== null) {
    if (lead.yearsOwned >= 10) {
      B.owner += 4
      signals.push(`Owned ${lead.yearsOwned} years — significant equity built, can take discount and still win`)
    } else if (lead.yearsOwned >= 5) {
      B.owner += 2
    } else if (lead.yearsOwned !== null && lead.yearsOwned < 3) {
      B.owner -= 2
      signals.push(`Only owned ${lead.yearsOwned} years — limited equity, less room for discount`)
    }
  }

  // ── E. Property Investability (max 8) ────────────────────────────────────
  const type = (lead.propertyType ?? "").toUpperCase()
  if (type.includes("SFR") || type.includes("SINGLE") || type.includes("RESIDENTIAL")) {
    B.property += 5
    signals.push("Single-family — most liquid exit, easiest to sell/flip/rent")
  } else if (type.includes("MULTI") || type.includes("DUPLEX") || type.includes("TRIPLEX")) {
    B.property += 3
    signals.push("Multi-family — income property opportunity")
  }

  if (value >= 100000 && value <= 750000) {
    B.property += 3
    signals.push(`$${Math.round(value / 1000)}k value — strong buyer pool range`)
  } else if (value < 100000) {
    signals.push("Sub-$100k value — limited buyer pool")
  }

  if (lead.yearBuilt && lead.yearBuilt < 1985) {
    B.property += 2
    signals.push(`Built ${lead.yearBuilt} — older home signals rehab discount opportunity`)
  }

  if (lead.sqft && lead.sqft >= 1000) B.property += 1

  // ── Final score ───────────────────────────────────────────────────────────
  // Cap each category to avoid exceeding limits, then sum
  B.equity = Math.max(-15, Math.min(35, B.equity))
  B.distress = Math.max(-10, Math.min(25, B.distress))
  B.stage = Math.max(0, Math.min(20, B.stage))
  B.owner = Math.max(-5, Math.min(12, B.owner))
  B.property = Math.max(0, Math.min(8, B.property))

  const rawScore = B.equity + B.distress + B.stage + B.owner + B.property
  // Map from [-30, 100] range to [0, 100]
  const score = Math.max(0, Math.min(100, Math.round(((rawScore + 30) / 130) * 100)))

  const priority: ForeclosureLead["priority"] =
    score >= 70 ? "HOT" : score >= 45 ? "WARM" : "COLD"

  return { score, priority, breakdown: B, signals }
}

// ─── Deal calculator ──────────────────────────────────────────────────────────

export function computeDealCalc(lead: ForeclosureLead): DealCalc {
  const arv = lead.avmValue ?? lead.estimatedValue ?? 0
  const sqft = lead.sqft ?? 1500
  const age = lead.yearBuilt ? new Date().getFullYear() - lead.yearBuilt : 30

  let repairsPerSqft: number
  if (age <= 10) repairsPerSqft = 8
  else if (age <= 25) repairsPerSqft = 18
  else if (age <= 40) repairsPerSqft = 30
  else repairsPerSqft = 45

  const estimatedRepairs = Math.min(
    Math.max(Math.round((sqft * repairsPerSqft) / 1000) * 1000, 8000),
    120000
  )
  const maxOffer = Math.max(0, Math.round(arv * 0.7 - estimatedRepairs))
  const totalDebt = lead.totalLiens
  const equityAvailable = Math.max(0, arv - totalDebt)
  const closingCosts = Math.round(maxOffer * 0.03)
  const potentialProfit = Math.max(0, maxOffer - totalDebt - closingCosts)

  let dealGrade: DealCalc["dealGrade"]
  const profitMargin = arv > 0 ? potentialProfit / arv : 0
  if (profitMargin >= 0.2 && equityAvailable > 50000) dealGrade = "A"
  else if (profitMargin >= 0.12) dealGrade = "B"
  else if (profitMargin >= 0.06) dealGrade = "C"
  else dealGrade = "D"

  return {
    arv,
    estimatedRepairs,
    maxOffer,
    totalDebt,
    equityAvailable,
    potentialProfit,
    dealGrade,
  }
}

// ─── Outreach generator ───────────────────────────────────────────────────────

const OUTREACH_SYSTEM = `You are a real estate investor who specializes in helping homeowners in financial distress.
Your outreach is empathetic, specific, and human — never salesy. You understand that the homeowner is
under extreme stress and may lose their home. You communicate with respect and a genuine desire to help.
Return valid JSON only.`

export type OutreachStyle = "empathetic" | "direct" | "professional"

const STYLE_INSTRUCTIONS: Record<OutreachStyle, string> = {
  empathetic: `Tone: warm, personal, understanding. Lead with empathy for what they're going through.
Never mention "investment" or "profit." Frame everything as help, not a transaction.
Use short paragraphs. Sound like a neighbor who cares.`,

  direct: `Tone: confident, clear, no fluff. Lead with the offer. State the dollar value up front.
"I buy houses fast, all cash, any condition, in 7 days."
Cut the emotional language — focus on speed, certainty, and cash.
3-4 punchy paragraphs max.`,

  professional: `Tone: formal, professional, respectful. Use formal salutation ("Dear Mr./Ms. [Last Name]").
Include a brief disclaimer that they are under no obligation to respond.
Reference that you are a licensed/experienced real estate professional.
State offer terms clearly (subject to inspection, cash, quick close).
Professional closing with full contact block.`,
}

export async function generateOutreach(
  lead: ForeclosureLead,
  style: OutreachStyle = "empathetic"
): Promise<OutreachPackage> {
  const stageDesc = {
    NOTICE_OF_DEFAULT: "received a notice of default and are behind on mortgage payments",
    LIS_PENDENS: "have a foreclosure lawsuit filed against them",
    NOTICE_OF_SALE: "have a notice of sale filed — their home is scheduled for auction",
    AUCTION: "have their home listed for foreclosure auction",
    PRE_FORECLOSURE: "are in the pre-foreclosure process",
  }[lead.foreclosureStage]

  const equityNote =
    lead.equityPercent !== null && lead.equityPercent > 10
      ? `They likely have about ${lead.equityPercent}% equity (roughly $${Math.round((lead.estimatedEquity ?? 0) / 1000)}k).`
      : ""

  const daysNote = lead.daysOnFile > 0 ? `The filing was recorded ${lead.daysOnFile} days ago.` : ""
  const absenteeNote = lead.isAbsentee
    ? "They do not appear to live at the property."
    : "They appear to live at the property."

  const user = `Generate personalized real estate investor outreach for this homeowner.

Property: ${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}
Owner: ${lead.ownerName}${lead.ownerName2 ? ` / ${lead.ownerName2}` : ""}
Situation: The owner has ${stageDesc}. ${daysNote}
${equityNote}
${absenteeNote}
Lender: ${lead.lender ?? "unknown"}
${lead.defaultAmount ? `Missed payment amount: $${lead.defaultAmount.toLocaleString()}` : ""}
${lead.beds ? `Property: ${lead.beds}bd/${lead.baths}ba, built ${lead.yearBuilt ?? "unknown"}` : ""}

STYLE INSTRUCTIONS — apply to all three pieces below:
${STYLE_INSTRUCTIONS[style]}

Generate:

1. YELLOW LETTER (250-320 words): Written in the style above.
   - Address owner by first name if possible (parse from ${lead.ownerName})
   - Reference SPECIFIC details: their address, their foreclosure stage, default amount if known
   - If they have equity, name the dollar amount they stand to lose to foreclosure
   - Include your contact info as [YOUR NAME] and [YOUR PHONE]
   - DO NOT sound like a template — every sentence should feel written for THIS person

2. PHONE SCRIPT (opening 30 seconds): Match the same style/tone.
   - Start with their first name
   - Reference the specific situation (stage, address)
   - End with a soft open-ended question
   - Do NOT read from a script — sound natural

3. SMS OPENER (under 160 chars): Punchy, matches the style.
   - Reference address or situation
   - One clear call to action or question
   - Sign with [YOUR NAME]

Return JSON:
{
  "yellowLetter": "full letter text",
  "phoneScript": "full script",
  "smsOpener": "text message"
}`

  try {
    const result = (await runAgent(OUTREACH_SYSTEM, user, {
      jsonMode: true,
      maxTokens: 3000,
    })) as unknown as OutreachPackage

    return {
      yellowLetter: result.yellowLetter ?? "",
      phoneScript: result.phoneScript ?? "",
      smsOpener: result.smsOpener ?? "",
    }
  } catch {
    // Fallback if AI call fails
    const firstName = lead.ownerName.split(/[\s,]+/)[0] || "Homeowner"
    return {
      yellowLetter: `Dear ${firstName},\n\nI noticed your property at ${lead.address} in ${lead.city} and wanted to reach out directly. I understand you may be going through a difficult time with your mortgage.\n\nI'm a local real estate investor who specializes in helping homeowners in situations like yours. I can purchase your home quickly — often in as little as 7 days — without the hassle of listings, showings, or waiting for bank approval.\n\nIf you have equity in your home, you don't have to lose it to foreclosure. I can often pay off your loan balance and put additional cash in your pocket.\n\nThere's absolutely no obligation to call. I'd just love to have a conversation and see if I can help.\n\nPlease call or text me anytime at [YOUR PHONE].\n\nSincerely,\n[YOUR NAME]`,
      phoneScript: `Hi, is this ${firstName}? My name is [YOUR NAME] — I'm a local real estate investor. I know this might come out of the blue, but I saw that your property at ${lead.address} is in the foreclosure process and I wanted to reach out personally. I've helped other homeowners in similar situations find a way out that works for them. Do you have just a few minutes to talk?`,
      smsOpener: `Hi ${firstName}, I'm [YOUR NAME] — I help homeowners near ${lead.address} avoid foreclosure. Can I share a quick option that might help? No pressure.`,
    }
  }
}

// ─── Build lead from raw data ─────────────────────────────────────────────────

export function buildForeclosureLead(
  record: AttomForeclosureRecord,
  bundle: AttomPropertyBundle,
  contact?: { phone: string | null; email: string | null; linkedInUrl: string | null; confidence: "high" | "medium" | "low" }
): ForeclosureLead {
  const { detail, avm, saleHistory, liens } = bundle

  const avmValue = avm?.value ?? null
  const assessedValue = detail?.assessedValue ?? null
  const estimatedValue = avmValue ?? assessedValue ?? null

  const totalLiens = liens?.totalOpenAmount ?? (record.loanAmount ?? 0)
  const lienCount = liens?.count ?? (record.loanAmount ? 1 : 0)

  const estimatedEquity =
    estimatedValue !== null ? estimatedValue - totalLiens : null
  const equityPercent =
    estimatedValue && estimatedValue > 0 && estimatedEquity !== null
      ? Math.round((estimatedEquity / estimatedValue) * 100)
      : null

  const mailingParts = [
    detail?.mailingAddress,
    detail?.mailingCity,
    detail?.mailingState,
    detail?.mailingZip,
  ].filter(Boolean)

  const yearsOwned = yearsOwnedFrom(saleHistory?.lastSaleDate ?? null)
  const daysOnFile = daysFromDate(record.recordingDate)

  const partialLead = {
    attomId: record.attomId,
    address: record.address,
    city: record.city,
    state: record.state,
    zip: record.zip,
    ownerName: detail?.ownerName ?? "Unknown Owner",
    ownerName2: detail?.ownerName2 ?? null,
    ownerType: detail?.ownerType ?? "individual",
    isAbsentee: detail?.isAbsentee ?? false,
    mailingAddress: mailingParts.length ? mailingParts.join(", ") : null,
    yearsOwned,
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    linkedInUrl: contact?.linkedInUrl ?? null,
    contactConfidence: contact?.confidence ?? null,
    foreclosureType: record.foreclosureType,
    foreclosureStage: mapStage(record.foreclosureType),
    recordingDate: record.recordingDate,
    daysOnFile,
    defaultAmount: record.defaultAmount,
    lender: record.lender,
    auctionDate: record.auctionDate,
    estimatedValue,
    avmValue,
    avmConfidence: avm?.confidence ?? null,
    purchasePrice: saleHistory?.lastSalePrice ?? null,
    purchaseDate: saleHistory?.lastSaleDate ?? null,
    totalLiens,
    lienCount,
    estimatedEquity,
    equityPercent,
    taxDelinquent: detail?.taxDelinquent ?? false,
    propertyType: detail?.propertyType ?? null,
    beds: detail?.beds ?? null,
    baths: detail?.baths ?? null,
    sqft: detail?.sqft ?? null,
    yearBuilt: detail?.yearBuilt ?? null,
    lotSize: detail?.lotSize ?? null,
    dealCalc: null,
    outreach: null,
  }

  const { score, priority, breakdown, signals } = computeScore(partialLead)
  const dealCalc = estimatedValue && estimatedValue > 0 ? computeDealCalc({ ...partialLead, score, priority, scoreBreakdown: breakdown, scoreReason: "", distressSignals: signals }) : null

  return {
    ...partialLead,
    score,
    priority,
    scoreBreakdown: breakdown,
    scoreReason: signals[0] ?? "Pre-foreclosure public filing",
    distressSignals: signals.slice(0, 6),
    dealCalc,
  }
}
