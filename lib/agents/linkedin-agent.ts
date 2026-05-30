import { runAgent } from "@/lib/claude"

export async function generateLinkedInPost(
  businessDescription: string,
  topic: string,
  postType: "thought-leadership" | "company-update" | "case-study" | "hiring"
) {
  const system = `You are a LinkedIn content strategist who creates posts that get 5-10x average engagement. You understand LinkedIn's algorithm favors dwell time, so posts should be compelling start-to-finish. Return valid JSON only.`
  const user = `Business: ${businessDescription}
Topic: ${topic}
Post type: ${postType}

Return JSON: { "post": "full post with line breaks (use \\n\\n between paragraphs)", "hook": "first 2 lines only", "hashtags": ["tag1","tag2","tag3"], "estimatedReach": "e.g. 2-5x connections", "bestTime": "e.g. Tuesday 8-10am" }`
  return runAgent(system, user, { jsonMode: true })
}

export async function getLinkedInProfile(
  accessToken: string
): Promise<{ id: string; name: string; error?: string }> {
  try {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    if (!res.ok) return { id: "", name: "", error: data.message ?? "Failed to fetch profile" }
    return { id: data.sub, name: data.name ?? "LinkedIn User" }
  } catch (e) {
    return { id: "", name: "", error: e instanceof Error ? e.message : "Request failed" }
  }
}

export async function postToLinkedIn(
  accessToken: string,
  personId: string,
  text: string
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:person:${personId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.message ?? "LinkedIn API error" }
    return { success: true, postId: data.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}
