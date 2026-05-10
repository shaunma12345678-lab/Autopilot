import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function runAgent(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean }
): Promise<string | Record<string, unknown>> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: options?.maxTokens ?? 2048,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  })

  const text =
    response.content[0].type === "text" ? response.content[0].text : ""

  if (options?.jsonMode) {
    const clean = text.replace(/```json\n?|\n?```/g, "").trim()
    return JSON.parse(clean)
  }

  return text
}
