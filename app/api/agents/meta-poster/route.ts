import { NextRequest } from "next/server"
import {
  getFacebookPages,
  generateFacebookPost,
  generateInstagramCaption,
  postToFacebook,
  postToInstagram,
} from "@/lib/agents/meta-poster-agent"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, ...params } = body

  try {
    if (action === "get-pages") {
      const { userAccessToken } = params as { userAccessToken: string }
      const pages = await getFacebookPages(userAccessToken)
      return Response.json({ pages })
    }

    if (action === "generate-facebook") {
      const { businessDescription, topic, tone, includeEmoji } = params as {
        businessDescription: string
        topic: string
        tone: string
        includeEmoji: boolean
      }
      const result = await generateFacebookPost(businessDescription, topic, tone, includeEmoji)
      return Response.json(result)
    }

    if (action === "generate-instagram") {
      const { businessDescription, topic, tone, hashtags } = params as {
        businessDescription: string
        topic: string
        tone: string
        hashtags: string[]
      }
      const result = await generateInstagramCaption(
        businessDescription,
        topic,
        tone,
        hashtags ?? []
      )
      return Response.json(result)
    }

    if (action === "post-facebook") {
      const { pageId, pageAccessToken, businessDescription, topic, tone, includeEmoji } = params as {
        pageId: string
        pageAccessToken: string
        businessDescription: string
        topic: string
        tone: string
        includeEmoji: boolean
      }
      const generated = await generateFacebookPost(businessDescription, topic, tone, includeEmoji)
      const content = generated as Record<string, unknown>
      const postResult = await postToFacebook(pageId, pageAccessToken, content.post as string)
      return Response.json({ generated: content, post: postResult })
    }

    if (action === "post-instagram") {
      const { igUserId, pageAccessToken, imageUrl, businessDescription, topic, tone, hashtags } =
        params as {
          igUserId: string
          pageAccessToken: string
          imageUrl: string
          businessDescription: string
          topic: string
          tone: string
          hashtags: string[]
        }
      const generated = await generateInstagramCaption(
        businessDescription,
        topic,
        tone,
        hashtags ?? []
      )
      const content = generated as Record<string, unknown>
      const hashtagStr = Array.isArray(content.hashtags)
        ? (content.hashtags as string[]).map(t => `#${t.replace(/^#/, "")}`).join(" ")
        : ""
      const fullCaption = `${content.caption as string}\n\n${hashtagStr}`.trim()
      const postResult = await postToInstagram(igUserId, pageAccessToken, imageUrl, fullCaption)
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
