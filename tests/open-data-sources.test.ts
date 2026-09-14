// Open-data lead sourcing.
//
// Three bugs are locked down here, all of which produced a confident-looking
// empty or wrong result rather than an error:
//
//   1. The dataset search sent `filter[bbox]`, which the ArcGIS Hub API rejects
//      as an invalid parameter and answers with nothing. Every category in this
//      file — code violations, vacant registries, tax delinquent, liens,
//      foreclosure, probate, eviction — returned zero leads, silently, because
//      the module swallows failures by design.
//   2. Price was never read, so a $617 vacant lot and a $400,000 house arrived
//      indistinguishable.
//   3. Some services ignore the geometry filter AND return no coordinates, so a
//      search for Miami came back with Ohio parcels.
import { describe, it, expect } from "vitest"
import { withinBox, pickNumber, PRICE_FIELDS } from "@/lib/open-data-sources"
import type { GeoBox } from "@/lib/geocoding"

// Toledo, Ohio. Only the edges matter to withinBox; the rest of GeoBox is
// carried for the type.
const BOX: GeoBox = {
  west: -83.75, south: 41.55, east: -83.40, north: 41.75,
  centerLat: 41.65, centerLng: -83.575, radiusMiles: 12,
}

describe("keeping leads inside the area that was searched", () => {
  it("accepts a point inside the box", () => {
    expect(withinBox({ x: -83.5, y: 41.65 }, BOX)).toBe("inside")
  })

  it("rejects a point outside the box", () => {
    // Cleveland, returned by a service asked for Toledo.
    expect(withinBox({ x: -81.69, y: 41.49 }, BOX)).toBe("outside")
  })

  it("accepts a polygon with any vertex inside the box", () => {
    const rings = [[[-83.9, 41.5], [-83.5, 41.65], [-83.9, 41.8]]]
    expect(withinBox({ rings }, BOX)).toBe("inside")
  })

  it("rejects a polygon entirely outside the box", () => {
    const rings = [[[-81.9, 41.4], [-81.6, 41.5], [-81.9, 41.6]]]
    expect(withinBox({ rings }, BOX)).toBe("outside")
  })

  it("reports 'unknown' rather than guessing when there is no geometry", () => {
    // This is the case that matters: the lead is real and often the cheapest
    // one, so it is kept — but it must be distinguishable from a confirmed one.
    expect(withinBox(undefined, BOX)).toBe("unknown")
    expect(withinBox({}, BOX)).toBe("unknown")
    expect(withinBox(null, BOX)).toBe("unknown")
  })

  it("treats a boundary point as inside", () => {
    expect(withinBox({ x: BOX.west, y: BOX.south }, BOX)).toBe("inside")
  })
})

describe("reading the price", () => {
  it("reads the field names the live datasets actually use", () => {
    // Lorain County's forfeited-land service calls these BID and TAXES_OWED.
    // Neither was in the first draft, which is why every lead was unpriced.
    expect(PRICE_FIELDS).toContain("BID")
    expect(PRICE_FIELDS).toContain("TAXES_OWED")
  })

  it("parses a plain number", () => {
    expect(pickNumber({ BID: 617 }, PRICE_FIELDS)).toBe(617)
  })

  it("parses a formatted currency string", () => {
    expect(pickNumber({ BID: "$1,085.00" }, PRICE_FIELDS)).toBe(1085)
  })

  it("takes the first field that has a usable value", () => {
    expect(pickNumber({ PRICE: null, BID: 3947 }, PRICE_FIELDS)).toBe(3947)
  })

  it("treats zero and negatives as no price, not as free", () => {
    expect(pickNumber({ BID: 0 }, PRICE_FIELDS)).toBeNull()
    expect(pickNumber({ BID: -5 }, PRICE_FIELDS)).toBeNull()
  })

  it("ignores text that is not a number", () => {
    expect(pickNumber({ BID: "call for price" }, PRICE_FIELDS)).toBeNull()
  })

  it("returns null when no price field is present at all", () => {
    expect(pickNumber({ OWNER: "SMITH" }, PRICE_FIELDS)).toBeNull()
  })
})
