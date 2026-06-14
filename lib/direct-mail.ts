// Physical direct mail via Lob — print & mail a real letter from inside the app.
//
// Direct mail is the highest-converting channel in distressed real estate, but no
// search tool sends it end-to-end. With LOB_API_KEY set, an investor clicks "Mail
// this lead" and Lob prints + mails a letter to the owner within ~2 business days.
//
// Activates ONLY when LOB_API_KEY is set. Sending physical mail costs money and is
// not reversible, so this is strictly user-initiated per lead — never automatic.

export interface MailAddress {
  name:   string
  line1:  string
  city:   string
  state:  string
  zip:    string
}

export interface MailResult {
  id:            string
  expectedDelivery: string | null
  url:           string | null   // Lob-hosted PDF proof
  carrier:       string | null
}

const LETTERS_ENDPOINT = "https://api.lob.com/v1/letters"

export function isDirectMailConfigured(): boolean {
  return Boolean(process.env.LOB_API_KEY)
}

/**
 * Send a physical letter through Lob. Returns null when unconfigured; throws a
 * descriptive Error on an API failure so the route can surface the reason.
 */
export async function sendLetter(params: {
  to:   MailAddress
  from: MailAddress
  body: string            // letter text; \n preserved as line breaks
  color?: boolean
  description?: string
}): Promise<MailResult | null> {
  const key = process.env.LOB_API_KEY
  if (!key) return null

  // Lob uses HTTP Basic auth with the API key as the username, blank password.
  const auth = Buffer.from(`${key}:`).toString("base64")

  // Wrap the plain-text body in minimal HTML Lob can render onto letterhead.
  const safe = params.body
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")
  const html = `<html><body style="font-family: Georgia, serif; font-size: 12pt; line-height: 1.5; padding: 1in;">${safe}</body></html>`

  const form = new URLSearchParams()
  form.set("description", params.description ?? "AutoPilot foreclosure outreach")
  form.set("to[name]",  params.to.name)
  form.set("to[address_line1]", params.to.line1)
  form.set("to[address_city]",  params.to.city)
  form.set("to[address_state]", params.to.state)
  form.set("to[address_zip]",   params.to.zip)
  form.set("from[name]",  params.from.name)
  form.set("from[address_line1]", params.from.line1)
  form.set("from[address_city]",  params.from.city)
  form.set("from[address_state]", params.from.state)
  form.set("from[address_zip]",   params.from.zip)
  form.set("file", html)
  form.set("color", String(params.color ?? false))

  const res = await fetch(LETTERS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization:  `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data?.error?.message as string) ?? `Lob returned ${res.status}`
    throw new Error(msg)
  }

  return {
    id:               String(data.id ?? ""),
    expectedDelivery: typeof data.expected_delivery_date === "string" ? data.expected_delivery_date : null,
    url:              typeof data.url === "string" ? data.url : null,
    carrier:          typeof data.carrier === "string" ? data.carrier : null,
  }
}
