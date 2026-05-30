import { runAgent } from "@/lib/claude"

export async function getBufferProfiles(
  accessToken: string
): Promise<{ id: string; service: string; service_username: string }[]> {
  const res = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${accessToken}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error("Invalid Buffer token or no profiles connected")
  return data.map((p: Record<string, unknown>) => ({
    id: p.id as string,
    service: p.service as string,
    service_username: p.service_username as string,
  }))
}

export async function generateMultiPlatformContent(
  businessDescription: string,
  topic: string,
  platforms: string[]
) {
  const system = `You are a multi-platform social media strategist. Each platform has a different ideal format. Return valid JSON only.`
  const user = `Business: ${businessDescription}
Topic: ${topic}
Platforms: ${platforms.join(", ")}

Return JSON with a key per platform. For each platform: { "text": "platform-optimised post", "charCount": number, "tip": "platform-specific tip" }.
Include keys only for these platforms: ${platforms.join(", ")}.
Twitter max 280 chars. LinkedIn use line breaks. Instagram needs hashtags. Facebook is more conversational.`
  return runAgent(system, user, { jsonMode: true })
}

export async function scheduleToBuffer(
  accessToken: string,
  profileIds: string[],
  text: string,
  scheduledAt?: string
): Promise<{ success: boolean; updateId?: string; error?: string }> {
  try {
    const params: Record<string, unknown> = {
      access_token: accessToken,
      text,
      "profile_ids[]": profileIds,
    }
    if (scheduledAt) params.scheduled_at = scheduledAt

    const formBody = Object.entries(params)
      .flatMap(([k, v]) =>
        Array.isArray(v)
          ? (v as string[]).map(val => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`)
          : [`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`]
      )
      .join("&")

    const res = await fetch("https://api.bufferapp.com/1/updates/create.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody,
    })
    const data = await res.json()
    if (!res.ok || data.error) return { success: false, error: String(data.error ?? "Buffer API error") }
    return {
      success: true,
      updateId: (data.updates as Array<Record<string, unknown>>)?.[0]?.id as string,
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}
