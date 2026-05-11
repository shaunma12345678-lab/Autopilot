import Groq from "groq-sdk"

let _groq: Groq | undefined
const getGroq = () => {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return _groq
}

export async function runAgent(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean }
): Promise<string | Record<string, unknown>> {
  const response = await getGroq().chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: options?.maxTokens ?? 2048,
    response_format: options?.jsonMode ? { type: "json_object" } : undefined,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: options?.jsonMode
          ? `${userPrompt}\n\nIMPORTANT: Return valid JSON only. No markdown fences, no preamble.`
          : userPrompt,
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ""

  if (options?.jsonMode) {
    const clean = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim()
    return JSON.parse(clean)
  }

  return text
}
