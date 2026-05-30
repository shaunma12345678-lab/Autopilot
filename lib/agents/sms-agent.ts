import { runAgent } from "@/lib/claude"

export async function generateSMSCampaign(
  businessDescription: string,
  campaignGoal: string,
  offer: string,
  tone: string
) {
  const system = `You are an SMS marketing expert. SMS must be under 160 chars each, punchy, and include a clear CTA. Return valid JSON only.`
  const user = `Business: ${businessDescription}
Campaign goal: ${campaignGoal}
Offer/hook: ${offer}
Tone: ${tone}

Return JSON: {
  "messages": [
    { "version": "A", "text": "under 160 chars", "charCount": 0, "cta": "what action to take" },
    { "version": "B", "text": "under 160 chars", "charCount": 0, "cta": "what action to take" },
    { "version": "C", "text": "under 160 chars", "charCount": 0, "cta": "what action to take" }
  ],
  "bestVersion": "A",
  "bestSendTime": "e.g. Tuesday 10am–12pm",
  "complianceTip": "reminder about STOP opt-out",
  "expectedResponseRate": "e.g. 8–15%"
}`
  return runAgent(system, user, { jsonMode: true })
}

export async function sendSMS(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  try {
    const params = new URLSearchParams({ From: from, To: to, Body: body })
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })
    const data = await res.json()
    if (!res.ok || data.error_code) return { success: false, error: data.message ?? "Twilio error" }
    return { success: true, messageSid: data.sid }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}

export async function sendBulkSMS(
  accountSid: string,
  authToken: string,
  from: string,
  numbers: string[],
  body: string
) {
  const results = await Promise.allSettled(
    numbers.map(to => sendSMS(accountSid, authToken, from, to, body))
  )
  const sent = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<{ success: boolean }>).value.success).length
  const failed = results.length - sent
  return { sent, failed, total: results.length }
}
