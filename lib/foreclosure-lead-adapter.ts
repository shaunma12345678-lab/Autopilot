// Shared adapter — converts a FreeLead (public-record scraped) into a
// ForeclosureLead (scored, with deal calc) without requiring ATTOM data.
// Used by both the /foreclosure-search route and the new /deep-search route.

import {
  computeScore,
  computeDealCalc,
  type ForeclosureLead,
} from "@/lib/agents/foreclosure-agent"
import type { FreeLead } from "@/lib/free-foreclosure-scraper"

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

export function freeLeadToForeclosureLead(fl: FreeLead): ForeclosureLead {
  const partial = {
    attomId:           Math.abs(hashStr(fl.address + (fl.city ?? ""))),
    address:           fl.address,
    city:              fl.city,
    state:             fl.state,
    zip:               fl.zip,
    ownerName:         fl.ownerName || "Owner Unknown",
    ownerName2:        null,
    ownerType:         "individual" as const,
    isAbsentee:        false,
    mailingAddress:    null,
    yearsOwned:        null,
    phone:             null,
    email:             null,
    linkedInUrl:       null,
    contactConfidence: null,
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
    avmValue:        null,
    avmConfidence:   null,
    purchasePrice:   null,
    purchaseDate:    null,
    totalLiens:      fl.defaultAmount ?? 0,
    lienCount:       fl.defaultAmount ? 1 : 0,
    estimatedEquity: null,
    equityPercent:   null,
    taxDelinquent:   false,
    propertyType:    null,
    beds:            null,
    baths:           null,
    sqft:            null,
    yearBuilt:       null,
    lotSize:         null,
    dealCalc:        null,
    outreach:        null,
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

  return {
    ...partial,
    score,
    priority,
    scoreBreakdown:  breakdown,
    scoreReason:     signals[0] ?? fl.rawSignals?.[0] ?? "Pre-foreclosure public record",
    distressSignals: [...signals.slice(0, 4), ...(fl.rawSignals?.slice(0, 2) ?? [])],
    dealCalc,
  }
}
