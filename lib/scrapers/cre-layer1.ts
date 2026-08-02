// CRE Layer 1 scraper — active commercial distress filings.
// Sources: CMBS special servicing, SBA loan default, LLC/business bankruptcy.

import { multiSearchSnippets, extractSignalsWithAI, type RawSignalInput } from "./base"
import { CRE_EXTRACTOR_SYSTEM } from "./cre-base"
import type { CountyConfig } from "@/lib/config/counties"

export async function scrapeCreLayer1(county: CountyConfig): Promise<RawSignalInput[]> {
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
      CRE_EXTRACTOR_SYSTEM
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
