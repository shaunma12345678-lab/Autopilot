// Layer 1 scraper — Official pre-foreclosure records.
// Sources: NOD, Lis Pendens, Notice of Trustee Sale from county recorder data.

import { multiSearchSnippets, extractSignalsWithAI, EXTRACTOR_SYSTEM, type RawSignalInput } from "./base"
import type { CountyConfig } from "@/lib/config/counties"

export async function scrapeLayer1(county: CountyConfig): Promise<RawSignalInput[]> {
  const year = new Date().getFullYear()
  const layer1Sources = county.sources.filter(s => s.layer === 1)
  const signals: RawSignalInput[] = []

  for (const src of layer1Sources) {
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
