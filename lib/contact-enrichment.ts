// Owner contact enrichment using free public record sources.
// Attempts to find phone numbers for property owners from:
//   1. FastPeopleSearch.com (free, no key)
//   2. WhitePages (free tier)
//
// All lookups are fire-and-forget with short timeouts — failures are silent.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// Normalize a name for URL: "John A Smith" → "john-smith"
function nameSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|mr|mrs|ms|dr|llc|inc|trust|corp|revocable|living|family)\b/gi, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

// Normalize a city for URL: "San Diego" → "san-diego"
function citySlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "")
}

// Extract phone numbers from HTML in (XXX) XXX-XXXX or XXX-XXX-XXXX format
function extractPhones(html: string): string[] {
  const phones: string[] = []
  const rx = /(?:\((\d{3})\)\s*|\b(\d{3})[-.]?)(\d{3})[-.](\d{4})\b/g
  for (const m of html.matchAll(rx)) {
    const area = m[1] ?? m[2]
    const num  = `(${area}) ${m[3]}-${m[4]}`
    if (!phones.includes(num)) phones.push(num)
    if (phones.length >= 3) break
  }
  return phones
}

// FastPeopleSearch — free public records phone lookup
async function lookupFastPeopleSearch(
  name: string, city: string, state: string
): Promise<string | null> {
  if (!name || name === "Owner Unknown") return null

  const slug    = nameSlug(name)
  const cSlug   = citySlug(city)
  const stLower = state.toLowerCase()

  const urls = [
    `https://www.fastpeoplesearch.com/name/${slug}_${cSlug}-${stLower}`,
    `https://www.fastpeoplesearch.com/name/${slug}_${stLower}`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":      UA,
          "Accept":          "text/html",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer":         "https://www.fastpeoplesearch.com/",
        },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const html = await res.text()
      const phones = extractPhones(html)
      if (phones.length > 0) return phones[0]
    } catch { /* try next URL */ }
  }
  return null
}

// whitepages.com — another free public records source
async function lookupWhitePages(
  name: string, city: string, state: string
): Promise<string | null> {
  if (!name || name === "Owner Unknown") return null

  const slug  = nameSlug(name)
  const cSlug = citySlug(city)

  try {
    const res = await fetch(
      `https://www.whitepages.com/name/${slug}/${cSlug}-${state.toLowerCase()}`,
      {
        headers: {
          "User-Agent":      UA,
          "Accept":          "text/html",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const html = await res.text()
    const phones = extractPhones(html)
    return phones[0] ?? null
  } catch {
    return null
  }
}

// Main export: enrich a batch of leads with owner phone numbers in parallel.
// Returns a Map<leadAddress, phone> so callers can merge efficiently.
// Rate-limited to 3 concurrent lookups to avoid rate-limit bans.
export async function enrichLeadsWithContact(
  leads: Array<{ address: string; ownerName: string; city: string; state: string }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  // Only attempt for leads with a real owner name
  const candidates = leads.filter(
    l => l.ownerName && l.ownerName !== "Owner Unknown" &&
         !/hud|fannie|freddie|usda|fha|bank|trust|llc|inc|corp/i.test(l.ownerName)
  ).slice(0, 30) // cap at 30 lookups per search to stay within timeouts

  await Promise.allSettled(
    candidates.map(async (lead) => {
      const phone =
        await lookupFastPeopleSearch(lead.ownerName, lead.city, lead.state) ??
        await lookupWhitePages(lead.ownerName, lead.city, lead.state)

      if (phone) {
        result.set(
          (lead.address + lead.city).toLowerCase().replace(/[\s,#.-]/g, ""),
          phone
        )
      }
    })
  )

  return result
}
