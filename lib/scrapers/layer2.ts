// Layer 2 scraper — "On the verge" early warning signals.
// Sources: Tax delinquency, code violations, HOA liens, quitclaim deeds.
// These properties haven't filed NOD yet but are statistically likely to within 3-12 months.

import { multiSearchSnippets, extractSignalsWithAI, EXTRACTOR_SYSTEM, type RawSignalInput } from "./base"
import type { CountyConfig } from "@/lib/config/counties"

export async function scrapeLayer2(county: CountyConfig): Promise<RawSignalInput[]> {
  const year = new Date().getFullYear()
  const layer2Sources = county.sources.filter(s => s.layer === 2)
  const signals: RawSignalInput[] = []

  for (const src of layer2Sources) {
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
