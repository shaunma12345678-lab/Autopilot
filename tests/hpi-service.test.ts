// Our own house-price-index service.
//
// This exists because the appreciation criterion is 8 of the rubric's 100
// points and had no source, so no market could climb past the high forties.
// The tests cover the two things that actually went wrong while building it:
// reading the CSV row from the wrong end, and matching a city to a metro label
// that is never spelled the way the city is.
import { describe, it, expect } from "vitest"
import {
  matchMetro, cagrFromSeries, MIN_PLAUSIBLE_CAGR, MAX_PLAUSIBLE_CAGR,
  type HpiPoint,
} from "@/lib/hpi-service"

// Real labels, copied from the live file.
const LABELS = [
  "Columbus, OH",
  "Columbus, GA-AL",
  "Sherman-Denison, TX",
  "Sioux City, IA-NE-SD",
  "Fort Worth-Arlington-Grapevine, TX (MSAD)",
  "Dallas-Plano-Irving, TX (MSAD)",
  "Knoxville, TN",
  "Twin Falls, ID",
  "Morgantown, WV",
]

describe("matching a city to the metro label FHFA actually uses", () => {
  it("matches an exact city label", () => {
    expect(matchMetro(LABELS, "Columbus", "OH")).toBe("Columbus, OH")
  })

  it("does not cross state lines for a city name shared by two states", () => {
    // Columbus exists in OH and in the GA-AL metro. The state decides.
    expect(matchMetro(LABELS, "Columbus", "GA")).toBe("Columbus, GA-AL")
  })

  it("matches a city that leads a hyphenated metro", () => {
    expect(matchMetro(LABELS, "Sherman", "TX")).toBe("Sherman-Denison, TX")
  })

  it("matches a metro spanning several states", () => {
    expect(matchMetro(LABELS, "Sioux City", "IA")).toBe("Sioux City, IA-NE-SD")
    expect(matchMetro(LABELS, "Sioux City", "NE")).toBe("Sioux City, IA-NE-SD")
  })

  it("matches a city inside a long divisional label", () => {
    expect(matchMetro(LABELS, "Fort Worth", "TX")).toBe("Fort Worth-Arlington-Grapevine, TX (MSAD)")
  })

  it("matches a city that is not the first name in the metro", () => {
    expect(matchMetro(LABELS, "Plano", "TX")).toBe("Dallas-Plano-Irving, TX (MSAD)")
  })

  it("returns null rather than a near-miss for a city with no metro", () => {
    // The index is metropolitan, so small places are genuinely absent — and
    // saying so is better than attaching a neighbouring metro's appreciation.
    expect(matchMetro(LABELS, "Hattiesburg", "MS")).toBeNull()
  })

  it("is case-insensitive on both city and state", () => {
    expect(matchMetro(LABELS, "kNoXvIlLe", "tn")).toBe("Knoxville, TN")
  })
})

describe("compound growth over the index", () => {
  const series = (from: number, to: number, quarters = 13): HpiPoint[] => {
    const out: HpiPoint[] = []
    for (let i = 0; i < quarters; i++) {
      const t = i / (quarters - 1)
      out.push({ year: 2023 + Math.floor(i / 4), quarter: (i % 4) + 1, index: from + (to - from) * t })
    }
    return out
  }

  it("computes a three-year rate against the same quarter", () => {
    // 100 -> 133.1 over three years is exactly 10%/yr.
    const points = series(100, 133.1)
    const r = cagrFromSeries(points)!
    expect(r.cagr).toBeGreaterThan(9.9)
    expect(r.cagr).toBeLessThan(10.1)
    expect(r.span).toBe("2023Q1→2026Q1")
  })

  it("refuses a series too short to span three years", () => {
    expect(cagrFromSeries(series(100, 120, 8))).toBeNull()
  })

  it("refuses a rate no housing market produces", () => {
    // A rebased index looks like a 10,000% year and would score full marks.
    const absurd: HpiPoint[] = []
    for (let i = 0; i < 13; i++) absurd.push({ year: 2023 + Math.floor(i / 4), quarter: (i % 4) + 1, index: i === 12 ? 100_000 : 100 })
    expect(cagrFromSeries(absurd)).toBeNull()
    expect(MAX_PLAUSIBLE_CAGR).toBeLessThan(100)
    expect(MIN_PLAUSIBLE_CAGR).toBeGreaterThan(-100)
  })

  it("handles a falling market without refusing it", () => {
    const r = cagrFromSeries(series(100, 85))!
    expect(r.cagr).toBeLessThan(0)
    expect(r.cagr).toBeGreaterThan(MIN_PLAUSIBLE_CAGR)
  })

  it("returns null when the matching quarter three years back is missing", () => {
    const gapped = series(100, 130).filter(p => !(p.year === 2023 && p.quarter === 1))
    expect(cagrFromSeries(gapped)).toBeNull()
  })
})
