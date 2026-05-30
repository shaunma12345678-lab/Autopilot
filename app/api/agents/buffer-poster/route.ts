import { NextRequest } from "next/server"
import { getBufferProfiles, generateMultiPlatformContent, scheduleToBuffer } from "@/lib/agents/buffer-agent"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "get-profiles") {
      const { accessToken } = params as { accessToken: string }
      const profiles = await getBufferProfiles(accessToken)
      return Response.json({ profiles })
    }

    if (action === "generate") {
      const { businessDescription, topic, platforms } = params as {
        businessDescription: string
        topic: string
        platforms: string[]
      }
      const result = await generateMultiPlatformContent(businessDescription, topic, platforms)
      return Response.json(result)
    }

    if (action === "schedule") {
      const { accessToken, profileIds, text, scheduledAt } = params as {
        accessToken: string
        profileIds: string[]
        text: string
        scheduledAt?: string
      }
      const result = await scheduleToBuffer(accessToken, profileIds, text, scheduledAt)
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
