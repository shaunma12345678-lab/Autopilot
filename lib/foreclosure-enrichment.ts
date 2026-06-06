// Web-search contact discovery for pre-foreclosure leads.
// Uses Tavily to find phone numbers, emails, and owner profiles from
// public records, LinkedIn, Facebook, and whitepages snippets.
// Works with or without TAVILY_API_KEY — silently skips if not configured.

import { webSearch } from "@/lib/search"

export interface OwnerContactDiscovery {
  phone: string | null
  email: string | null
  linkedInUrl: string | null
  confidence: "high" | "medium" | "low"
  sources: string[]
}

const PHONE_RE = /(?:\+1[\s-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const LINKEDIN_RE = /linkedin\.com\/in\/[\w-]+/gi

function extractPhones(text: string): string[] {
  const found = text.match(PHONE_RE) ?? []
  // Clean and deduplicate
  return [
    ...new Set(found.map((p) => p.replace(/\D/g, "").slice(-10))),
  ].filter((p) => p.length === 10)
}

function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? []
  // Exclude common non-personal domains
  const EXCLUDE = /noreply|example|@zillow|@realtor|@trulia|@redfin|@attom/i
  return [...new Set(found.filter((e) => !EXCLUDE.test(e)))]
}

function extractLinkedIn(text: string): string | null {
  const found = text.match(LINKEDIN_RE)
  return found?.[0] ? `https://www.${found[0]}` : null
}

// Search strategies, tried in order until we get a high-confidence hit
function buildSearchQueries(
  ownerName: string,
  address: string,
  city: string,
  state: string
): string[] {
  const cleanName = ownerName
    .replace(/\b(LLC|INC|CORP|TRUST|LP|LTD)\b/gi, "")
    .trim()

  return [
    // Most specific first
    `"${cleanName}" "${city}" "${state}" phone number`,
    `"${cleanName}" "${address}" contact`,
    `"${cleanName}" "${city} ${state}" homeowner`,
    `"${address}" "${city} ${state}" owner contact`,
    // Broader fallbacks
    `${cleanName} ${city} ${state} phone email`,
    `site:whitepages.com "${cleanName}" "${city}"`,
  ]
}

export async function discoverOwnerContact(
  ownerName: string,
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<OwnerContactDiscovery> {
  if (!process.env.TAVILY_API_KEY) {
    return { phone: null, email: null, linkedInUrl: null, confidence: "low", sources: [] }
  }

  if (!ownerName || ownerName === "Unknown Owner") {
    return { phone: null, email: null, linkedInUrl: null, confidence: "low", sources: [] }
  }

  const queries = buildSearchQueries(ownerName, address, city, state)
  const phones: string[] = []
  const emails: string[] = []
  let linkedInUrl: string | null = null
  const sources: string[] = []

  // Try first 3 queries — stop early if we find high-confidence data
  for (let i = 0; i < Math.min(3, queries.length); i++) {
    try {
      const result = await webSearch(queries[i], 5)
      const allText = [
        result.answer ?? "",
        ...result.results.map((r) => `${r.title} ${r.content}`),
      ].join(" ")

      const foundPhones = extractPhones(allText)
      const foundEmails = extractEmails(allText)
      const foundLinkedIn = extractLinkedIn(allText)

      phones.push(...foundPhones)
      emails.push(...foundEmails)
      if (foundLinkedIn && !linkedInUrl) linkedInUrl = foundLinkedIn
      result.results.forEach((r) => sources.push(r.url))

      // If we found both phone and email, stop searching
      if (phones.length > 0 && emails.length > 0) break
    } catch {
      // Network errors are non-fatal — continue with next query
    }

    // Small delay between searches
    if (i < 2) await new Promise((r) => setTimeout(r, 500))
  }

  // Deduplicate and pick best
  const uniquePhones = [...new Set(phones)]
  const uniqueEmails = [...new Set(emails)]

  let confidence: OwnerContactDiscovery["confidence"] = "low"
  if (uniquePhones.length > 0 && uniqueEmails.length > 0) confidence = "high"
  else if (uniquePhones.length > 0 || uniqueEmails.length > 0) confidence = "medium"

  return {
    phone: uniquePhones[0]
      ? uniquePhones[0].replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")
      : null,
    email: uniqueEmails[0] ?? null,
    linkedInUrl,
    confidence,
    sources: [...new Set(sources)].slice(0, 5),
  }
}

// Batch contact discovery with rate limiting
export async function batchDiscoverContacts(
  leads: Array<{
    attomId: number
    ownerName: string
    address: string
    city: string
    state: string
    zip: string
  }>,
  concurrency = 2
): Promise<Map<number, OwnerContactDiscovery>> {
  const results = new Map<number, OwnerContactDiscovery>()

  // Only run if Tavily is configured
  if (!process.env.TAVILY_API_KEY) {
    leads.forEach((l) =>
      results.set(l.attomId, {
        phone: null,
        email: null,
        linkedInUrl: null,
        confidence: "low",
        sources: [],
      })
    )
    return results
  }

  for (let i = 0; i < leads.length; i += concurrency) {
    const batch = leads.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map((l) =>
        discoverOwnerContact(l.ownerName, l.address, l.city, l.state, l.zip)
      )
    )
    settled.forEach((r, idx) => {
      results.set(
        batch[idx].attomId,
        r.status === "fulfilled"
          ? r.value
          : { phone: null, email: null, linkedInUrl: null, confidence: "low", sources: [] }
      )
    })
    if (i + concurrency < leads.length) {
      // 1.5s between batches to stay within Tavily rate limits
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  return results
}
