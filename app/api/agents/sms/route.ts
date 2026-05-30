import { NextRequest } from "next/server"
import { generateSMSCampaign, sendSMS, sendBulkSMS } from "@/lib/agents/sms-agent"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "generate") {
      const { businessDescription, campaignGoal, offer, tone } = params as {
        businessDescription: string
        campaignGoal: string
        offer: string
        tone: string
      }
      const result = await generateSMSCampaign(businessDescription, campaignGoal, offer, tone)
      return Response.json(result)
    }

    if (action === "send-single") {
      const { accountSid, authToken, fromNumber, toNumber, message } = params as {
        accountSid: string
        authToken: string
        fromNumber: string
        toNumber: string
        message: string
      }
      const result = await sendSMS(accountSid, authToken, fromNumber, toNumber, message)
      return Response.json(result)
    }

    if (action === "send-bulk") {
      const { accountSid, authToken, fromNumber, toNumbers, message } = params as {
        accountSid: string
        authToken: string
        fromNumber: string
        toNumbers: string[]
        message: string
      }
      const result = await sendBulkSMS(accountSid, authToken, fromNumber, toNumbers, message)
      return Response.json(result)
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    )
  }
}
