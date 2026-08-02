// CRE Layer 2 scraper — early-warning commercial distress signals.
// Sources: UCC-1 lien filings, commercial code violations, commercial vacancy/tenant-loss.
// These properties haven't hit active default yet but are statistically at elevated risk.

import { multiSearchSnippets, extractSignalsWithAI, type RawSignalInput } from "./base"
import { CRE_EXTRACTOR_SYSTEM } from "./cre-base"
import type { CountyConfig } from "@/lib/config/counties"

export async function scrapeCreLayer2(county: CountyConfig): Promise<RawSignalInput[]> {
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
