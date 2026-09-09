// Protocol resolution — the bug this locks down returned NULL for Uniswap,
// Curve, Optimism and Arbitrum while appearing to work, because Aave and Lido
// happened to match by coincidence. Nothing distinguished the coincidences from
// the failures, so four of the largest protocols in DeFi scored with no revenue
// and no unlock schedule and looked exactly like protocols that have neither.
import { describe, it, expect } from "vitest"
import { selectProtocolFamily, type ProtocolListEntry } from "@/lib/defillama-client"

// Shaped exactly like the live /protocols response, trimmed to what matters.
const LIST: ProtocolListEntry[] = [
  { slug: "uniswap-v3", name: "Uniswap V3", symbol: "UNI", parent: "parent#uniswap", tvl: 1_587_342_751 },
  { slug: "uniswap-v4", name: "Uniswap V4", symbol: "UNI", parent: "parent#uniswap", tvl: 1_080_600_181 },
  { slug: "uniswap-v2", name: "Uniswap V2", symbol: "UNI", parent: "parent#uniswap", tvl: 979_106_502 },
  { slug: "aave-v3", name: "Aave V3", symbol: "AAVE", parent: "parent#aave", tvl: 17_553_810_164 },
  { slug: "aave-v2", name: "Aave V2", symbol: "AAVE", parent: "parent#aave", tvl: 110_987_523 },
  { slug: "lido", name: "Lido", symbol: "LDO", parent: null, tvl: 24_114_496_589 },
  { slug: "curve-dex", name: "Curve DEX", symbol: "CRV", parent: "parent#curve-finance", tvl: 1_289_780_058 },
  { slug: "curve-llamalend", name: "Curve LlamaLend", symbol: "CRV", parent: "parent#curve-finance", tvl: 77_606_680 },
  { slug: "crosscurve", name: "CrossCurve", symbol: "EYWA", parent: null, tvl: 57_417 },
  { slug: "arbitrum-bridge", name: "Arbitrum Bridge", symbol: "ARB", parent: "parent#arbitrum-foundation", tvl: 3_266_312_038 },
  { slug: "chainlink-staking", name: "Chainlink Staking", symbol: "LINK", parent: "parent#chainlink", tvl: 0 },
  { slug: "ccip", name: "CCIP", symbol: "LINK", parent: "parent#chainlink", tvl: null },
  { slug: "bitcoin", name: "Bitcoin", symbol: "BTC", parent: null, tvl: 0 },
]

describe("versioned protocols — the case that silently returned null", () => {
  it("resolves Uniswap even though no protocol is called exactly that", () => {
    const { primary, slugs } = selectProtocolFamily(LIST, "Uniswap")
    expect(primary).toBe("uniswap-v3")            // the largest by TVL
    expect(slugs.sort()).toEqual(["uniswap-v2", "uniswap-v3", "uniswap-v4"])
  })

  it("returns the whole family so revenue can be summed across versions", () => {
    // Reading one version understates the project by whatever the others earn.
    expect(selectProtocolFamily(LIST, "Aave").slugs).toHaveLength(2)
  })

  it("picks the largest member as primary, not whichever came first", () => {
    expect(selectProtocolFamily(LIST, "Aave").primary).toBe("aave-v3")
  })

  it("resolves a family through the parent marker", () => {
    expect(selectProtocolFamily(LIST, "Chainlink").slugs.sort()).toEqual(["ccip", "chainlink-staking"])
  })

  it("resolves a bridge-style family that shares no name with the token", () => {
    expect(selectProtocolFamily(LIST, "Arbitrum").primary).toBe("arbitrum-bridge")
  })
})

describe("the cases that used to work by coincidence", () => {
  it("still resolves an exact name match", () => {
    const { primary, slugs } = selectProtocolFamily(LIST, "Lido")
    expect(primary).toBe("lido")
    expect(slugs).toEqual(["lido"])
  })

  it("still resolves by ticker", () => {
    expect(selectProtocolFamily(LIST, "AAVE").primary).toBe("aave-v3")
  })
})

describe("known name differences", () => {
  it("maps a coin name onto a differently named project", () => {
    // CoinGecko says "Curve DAO"; DefiLlama says "Curve DEX" under curve-finance.
    const { primary, slugs } = selectProtocolFamily(LIST, "Curve DAO")
    expect(primary).toBe("curve-dex")
    expect(slugs).toContain("curve-llamalend")
  })
})

describe("not matching things it should not match", () => {
  it("does not let a prefix swallow an unrelated protocol", () => {
    // "Curve" must not pull in "CrossCurve", which is a different project.
    expect(selectProtocolFamily(LIST, "Curve").slugs).not.toContain("crosscurve")
  })

  it("returns nothing for a project that is genuinely absent", () => {
    expect(selectProtocolFamily(LIST, "Definitely Not A Protocol"))
      .toEqual({ primary: null, slugs: [] })
  })

  it("returns nothing for an empty query rather than matching everything", () => {
    expect(selectProtocolFamily(LIST, "   ")).toEqual({ primary: null, slugs: [] })
  })

  it("is case-insensitive", () => {
    expect(selectProtocolFamily(LIST, "uNiSwAp").primary).toBe("uniswap-v3")
  })

  it("treats a zero-TVL family as found, not missing", () => {
    // Chainlink's staking entry has TVL 0 and CCIP has null. Both are real.
    expect(selectProtocolFamily(LIST, "Chainlink").primary).not.toBeNull()
  })
})
