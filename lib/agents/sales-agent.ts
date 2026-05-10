import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an expert sales coach. Return valid JSON only.`

export async function generateSalesScript(params: {
  businessName: string
  service: string
  price: string
  targetCustomer: string
  objections: string[]
  uvp: string
}): Promise<{
  phoneOpener: string
  emailOpener: string
  inPersonOpener: string
  discoveryQuestions: string[]
  valuePitch: string
  objectionHandlers: Record<string, string>
  closingLines: { soft: string; medium: string; direct: string }
  followUpScript: string
}> {
  const user = `Create a complete sales script for ${params.businessName}.
Service: ${params.service}
Price: ${params.price}
Target customer: ${params.targetCustomer}
Objections: ${params.objections.join(", ")}
UVP: ${params.uvp}

Return JSON with all fields.`

  return (await runAgent(SYSTEM_PROMPT, user, {
    jsonMode: true,
    maxTokens: 3000,
  })) as ReturnType<typeof generateSalesScript> extends Promise<infer T> ? T : never
}
