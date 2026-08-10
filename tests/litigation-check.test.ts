// Federal litigation check — network-free tests using a mocked fetch. Real
// field names (caseName, dateFiled, court, suitNature, cause,
// docket_absolute_url) were verified live against CourtListener's v4 search
// API during development; these fixtures mirror that shape.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkLitigation } from "@/lib/litigation-check"

const ORIGINAL_ENV = process.env.COURTLISTENER_API_TOKEN

function mockResults(results: Array<Record<string, unknown>>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results }),
  }) as unknown as typeof fetch
}

const recentDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
const staleDate = new Date(Date.now() - 800 * 86400000).toISOString().slice(0, 10)

describe("checkLitigation", () => {
  beforeEach(() => { process.env.COURTLISTENER_API_TOKEN = "test-token" })
  afterEach(() => { process.env.COURTLISTENER_API_TOKEN = ORIGINAL_ENV; vi.restoreAllMocks() })

  it("returns null immediately when no API token is configured", async () => {
    delete process.env.COURTLISTENER_API_TOKEN
    global.fetch = vi.fn()
    const result = await checkLitigation("Acme Corp")
    expect(result).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("returns null for a name too short to search meaningfully", async () => {
    global.fetch = vi.fn()
    expect(await checkLitigation("AB")).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("classifies a securities case and applies a risk penalty", async () => {
    mockResults([{
      caseName: "In re Acme Corp Securities Litigation",
      court: "N.D. Cal.", dateFiled: recentDate,
      suitNature: "Securities Fraud (Rule 10b-5)", cause: "15:78j Securities Exchange Act",
      docket_absolute_url: "/docket/123456/",
    }])
    const result = await checkLitigation("Acme Corp")
    expect(result).not.toBeNull()
    expect(result!.securitiesCount).toBe(1)
    expect(result!.riskPenalty).toBeGreaterThan(0)
    expect(result!.flags[0]).toContain("securities-related")
    expect(result!.hits[0].docketUrl).toBe("https://www.courtlistener.com/docket/123456/")
  })

  it("filters out results whose case name doesn't actually mention the company", async () => {
    mockResults([{
      caseName: "Unrelated Party v. Someone Else",
      court: "S.D.N.Y.", dateFiled: recentDate,
      suitNature: "Contract dispute", cause: "",
    }])
    const result = await checkLitigation("Acme Corp")
    expect(result!.hits).toHaveLength(0)
    expect(result!.riskPenalty).toBe(0)
  })

  it("filters out results older than 18 months", async () => {
    mockResults([{
      caseName: "Acme Corp v. Old Dispute Inc",
      court: "D. Del.", dateFiled: staleDate,
      suitNature: "Patent infringement", cause: "35 U.S.C. 271",
    }])
    const result = await checkLitigation("Acme Corp")
    expect(result!.hits).toHaveLength(0)
  })

  it("classifies patent litigation separately from securities, with no risk penalty attached", async () => {
    mockResults([{
      caseName: "Acme Corp v. Competitor LLC",
      court: "D. Del.", dateFiled: recentDate,
      suitNature: "Patent", cause: "35 U.S.C. 271",
    }])
    const result = await checkLitigation("Acme Corp")
    expect(result!.patentCount).toBe(1)
    expect(result!.securitiesCount).toBe(0)
    expect(result!.riskPenalty).toBe(0)
  })

  it("returns a clean, empty read when nothing matches", async () => {
    mockResults([])
    const result = await checkLitigation("Acme Corp")
    expect(result).toEqual({ hits: [], securitiesCount: 0, patentCount: 0, riskPenalty: 0, flags: [] })
  })

  it("returns null on a non-OK response rather than throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch
    expect(await checkLitigation("Acme Corp")).toBeNull()
  })
})
