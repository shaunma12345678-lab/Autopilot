import Anthropic from "@anthropic-ai/sdk"

let _client: Anthropic | undefined
const getClient = () => {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export async function runAgent(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean }
): Promise<string | Record<string, unknown>> {
  const client = getClient()

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: options?.maxTokens ?? 2048,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: options?.jsonMode
          ? `${userPrompt}\n\nIMPORTANT: Return valid JSON only. No markdown fences, no preamble.`
          : userPrompt,
      },
    ],
  })

  const text = response.content[0]?.type === "text" ? response.content[0].text : ""

  if (options?.jsonMode) {
    const clean = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim()
    return JSON.parse(clean)
  }

  return text
}
