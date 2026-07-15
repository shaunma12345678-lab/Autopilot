// Inbound Sellers — the homeowner-side lead channel. The public /sell page
// POSTs here when a distressed homeowner asks for a cash offer; these are
// hand-raised, exclusive leads no competitor can scrape. Stored in AgentMemory
// (no migration). GET/PATCH are operator-only (list + work the leads). Alerts
// the operator instantly by email/SMS when a new seller comes in (best-effort).

export const maxDuration = 20

import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { resolveLearningBusinessId } from "@/lib/learning-store"
import { sendEmail } from "@/lib/email"
import { sendSms } from "@/lib/sms"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access
const SLUG = "re-inbound-sellers"
const KEY = "list"
const CAP = 500
const MAX_FIELD = 200
const MAX_NOTE = 1000

export interface InboundSeller {
  id: string
  createdAt: string
  status: "new" | "contacted" | "appointment" | "offer" | "closed" | "dead"
  name: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  zip: string
  situation: string
  timeframe: string
  owed: string
}

function isAuthorized(request: NextRequest, user: unknown): boolean {
  if (user) return true
  return ADMIN_PASSWORD.length > 0 && request.headers.get("x-admin-password") === ADMIN_PASSWORD
}

function clean(v: unknown, max = MAX_FIELD): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

async function loadList(bizId: string): Promise<InboundSeller[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId: bizId, agentSlug: SLUG, key: KEY } })
    if (row?.value) { const parsed = JSON.parse(row.value); if (Array.isArray(parsed)) return parsed }
  } catch { /* first run */ }
  return []
}

async function saveList(bizId: string, list: InboundSeller[]): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const value = JSON.stringify(list.slice(-CAP))
    await mem.upsert({
      where:  { businessId: bizId, agentSlug: SLUG, key: KEY },
      create: { id: crypto.randomUUID(), businessId: bizId, agentSlug: SLUG, key: KEY, value, updatedAt: new Date().toISOString() },
      update: { value, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

// Public: a homeowner asked for a cash offer. Honeypot + field caps keep bots out.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }

  // Honeypot: real users never fill the hidden "website" field.
  if (clean(body.website)) return Response.json({ ok: true })

  const seller: InboundSeller = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "new",
    name: clean(body.name),
    phone: clean(body.phone, 40),
    email: clean(body.email),
    address: clean(body.address),
    city: clean(body.city, 80),
    state: clean(body.state, 2).toUpperCase(),
    zip: clean(body.zip, 10),
    situation: clean(body.situation, MAX_NOTE),
    timeframe: clean(body.timeframe, 60),
    owed: clean(body.owed, 40),
  }
  if (!seller.address || (!seller.phone && !seller.email)) {
    return Response.json({ error: "Please include your property address and a phone or email so we can reach you." }, { status: 400 })
  }

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ error: "We couldn't save your request — please try again shortly." }, { status: 503 })
    const list = await loadList(bizId)
    // One submission per address+contact — repeat submits just refresh the note.
    const dupe = list.find((s) => s.address.toLowerCase() === seller.address.toLowerCase() && (s.phone === seller.phone || s.email === seller.email))
    if (dupe) {
      dupe.situation = seller.situation || dupe.situation
      dupe.timeframe = seller.timeframe || dupe.timeframe
      await saveList(bizId, list)
      return Response.json({ ok: true })
    }
    list.push(seller)
    await saveList(bizId, list)

    // Instant operator alert — an inbound motivated seller is the hottest lead there is.
    const label = [seller.address, seller.city, seller.state].filter(Boolean).join(", ")
    const notifyEmail = process.env.AUTOPILOT_NOTIFY_EMAIL ?? ""
    const notifyPhone = process.env.AUTOPILOT_NOTIFY_PHONE ?? ""
    if (notifyEmail) {
      void sendEmail(
        notifyEmail,
        `🔥 Inbound seller: ${label}`,
        `<h2>A homeowner just asked for a cash offer</h2>
         <p><b>${seller.name || "Name not given"}</b> — ${seller.phone || "no phone"} · ${seller.email || "no email"}</p>
         <p><b>Property:</b> ${label} ${seller.zip}</p>
         <p><b>Timeframe:</b> ${seller.timeframe || "not specified"} · <b>Owed:</b> ${seller.owed || "not specified"}</p>
         <p><b>Situation:</b> ${seller.situation || "—"}</p>
         <p>Open Admin → 📥 Inbound Sellers to work this lead. Speed wins: call within 5 minutes.</p>`,
      ).catch(() => {})
    }
    if (notifyPhone) {
      void sendSms(notifyPhone, `🔥 Inbound seller: ${label}. ${seller.name || ""} ${seller.phone || seller.email}. Call now — Admin → Inbound Sellers.`).catch(() => {})
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: "We couldn't save your request — please try again shortly." }, { status: 500 })
  }
}

// Operator: list inbound sellers, newest first.
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ sellers: [] })
    const list = await loadList(bizId)
    return Response.json({ sellers: [...list].reverse() })
  } catch {
    return Response.json({ sellers: [] })
  }
}

// Operator: update a lead's status as it moves through the pipeline.
export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAuthorized(request, user)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: string; status?: string }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }) }
  const statuses: InboundSeller["status"][] = ["new", "contacted", "appointment", "offer", "closed", "dead"]
  const status = statuses.find((s) => s === body.status)
  if (!body.id || !status) return Response.json({ error: "id and a valid status are required" }, { status: 400 })

  try {
    const bizId = await resolveLearningBusinessId()
    if (!bizId) return Response.json({ error: "No business account yet" }, { status: 503 })
    const list = await loadList(bizId)
    const item = list.find((s) => s.id === body.id)
    if (!item) return Response.json({ error: "Lead not found" }, { status: 404 })
    item.status = status
    await saveList(bizId, list)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: "Couldn't update — try again." }, { status: 500 })
  }
}
