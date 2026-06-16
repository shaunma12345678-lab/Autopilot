// Our OWN comparable-sales engine — computes an ARV and a comp set from the
// properties we already pulled for the area, with zero external API. The more
// the area returns, the sharper the model. Pure, synchronous, null-safe.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export type Comp = { address: string; price: number; sqft: number | null; soldDate: string | null }

function median(ns: number[]): number | null {
  const a = ns.filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

const valueOf = (l: ForeclosureLead): number => l.avmValue ?? l.estimatedValue ?? 0

export interface AreaModel { psf: number | null; medianValue: number | null; sampleSize: number }

export function areaModel(leads: ForeclosureLead[]): AreaModel {
  const valued = leads.filter((l) => valueOf(l) > 0)
  const psf = median(valued.filter((l) => l.sqft && l.sqft > 200).map((l) => valueOf(l) / l.sqft!))
  return { psf, medianValue: median(valued.map(valueOf)), sampleSize: valued.length }
}

// Nearest comps for a subject — same ZIP/city, ranked by value (then sqft)
// similarity. Returns properties we actually have, not invented ones.
export function nearestComps(subject: ForeclosureLead, leads: ForeclosureLead[], n = 4): Comp[] {
  const subVal = valueOf(subject)
  const subSqft = subject.sqft ?? 0
  const cands = leads.filter((l) =>
    l.attomId !== subject.attomId && valueOf(l) > 0 &&
    (String(l.zip) === String(subject.zip) || (l.city && l.city === subject.city)),
  )
  cands.sort((a, b) => {
    const av = subVal ? Math.abs(valueOf(a) - subVal) : 0
    const bv = subVal ? Math.abs(valueOf(b) - subVal) : 0
    if (av !== bv) return av - bv
    const asq = subSqft ? Math.abs((a.sqft ?? 0) - subSqft) : 0
    const bsq = subSqft ? Math.abs((b.sqft ?? 0) - subSqft) : 0
    return asq - bsq
  })
  return cands.slice(0, n).map((l) => ({ address: l.address, price: valueOf(l), sqft: l.sqft ?? null, soldDate: null }))
}

// Fill a computed ARV (when a lead has no value) and a comp set (when it has
// none) across the whole result set — instant, no network. Returns a new array.
export function fillComps(leads: ForeclosureLead[]): ForeclosureLead[] {
  if (!leads.length) return leads
  const model = areaModel(leads)
  return leads.map((l) => {
    const patch: Partial<ForeclosureLead> = {}
    if (valueOf(l) <= 0) {
      const v = l.sqft && l.sqft > 200 && model.psf ? Math.round(l.sqft * model.psf) : model.medianValue
      if (v && v > 0) { patch.estimatedValue = v; patch.valuationSource = "Area comp model" }
    }
    if (!l.comps || l.comps.length === 0) {
      const comps = nearestComps(l, leads, 4)
      if (comps.length) patch.comps = comps
    }
    return Object.keys(patch).length ? ({ ...l, ...patch }) : l
  })
}
