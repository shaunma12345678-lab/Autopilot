// Premium skip tracing via BatchData — verified cell phones, emails & relatives.
//
// FastPeopleSearch (the free fallback in contact-enrichment.ts) misses most
// owners and never returns cell phones or emails. BatchData returns carrier-
// verified mobile numbers, emails, and associated people — the difference
// between a lead you can call and a dead end.
//
// Activates ONLY when BATCHDATA_API_KEY is set. With no key, skipTrace() returns
// null and callers fall back to the existing free lookup — purely additive.
//
// Run ON DEMAND per lead (via /api/leads/skip-trace) because each lookup is a
// paid credit; never auto-fired across a whole bulk search.

export interface SkipTraceResult {
  phone:      string | null     // best (mobile preferred) phone
  email:      string | null     // best email
  phones:     string[]          // all discovered phones
  emails:     string[]          // all discovered emails
  relatives:  string[]          // associated people / likely relatives
  confidence: "high" | "medium" | "low"
  source:     string
}

const ENDPOINT = "https://api.batchdata.com/api/v1/property/skip-trace"

export function isSkipTraceConfigured(): boolean {
  return Boolean(process.env.BATCHDATA_API_KEY)
}

// Walk an arbitrary nested object collecting values whose key looks like `match`.
function collectByKey(node: unknown, match: RegExp, out: string[], depth = 0): void {
  if (depth > 6 || node == null) return
  if (Array.isArray(node)) { for (const v of node) collectByKey(v, match, out, depth + 1); return }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (match.test(k) && (typeof v === "string" || typeof v === "number")) {
        const s = String(v).trim()
        if (s) out.push(s)
      } else {
        collectByKey(v, match, out, depth + 1)
      }
    }
  }
}

function formatPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")
  if (digits.length !== 10) return null
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr.map(s => s.trim()).filter(Boolean))]
}

/**
 * Skip trace a single property owner. Returns null when unconfigured or on any
 * failure — callers must fall back to the free enrichment path.
 */
export async function skipTrace(
  p: { address: string; city: string; state: string; zip: string; ownerName?: string },
  timeoutMs = 9000
): Promise<SkipTraceResult | null> {
  const token = process.env.BATCHDATA_API_KEY
  if (!token || !p.address?.trim()) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept:         "application/json",
      },
      body: JSON.stringify({
        requests: [{
          propertyAddress: { street: p.address, city: p.city, state: p.state, zip: p.zip },
        }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()

    // BatchData nests results differently across plans; harvest defensively.
    const phonesRaw: string[] = []
    const emailsRaw: string[] = []
    const namesRaw:  string[] = []
    collectByKey(data, /phone|mobile|number/i, phonesRaw)
    collectByKey(data, /email/i, emailsRaw)
    collectByKey(data, /(first|last|full).?name|relative|associate/i, namesRaw)

    const phones = uniq(phonesRaw.map(formatPhone).filter((x): x is string => Boolean(x)))
    const emails = uniq(emailsRaw.filter(e => /\S+@\S+\.\S+/.test(e)))
    // Drop the owner's own name from the relatives list.
    const owner = (p.ownerName ?? "").toLowerCase()
    const relatives = uniq(namesRaw).filter(n => n.length > 3 && n.toLowerCase() !== owner).slice(0, 5)

    if (phones.length === 0 && emails.length === 0) return null

    const confidence: SkipTraceResult["confidence"] =
      phones.length >= 1 && emails.length >= 1 ? "high" :
      phones.length >= 1                        ? "medium" : "low"

    return {
      phone:  phones[0] ?? null,
      email:  emails[0] ?? null,
      phones,
      emails,
      relatives,
      confidence,
      source: "BatchData",
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
