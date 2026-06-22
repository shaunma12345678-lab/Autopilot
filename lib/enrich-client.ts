// Client helper to enrich a single lead via /api/leads/enrich (our own free
// web+AI enrichment, plus RentCast when configured) and return the patch to
// merge. Never throws; returns null when nothing was found.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

export interface EnrichResult { patch: Partial<ForeclosureLead>; sources: string[] }

export async function enrichLeadClient(lead: ForeclosureLead, password: string): Promise<EnrichResult | null> {
  if (!lead.address) return null
  try {
    const res = await fetch("/api/leads/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ address: lead.address, city: lead.city, state: lead.state, zip: lead.zip, totalLiens: lead.totalLiens ?? 0 }),
    })
    const data = await res.json()
    if (data?.error || !data?.found) return null
    return { patch: (data.patch ?? {}) as Partial<ForeclosureLead>, sources: data.sources ?? [] }
  } catch {
    return null
  }
}

// Run enrichment over many leads with bounded concurrency, calling `onEnriched`
// with each lead's patch as it completes (so the UI updates progressively).
export async function enrichMany(
  leads: ForeclosureLead[],
  password: string,
  onEnriched: (lead: ForeclosureLead, patch: Partial<ForeclosureLead>) => void,
  concurrency = 3,
): Promise<void> {
  let i = 0
  const worker = async () => {
    while (i < leads.length) {
      const lead = leads[i++]
      const r = await enrichLeadClient(lead, password)
      if (r) onEnriched(lead, r.patch)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, leads.length) }, worker))
}
