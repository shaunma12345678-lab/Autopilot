// Event significance — both runAgent and fetchFilingText are mocked so this
// never hits the network or a real model.
import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/claude", () => ({ runAgent: vi.fn() }))
vi.mock("@/lib/edgar-narrative", () => ({ fetchFilingText: vi.fn() }))
import { runAgent } from "@/lib/claude"
import { fetchFilingText } from "@/lib/edgar-narrative"
import { assessEventSignificance } from "@/lib/event-significance"

describe("assessEventSignificance", () => {
  it("returns null when the filing text can't be fetched", async () => {
    vi.mocked(fetchFilingText).mockResolvedValueOnce(null)
    const result = await assessEventSignificance("0000320193", "0001193125-26-000001", "doc.htm", "2026-08-01", "Material agreement signed")
    expect(result).toBeNull()
    expect(runAgent).not.toHaveBeenCalled()
  })

  it("parses a well-formed response and builds a correct source URL", async () => {
    vi.mocked(fetchFilingText).mockResolvedValueOnce("Some 8-K body text disclosing a $500M agreement with Acme.")
    vi.mocked(runAgent).mockResolvedValueOnce({
      headline: "Signed a $500M supply agreement with Acme Corp.",
      significance: "major",
      direction: "positive",
      reasoning: "The filing discloses a $500M dollar figure explicitly tied to a multi-year term.",
    })
    const result = await assessEventSignificance("0000320193", "0001193125-26-000001", "doc.htm", "2026-08-01", "Material agreement signed")
    expect(result).not.toBeNull()
    expect(result!.significance).toBe("major")
    expect(result!.direction).toBe("positive")
    expect(result!.headline).toContain("Acme")
    expect(result!.sourceUrl).toBe("https://www.sec.gov/Archives/edgar/data/320193/000119312526000001/doc.htm")
    expect(result!.eventDate).toBe("2026-08-01")
  })

  it("falls back to 'unclear' on an invalid significance or direction value rather than guessing", async () => {
    vi.mocked(fetchFilingText).mockResolvedValueOnce("Body text.")
    vi.mocked(runAgent).mockResolvedValueOnce({
      headline: "Something happened.", significance: "huge_deal_bullish", direction: "bullish", reasoning: "test",
    })
    const result = await assessEventSignificance("0000320193", "0001193125-26-000001", "doc.htm", "2026-08-01", "Material agreement signed")
    expect(result!.significance).toBe("unclear")
    expect(result!.direction).toBe("unclear")
  })

  it("distinguishes a negative development from a positive one", async () => {
    vi.mocked(fetchFilingText).mockResolvedValueOnce("CFO departs following an internal investigation into accounting practices.")
    vi.mocked(runAgent).mockResolvedValueOnce({
      headline: "CFO departed following an internal accounting investigation.",
      significance: "major",
      direction: "negative",
      reasoning: "The departure is explicitly tied to an accounting investigation, not a planned succession.",
    })
    const result = await assessEventSignificance("0000320193", "0001193125-26-000001", "doc.htm", "2026-08-01", "Executive or director change")
    expect(result!.direction).toBe("negative")
  })

  it("returns null when the model call throws", async () => {
    vi.mocked(fetchFilingText).mockResolvedValueOnce("Body text.")
    vi.mocked(runAgent).mockRejectedValueOnce(new Error("model unavailable"))
    const result = await assessEventSignificance("0000320193", "0001193125-26-000001", "doc.htm", "2026-08-01", "Material agreement signed")
    expect(result).toBeNull()
  })

  it("returns null when fetchFilingText itself throws", async () => {
    vi.mocked(fetchFilingText).mockRejectedValueOnce(new Error("SEC unreachable"))
    const result = await assessEventSignificance("0000320193", "0001193125-26-000001", "doc.htm", "2026-08-01", "Material agreement signed")
    expect(result).toBeNull()
  })
})
