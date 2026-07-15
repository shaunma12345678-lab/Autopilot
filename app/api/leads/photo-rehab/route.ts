// Photo rehab estimator — give it a property photo (listing image URL or a
// pasted data URL) and Groq vision assesses condition + a fix-&-flip rehab
// scope and $/sqft. Robust: returns a clear note on any failure, never throws.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

const PROMPT =
  "You are a fix-and-flip renovation estimator. Look at this property photo and assess its condition for an investor. " +
  "Return raw JSON only: { \"condition\": \"move-in\"|\"cosmetic\"|\"dated\"|\"heavy\"|\"gut\", \"level\": \"light\"|\"medium\"|\"heavy\", " +
  "\"psf\": number (estimated rehab cost per square foot in USD), \"issues\": string[] (visible problems, e.g. 'worn roof', 'dated kitchen', 'overgrown yard'), " +
  "\"summary\": string (one sentence) }. If it isn't a property photo, set condition to \"move-in\", psf 0 and say so in summary.";

function safeParse(s: string): Record<string, unknown> | null {
  try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null } catch { return null }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { imageUrl?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const imageUrl = (body.imageUrl || "").trim()
  if (!imageUrl || !/^(https?:\/\/|data:image\/)/.test(imageUrl)) {
    return Response.json({ error: "Provide an image URL (https://…) or a pasted image (data:image/…)." }, { status: 400 })
  }
  if (!process.env.GROQ_API_KEY) return Response.json({ error: "Vision model not configured." }, { status: 200 })

  try {
    const Groq = (await import("groq-sdk")).default
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      max_tokens: 500,
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: imageUrl } },
        { type: "text", text: PROMPT },
      ] }],
    })
    const text = response.choices[0]?.message?.content ?? ""
    const obj = safeParse(text)
    if (!obj) return Response.json({ found: false, note: "Couldn't read that image — try a clearer property photo." })
    const psf = Number(obj.psf)
    return Response.json({
      found: true,
      condition: typeof obj.condition === "string" ? obj.condition : "dated",
      level: obj.level === "light" || obj.level === "heavy" ? obj.level : "medium",
      psf: Number.isFinite(psf) ? Math.round(psf) : null,
      issues: Array.isArray(obj.issues) ? (obj.issues as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 8) : [],
      summary: typeof obj.summary === "string" ? obj.summary : "",
    })
  } catch (err) {
    return Response.json({ found: false, error: err instanceof Error ? err.message : "Vision analysis failed" }, { status: 200 })
  }
}
