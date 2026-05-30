import { runAgent } from "@/lib/claude"

export async function generateFacebookPost(
  businessDescription: string,
  topic: string,
  tone: string,
  includeEmoji: boolean
) {
  const system = `You are a social media expert who writes high-engagement Facebook posts for small businesses. Write posts that feel human, not corporate. Return valid JSON only.`
  const user = `Business: ${businessDescription}
Topic: ${topic}
Tone: ${tone}
Include emoji: ${includeEmoji}

Return JSON: { "post": "full post text", "hook": "first line only", "callToAction": "the CTA used", "bestPostTime": "e.g. Tuesday 6–8pm", "estimatedReach": "e.g. 3x average" }`
  return runAgent(system, user, { jsonMode: true })
}

export async function generateInstagramCaption(
  businessDescription: string,
  topic: string,
  tone: string,
  hashtags: string[]
) {
  const system = `You are an Instagram growth expert who writes captions that drive saves and follows. Return valid JSON only.`
  const user = `Business: ${businessDescription}
Topic: ${topic}
Tone: ${tone}
Hashtags to include: ${hashtags.join(", ") || "generate relevant ones"}

Return JSON: { "caption": "full caption with line breaks", "hashtags": ["tag1","tag2"], "bio_link_cta": true, "story_companion": "optional story text" }`
  return runAgent(system, user, { jsonMode: true })
}

export async function postToFacebook(
  pageId: string,
  pageAccessToken: string,
  message: string
): Promise<{ success: boolean; postId?: string; postUrl?: string; error?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: pageAccessToken }),
    })
    const data = await res.json()
    if (!res.ok || data.error) return { success: false, error: data.error?.message ?? "Facebook API error" }
    return { success: true, postId: data.id, postUrl: `https://facebook.com/${data.id}` }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}

export async function getFacebookPages(
  userAccessToken: string
): Promise<{ id: string; name: string; access_token: string }[]> {
  const res = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`)
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error?.message ?? "Failed to fetch pages")
  return data.data ?? []
}

export async function postToInstagram(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // Step 1: Create media container
    const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: pageAccessToken }),
    })
    const containerData = await containerRes.json()
    if (!containerRes.ok || containerData.error) {
      return { success: false, error: containerData.error?.message ?? "Failed to create media container" }
    }

    // Step 2: Publish
    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerData.id, access_token: pageAccessToken }),
    })
    const publishData = await publishRes.json()
    if (!publishRes.ok || publishData.error) {
      return { success: false, error: publishData.error?.message ?? "Failed to publish to Instagram" }
    }
    return { success: true, postId: publishData.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}
