// Deal-alert SMS endpoint. The Live Distress Map calls this when new HOT deals
// appear inside a saved farm zone. Auth-gated (SMS costs money) and graceful:
// returns { configured:false } when no SMS provider key is set, so the client
// can fall back to an in-app banner without erroring.

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendSms, isSmsConfigured } from "@/lib/sms"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  if (!isSmsConfigured()) {
    return Response.json({ configured: false, note: "SMS alerts not enabled. Add TWILIO_* or TEXTBELT_API_KEY to text deal alerts." })
  }

  let body: { phone?: string; message?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  if (!body.phone || !body.message) return Response.json({ error: "phone and message are required" }, { status: 400 })

  const result = await sendSms(String(body.phone), String(body.message))
  return Response.json({ configured: true, ...result })
}
