// Shared adapter — converts a FreeLead (public-record scraped) into a
// ForeclosureLead (scored, with deal calc) without requiring ATTOM data.
// Used by both the /foreclosure-search route and the new /deep-search route.

import {
  computeScore,
  computeDealCalc,
  type ForeclosureLead,
} from "@/lib/agents/foreclosure-agent"
import { plainEnglishReason, daysUntil } from "@/lib/lead-intelligence"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

export function freeLeadToForeclosureLead(fl: FreeLead): ForeclosureLead {
  // Fold any discovered junior liens into the debt picture so the deal math
  // (max offer, equity available, profit) reflects what's really owed.
  const juniorLiens   = fl.juniorLiens ?? []
  const juniorTotal   = juniorLiens.reduce((sum, l) => sum + (l.amount ?? 0), 0)
  const totalLiens    = (fl.defaultAmount ?? 0) + juniorTotal
  const lienCount     = (fl.defaultAmount ? 1 : 0) + juniorLiens.length

  // Tax distress: a tax lien or an explicit tax-delinquent signal sets the flag
  // that powers the "Tax Delq" filter and scoring bonus.
  const taxDelinquent =
    juniorLiens.some(l => l.type === "tax_lien") ||
    (fl.rawSignals ?? []).some(s => /tax delinquen|tax default/i.test(s))

  const partial = {
    attomId:           Math.abs(hashStr(fl.address + (fl.city ?? ""))),
    address:           fl.address,
    city:              fl.city,
    state:             fl.state,
    zip:               fl.zip,
    ownerName:         fl.ownerName || "Owner Unknown",
    ownerName2:        null,
    ownerType:         "individual" as const,
    isAbsentee:        fl.occupancy === "absentee",
    mailingAddress:    null,
    yearsOwned:        null,
    phone:             fl.phone ?? null,
    email:             fl.email ?? null,
    linkedInUrl:       null,
    contactConfidence: fl.contactConfidence ?? (fl.phone ? ("medium" as const) : null),
    foreclosureType:   fl.foreclosureStage,
    foreclosureStage:  fl.foreclosureStage,
    recordingDate:     fl.recordingDate,
    daysOnFile:        fl.recordingDate
      ? Math.floor((Date.now() - new Date(fl.recordingDate).getTime()) / 86400000)
      : 0,
    defaultAmount:   fl.defaultAmount,
    lender:          fl.lender,
    auctionDate:     fl.auctionDate,
    estimatedValue:  fl.estimatedValue,
    avmValue:        fl.valuationSource ? fl.estimatedValue : null,
    avmConfidence:   fl.avmConfidence ?? null,
    purchasePrice:   null,
    purchaseDate:    null,
    totalLiens,
    lienCount,
    estimatedEquity: null,
    equityPercent:   null,
    taxDelinquent,
    propertyType:    null,
    beds:            null,
    baths:           null,
    sqft:            null,
    yearBuilt:       null,
    lotSize:         null,
    dealCalc:        null,
    outreach:        null,
    // Optional intelligence pass-through
    rentEstimate:     fl.rentEstimate ?? null,
    rentToValue:      fl.rentEstimate && fl.estimatedValue
      ? Math.round((fl.rentEstimate * 12 / fl.estimatedValue) * 1000) / 10
      : null,
    valuationSource:  fl.valuationSource ?? null,
    comps:            fl.comps,
    juniorLiens:      juniorLiens.length ? juniorLiens : undefined,
    occupancy:        fl.occupancy ?? null,
    daysUntilAuction: fl.daysUntilAuction ?? daysUntil(fl.auctionDate),
    phones:           fl.phones,
    emails:           fl.emails,
    relatives:        fl.relatives,
  }

  const { score, priority, breakdown, signals } = computeScore(partial)
  const dealCalc = fl.estimatedValue
    ? computeDealCalc({
        ...partial,
        score,
        priority,
        scoreBreakdown: breakdown,
        scoreReason:    "",
        distressSignals: signals,
      })
    : null

  const scoreReason = plainEnglishReason({
    priority,
    score,
    foreclosureStage: partial.foreclosureStage,
    daysOnFile:       partial.daysOnFile,
    equityPercent:    partial.equityPercent,
    estimatedEquity:  partial.estimatedEquity,
    defaultAmount:    partial.defaultAmount,
    daysUntilAuction: partial.daysUntilAuction,
    occupancy:        partial.occupancy,
    juniorLiens,
    fallbackSignals:  signals.length ? signals : fl.rawSignals,
  })

  return {
    ...partial,
    score,
    priority,
    scoreBreakdown:  breakdown,
    scoreReason,
    distressSignals: [...signals.slice(0, 4), ...(fl.rawSignals?.slice(0, 2) ?? [])],
    dealCalc,
  }
}
