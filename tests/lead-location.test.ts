// Searching a place must return that place.
//
// Reported directly: "when I'm searching something like the zip code it needs
// to go to that specific zip code, it doesn't, it goes to random places."
// Three separate defects produced that, and each is pinned here.
import { describe, it, expect } from "vitest"
import { looksLikeAddress } from "@/lib/direct-foreclosure-sources"
import { ZIP_RADIUS_MILES } from "@/lib/geocoding"

describe("a ZIP search covers a ZIP, not a county", () => {
  it("uses a radius a postcode could plausibly span", () => {
    // Eight miles gave a 16-mile-square box around the centroid, which covers
    // dozens of neighbouring ZIPs — searching 85003 in downtown Phoenix
    // returned properties eight miles out in other postcodes entirely.
    expect(ZIP_RADIUS_MILES).toBeLessThanOrEqual(4)
    expect(ZIP_RADIUS_MILES).toBeGreaterThan(0)
  })
})

describe("page copy is not an address", () => {
  it("rejects the marketing text Bid4Assets was contributing as leads", () => {
    // These reached the user as leads, because they happened to start with a digit.
    expect(looksLikeAddress("1 No Reserve Auctions, car auctions,")).toBe(false)
    expect(looksLikeAddress("000 properties and grossed over a billion dollars in auction sales")).toBe(false)
    expect(looksLikeAddress("1 No Reserve Auctions")).toBe(false)
  })

  it("accepts the real addresses from the same search", () => {
    for (const a of ["1763 Upper Chelsea Rd", "4441 Olentangy River Rd", "69-71 S Champion Ave",
                     "923-925 Bluffway Dr", "2543 Rosedale Ave", "5100 E Rancho Paloma Dr #2052"]) {
      expect(looksLikeAddress(a)).toBe(true)
    }
  })

  it("rejects anything without a street number", () => {
    expect(looksLikeAddress("Main Street")).toBe(false)
    expect(looksLikeAddress("Parcel 12-345-678")).toBe(false)
  })

  it("rejects a number with no street name after it", () => {
    expect(looksLikeAddress("12345")).toBe(false)
    expect(looksLikeAddress("000")).toBe(false)
  })

  it("rejects a sentence, however it begins", () => {
    expect(looksLikeAddress("100 of the best places to buy a home this year in America")).toBe(false)
  })

  it("handles empty and missing values", () => {
    expect(looksLikeAddress("")).toBe(false)
    expect(looksLikeAddress(null)).toBe(false)
    expect(looksLikeAddress(undefined)).toBe(false)
  })
})
