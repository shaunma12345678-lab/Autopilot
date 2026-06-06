import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendViaGmail } from "@/lib/gmail"
import { Resend } from "resend"

// ─── Email sending ────────────────────────────────────────────────────────────

function buildEmailHtml(letter: string, senderName: string): string {
  const escaped = letter
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Georgia,serif;max-width:620px;margin:0 auto;padding:40px 24px;color:#1f2937;background:#fffef7;">
  <p style="font-size:15px;line-height:1.8;color:#374151;">${escaped}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
  <p style="font-size:12px;color:#9ca3af;">Personal letter from ${senderName}. If you received this in error, please disregard.</p>
</body></html>`
}

async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; provider: string; error?: string }> {
  // Priority 1: user's connected Gmail (free, unlimited)
  try {
    const result = await sendViaGmail(userId, { to, subject, html })
    if (result.sent) return { success: true, provider: "gmail" }
  } catch { /* fall through */ }

  // Priority 2: Resend (free tier: 3,000/month)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const from = process.env.FROM_EMAIL ?? "hello@autopilot.ai"
      await resend.emails.send({ from, to, subject, html })
      return { success: true, provider: "resend" }
    } catch (e) {
      return { success: false, provider: "resend", error: e instanceof Error ? e.message : "Resend error" }
    }
  }

  return { success: false, provider: "none", error: "No email provider configured. Connect Gmail at /integrations or add RESEND_API_KEY." }
}

// ─── SMS sending ──────────────────────────────────────────────────────────────

// Carrier email-to-SMS gateways — 100% free when sending via Gmail
const CARRIER_GATEWAYS: Record<string, string> = {
  att:       "@txt.att.net",
  verizon:   "@vtext.com",
  tmobile:   "@tmomail.net",
  sprint:    "@messaging.sprintpcs.com",
  metropcs:  "@mymetropcs.com",
  boost:     "@sms.myboostmobile.com",
  cricket:   "@sms.cricketwireless.net",
  uscellular:"@email.uscc.net",
}

// TextBelt: free (1/day, "textbelt" key) or paid ($0.01/text with real key)
async function sendTextBelt(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  const key = process.env.TEXTBELT_API_KEY ?? "textbelt" // "textbelt" = free tier (1/day)
  const clean = phone.replace(/\D/g, "").slice(-10)
  try {
    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: `+1${clean}`, message: message.slice(0, 1600), key }),
    })
    const data = await res.json()
    if (data.success) return { success: true }
    return { success: false, error: data.error ?? "TextBelt failed" }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "TextBelt error" }
  }
}

// Twilio (if configured)
async function sendTwilio(phone: string, body: string): Promise<{ success: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return { success: false, error: "Twilio not configured" }
  const clean = phone.replace(/\D/g, "")
  const e164 = clean.length === 10 ? `+1${clean}` : `+${clean}`
  try {
    const params = new URLSearchParams({ To: e164, From: from, Body: body.slice(0, 1600) })
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })
    const data = await res.json()
    if (!res.ok || data.error_code) return { success: false, error: data.message ?? "Twilio error" }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Twilio error" }
  }
}

async function sendSMS(
  userId: string,
  phone: string,
  message: string,
  carrier?: string        // optional: carrier name for email-to-SMS fallback
): Promise<{ success: boolean; provider: string; error?: string }> {
  // Priority 1: Twilio (if configured, ~$0.007/text)
  if (process.env.TWILIO_ACCOUNT_SID) {
    const r = await sendTwilio(phone, message)
    if (r.success) return { success: true, provider: "twilio" }
  }

  // Priority 2: TextBelt (free: 1/day via "textbelt" key; paid: ~$0.01/text)
  const tbResult = await sendTextBelt(phone, message)
  if (tbResult.success) return { success: true, provider: "textbelt" }

  // Priority 3: Email-to-SMS via Gmail (100% free if carrier known)
  if (carrier && CARRIER_GATEWAYS[carrier.toLowerCase()]) {
    const clean = phone.replace(/\D/g, "").slice(-10)
    const smsEmail = `${clean}${CARRIER_GATEWAYS[carrier.toLowerCase()]}`
    const result = await sendViaGmail(userId, {
      to: smsEmail,
      subject: "",
      html: `<p>${message}</p>`,
      text: message,
    })
    if (result.sent) return { success: true, provider: "email-to-sms" }
  }

  return { success: false, provider: "none", error: "SMS sending failed. Add TWILIO_* keys or TEXTBELT_API_KEY, or specify carrier for free email-to-SMS." }
}

// ─── Route handler ────────────────────────────────────────────────────────────

interface SendTarget {
  attomId: number
  ownerName: string
  address: string
  email: string | null
  phone: string | null
  carrier?: string     // optional: att | verizon | tmobile | sprint | etc.
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      targets,
      channel,
      emailSubject,
      emailLetter,
      smsText,
      fromName = "A Local Investor",
      fromPhone = "[YOUR PHONE]",
    } = body as {
      targets: SendTarget[]
      channel: "email" | "sms" | "both"
      emailSubject?: string
      emailLetter?: string
      smsText?: string
      fromName?: string
      fromPhone?: string
    }

    if (!targets?.length) return Response.json({ error: "targets required" }, { status: 400 })

    const personalize = (text: string) =>
      text.replace(/\[YOUR NAME\]/gi, fromName).replace(/\[YOUR PHONE\]/gi, fromPhone)

    let emailSent = 0, emailFailed = 0, smsSent = 0, smsFailed = 0
    const results: Array<{ attomId: number; emailStatus: string; smsStatus: string }> = []

    for (const target of targets) {
      let emailStatus = "skipped"
      let smsStatus = "skipped"

      if ((channel === "email" || channel === "both") && target.email && emailLetter) {
        const subject = personalize(emailSubject || `A personal note about your property at ${target.address}`)
        const html = buildEmailHtml(personalize(emailLetter), fromName)
        const r = await sendEmail(user.id, target.email, subject, html)
        emailStatus = r.success ? `sent via ${r.provider}` : `failed: ${r.error}`
        r.success ? emailSent++ : emailFailed++
      } else if (channel !== "sms" && !target.email) {
        emailStatus = "no email address"
      }

      if ((channel === "sms" || channel === "both") && target.phone && smsText) {
        const r = await sendSMS(user.id, target.phone, personalize(smsText), target.carrier)
        smsStatus = r.success ? `sent via ${r.provider}` : `failed: ${r.error}`
        r.success ? smsSent++ : smsFailed++
      } else if (channel !== "email" && !target.phone) {
        smsStatus = "no phone number"
      }

      results.push({ attomId: target.attomId, emailStatus, smsStatus })
    }

    return Response.json({ emailSent, emailFailed, smsSent, smsFailed, total: targets.length, results })
  } catch (err) {
    console.error("[foreclosure-send]", err)
    return Response.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 500 })
  }
}

// GET /api/leads/foreclosure-send — return which providers are configured
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { hasGmailConnected } = await import("@/lib/gmail")
  const gmailConnected = await hasGmailConnected(user.id)

  return Response.json({
    email: {
      gmail:  { available: gmailConnected,                label: "Gmail (connected)", free: true },
      resend: { available: !!process.env.RESEND_API_KEY,  label: "Resend",            free: "3k/month" },
    },
    sms: {
      twilio:     { available: !!process.env.TWILIO_ACCOUNT_SID, label: "Twilio",         free: false, cost: "$0.007/text" },
      textbelt:   { available: true,                              label: "TextBelt",        free: "1/day", cost: "$0.01/text" },
      emailToSms: { available: gmailConnected,                    label: "Email-to-SMS",    free: true, note: "Must know carrier" },
    },
    foreclosureData: {
      attom:  { available: !!process.env.ATTOM_API_KEY, label: "ATTOM Data",       free: false, cost: "$299+/mo" },
      tavily: { available: !!process.env.TAVILY_API_KEY, label: "Public records scraper", free: "1k/month" },
    },
  })
}
