// On-demand direct mail — print & mail a physical letter to an owner via Lob.
// User-initiated per lead. Sending costs money and is not reversible, so this is
// never automatic and requires LOB_API_KEY to be configured.

export const maxDuration = 30

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendLetter, isDirectMailConfigured, type MailAddress } from "@/lib/direct-mail"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function validAddress(a: Partial<MailAddress> | undefined): a is MailAddress {
  return Boolean(a && a.name && a.line1 && a.city && a.state && a.zip)
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  if (!isDirectMailConfigured()) {
    return Response.json({
      configured: false,
      note: "Direct mail is not enabled. Add LOB_API_KEY (lob.com) to print & mail physical letters from inside the app.",
    })
  }

  let body: { to?: Partial<MailAddress>; from?: Partial<MailAddress>; body?: string; color?: boolean }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  if (!validAddress(body.to))   return Response.json({ error: "Complete recipient address required (name, line1, city, state, zip)" }, { status: 400 })
  if (!validAddress(body.from)) return Response.json({ error: "Complete return address required (name, line1, city, state, zip)" }, { status: 400 })
  if (!body.body?.trim())       return Response.json({ error: "Letter body is required" }, { status: 400 })

  try {
    const result = await sendLetter({ to: body.to, from: body.from, body: body.body, color: body.color })
    if (!result) return Response.json({ configured: false }, { status: 500 })
    return Response.json({ configured: true, sent: true, mail: result })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Direct mail failed" }, { status: 500 })
  }
}
