// Lightweight SMS sender for deal alerts. Mirrors the multi-provider approach
// used by the campaign sender: Twilio first, then Textbelt. Key-gated and fully
// graceful — returns a result object, never throws.

export function isSmsConfigured(): boolean {
  return Boolean((process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) || process.env.TEXTBELT_API_KEY)
}

export interface SmsResult { success: boolean; provider: string; error?: string }

export async function sendSms(phone: string, message: string): Promise<SmsResult> {
  const to = (phone || "").replace(/[^\d+]/g, "")
  if (!to) return { success: false, provider: "none", error: "No phone number" }
  if (!message?.trim()) return { success: false, provider: "none", error: "Empty message" }

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (sid && token && from) {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }).toString(),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.error_code) return { success: true, provider: "twilio" }
      return { success: false, provider: "twilio", error: data.message ?? `Twilio error ${res.status}` }
    } catch (e) {
      return { success: false, provider: "twilio", error: e instanceof Error ? e.message : "Twilio error" }
    }
  }

  const textbelt = process.env.TEXTBELT_API_KEY
  if (textbelt) {
    try {
      const res = await fetch("https://textbelt.com/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: to, message, key: textbelt }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.success) return { success: true, provider: "textbelt" }
      return { success: false, provider: "textbelt", error: data.error ?? "Textbelt error" }
    } catch (e) {
      return { success: false, provider: "textbelt", error: e instanceof Error ? e.message : "Textbelt error" }
    }
  }

  return { success: false, provider: "none", error: "SMS not configured (add TWILIO_* or TEXTBELT_API_KEY)" }
}
