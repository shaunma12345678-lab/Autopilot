// Layer 3 scraper — Life-event motivation signals.
// Sources: Probate filings, divorce with real property, obituary cross-reference.
// These may not be financially distressed yet — they represent high-conversion
// sellers who often want a fast, easy close.

import { multiSearchSnippets, extractSignalsWithAI, EXTRACTOR_SYSTEM, type RawSignalInput } from "./base"
import type { CountyConfig } from "@/lib/config/counties"

export async function scrapeLayer3(county: CountyConfig): Promise<RawSignalInput[]> {
  const year = new Date().getFullYear()
  const layer3Sources = county.sources.filter(s => s.layer === 3)
  const signals: RawSignalInput[] = []

  for (const src of layer3Sources) {
    const queries = src.searchTerms.map(t => t.replace(/\{year\}/g, String(year)))
    const content = await multiSearchSnippets(queries)
    const extracted = await extractSignalsWithAI(
      content,
      county.name,
      src.signalTypes,
      EXTRACTOR_SYSTEM
    )
    for (const s of extracted) {
      signals.push({ ...s, source: src.name })
    }
  }

  return dedupeByAddress(signals)
}

function dedupeByAddress(signals: RawSignalInput[]): RawSignalInput[] {
  const seen = new Set<string>()
  return signals.filter(s => {
    const key = `${s.address.toLowerCase().replace(/\s+/g, " ").trim()}|${s.signalType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
