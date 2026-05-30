import { NextRequest } from "next/server"
import { getLinkedInProfile, generateLinkedInPost, postToLinkedIn } from "@/lib/agents/linkedin-agent"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "get-profile") {
      const { accessToken } = params as { accessToken: string }
      const profile = await getLinkedInProfile(accessToken)
      if (profile.error) {
        return Response.json({ error: profile.error }, { status: 400 })
      }
      return Response.json({ profile })
    }

    if (action === "generate") {
      const { businessDescription, topic, postType } = params as {
        businessDescription: string
        topic: string
        postType: "thought-leadership" | "company-update" | "case-study" | "hiring"
      }
      const result = await generateLinkedInPost(businessDescription, topic, postType)
      return Response.json(result)
    }

    if (action === "post") {
      const { accessToken, personId, businessDescription, topic, postType } = params as {
        accessToken: string
        personId: string
        businessDescription: string
        topic: string
        postType: "thought-leadership" | "company-update" | "case-study" | "hiring"
      }
      const generated = await generateLinkedInPost(businessDescription, topic, postType)
      const content = generated as Record<string, unknown>
      const postResult = await postToLinkedIn(accessToken, personId, content.post as string)
      return Response.json({ generated: content, post: postResult })
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    )
  }
}
