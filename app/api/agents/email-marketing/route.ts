import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { generateWelcomeSequence, generateWinBackCampaign, generatePromotionalBroadcast, generateNurtureSequence } from "@/lib/agents/email-marketing-agent"
import { sendViaGmail, hasGmailConnected } from "@/lib/gmail"


export async function POST(request: NextRequest) {
  const _supabase = await createSupabaseServerClient()
  const { data: { user: _sessionUser } } = await _supabase.auth.getUser()
  const user = _sessionUser ?? await prisma.user.findFirst()
  if (!user) return Response.json({ error: "Service unavailable" }, { status: 503 })
  const business = await prisma.business.findFirst({  })
  if (!business) return Response.json({ error: "No business found" }, { status: 404 })

  const body = await request.json()
  const { action, sendTo, ...params } = body
  const brandVoice = business.brandVoice as Record<string, unknown>

  const gmailConnected = await hasGmailConnected(user.id)

  try {
    let result: Record<string, unknown> | null = null

    if (action === "welcome") {
      result = await generateWelcomeSequence({ businessName: business.name, businessType: business.type, brandVoice, ...params })
    } else if (action === "winback") {
      result = await generateWinBackCampaign({ businessName: business.name, businessType: business.type, ...params })
    } else if (action === "broadcast") {
      result = await generatePromotionalBroadcast({ businessName: business.name, businessType: business.type, brandVoice, ...params })
    } else if (action === "nurture") {
      result = await generateNurtureSequence({ businessName: business.name, ...params })
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 })
    }

    // If Gmail is connected and a recipient is provided, actually send the first email
    let sendResult = null
    if (gmailConnected && sendTo && result) {
      const emails = Array.isArray(result.emails)
        ? (result.emails as Array<{ subject: string; body: string }>)
        : null
      const firstEmail = emails?.[0] ?? (result as { subject?: string; body?: string })

      if (firstEmail?.subject && firstEmail?.body) {
        try {
          sendResult = await sendViaGmail(user.id, {
            to:      sendTo,
            subject: firstEmail.subject as string,
            html:    firstEmail.body as string,
          })
        } catch (e) {
          console.error("[email-marketing] Gmail send failed:", e)
        }
      }
    }

    return Response.json({
      ...result,
      gmailConnected,
      sent: sendResult?.sent ?? false,
      sentFrom: sendResult?.from,
    })
  } catch (err) {
    console.error("Email marketing agent error:", err)
    return Response.json({ error: "Agent failed" }, { status: 500 })
  }
}
