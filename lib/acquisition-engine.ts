// Acquisition Agent engine (server-only). When switched ON, it works your
// leads for you: every day it enrolls the best new leads into a multi-touch
// outreach sequence, drafts every message, auto-sends email where a provider
// and address exist, and builds a ready-to-fire action queue for the human
// touches (calls, texts, letters). Cold SMS is NEVER auto-sent — texts land in
// the queue as one-tap sms: links you fire yourself (TCPA: no automated cold
// texts, no quiet-hours violations, you see every message before it goes out).
// State lives in AgentMemory (no migration). Best-effort throughout.

import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { leadSignature } from "@/lib/seen-leads"

const SLUG = "re-acquisition"
const CONFIG_KEY = "config"
const STATE_KEY = "state"
const ENROLL_CAP = 300
const QUEUE_CAP = 120
const HISTORY_CAP = 24

export interface AcquisitionConfig {
  enabled: boolean
  dailyLimit: number      // new leads enrolled per run
  minScore: number        // enrollment quality floor
  fromName: string
  fromPhone: string
  autoEmail: boolean      // auto-send intro emails when the lead has an address + Resend is configured
}

export interface TouchRecord { step: number; channel: Channel; at: string; status: "sent" | "queued" }

export interface EnrolledLead {
  sig: string
  addr: string
  city: string
  state: string
  zip: string
  owner: string
  phone: string
  email: string
  score: number
  enrolledAt: string
  step: number            // next sequence index to execute
  nextAt: string          // when that step is due
  paused: boolean
  history: TouchRecord[]
}

export interface ActionItem {
  id: string
  sig: string
  addr: string
  owner: string
  phone: string
  email: string
  channel: Channel
  script: string
  createdAt: string
}

export interface AcquisitionState {
  enrolled: Record<string, EnrolledLead>
  queue: ActionItem[]
  totals: { enrolled: number; touches: number; emailsSent: number }
}

type Channel = "letter" | "sms" | "call" | "email"

export const SEQUENCE: Array<{ day: number; channel: Channel; label: string }> = [
  { day: 0,  channel: "letter", label: "Intro letter" },
  { day: 2,  channel: "email",  label: "Intro email" },
  { day: 4,  channel: "sms",    label: "First text" },
  { day: 7,  channel: "call",   label: "First call" },
  { day: 14, channel: "letter", label: "Follow-up letter" },
  { day: 21, channel: "call",   label: "Second call" },
  { day: 35, channel: "letter", label: "Final letter" },
]

export function defaultConfig(): AcquisitionConfig {
  return { enabled: false, dailyLimit: 5, minScore: 70, fromName: "", fromPhone: "", autoEmail: true }
}

export function emptyState(): AcquisitionState {
  return { enrolled: {}, queue: [], totals: { enrolled: 0, touches: 0, emailsSent: 0 } }
}

// ── Persistence (AgentMemory KV) ──────────────────────────────────────────────

async function loadKey<T>(businessId: string, key: string): Promise<T | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const row = await mem.findFirst({ where: { businessId, agentSlug: SLUG, key } })
    if (row?.value) return JSON.parse(row.value) as T
  } catch { /* first run */ }
  return null
}

async function saveKey(businessId: string, key: string, value: unknown): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = prisma.agentMemory as any
    const json = JSON.stringify(value)
    await mem.upsert({
      where:  { businessId, agentSlug: SLUG, key },
      create: { id: crypto.randomUUID(), businessId, agentSlug: SLUG, key, value: json, updatedAt: new Date().toISOString() },
      update: { value: json, updatedAt: new Date().toISOString() },
    })
  } catch { /* best-effort */ }
}

export async function loadAcquisitionConfig(businessId: string): Promise<AcquisitionConfig> {
  const cfg = await loadKey<AcquisitionConfig>(businessId, CONFIG_KEY)
  return { ...defaultConfig(), ...(cfg ?? {}) }
}

export async function saveAcquisitionConfig(businessId: string, cfg: AcquisitionConfig): Promise<void> {
  await saveKey(businessId, CONFIG_KEY, cfg)
}

export async function loadAcquisitionState(businessId: string): Promise<AcquisitionState> {
  const st = await loadKey<AcquisitionState>(businessId, STATE_KEY)
  if (st && st.enrolled && Array.isArray(st.queue)) return { ...emptyState(), ...st }
  return emptyState()
}

export async function saveAcquisitionState(businessId: string, st: AcquisitionState): Promise<void> {
  await saveKey(businessId, STATE_KEY, st)
}

// ── Message drafting (plain templates; the UI's AI outreach personalizes on demand) ──

function firstName(owner: string): string {
  const n = (owner || "").trim().split(/\s+/)[0] ?? ""
  return /^[a-z]/i.test(n) && !/llc|trust|estate|inc\b/i.test(owner) ? n : "there"
}

export function draftMessage(channel: Channel, lead: { owner: string; addr: string; city: string }, cfg: AcquisitionConfig): string {
  const name = firstName(lead.owner)
  const from = cfg.fromName || "[Your Name]"
  const phone = cfg.fromPhone || "[Your Phone]"
  const prop = [lead.addr, lead.city].filter(Boolean).join(", ")
  switch (channel) {
    case "letter":
      return `Hi ${name},\n\nMy name is ${from}, a local buyer here in ${lead.city || "the area"}. I'm reaching out about your property at ${lead.addr}.\n\nI buy houses as-is for cash — no repairs, no cleaning, no agent fees, and we close on your timeline. If selling has crossed your mind, I'd love to make you a fair, no-obligation offer.\n\nCall or text me anytime at ${phone}. Even if you're just weighing options, I'm happy to share what your home could sell for.`
    case "email":
      return `Hi ${name},\n\nI'm ${from}, a local home buyer. I'm interested in your property at ${prop} and can make a fair as-is cash offer — no repairs, no fees, close on your timeline.\n\nWould a quick 10-minute call this week work? You can reach me at ${phone}.\n\nNo pressure either way — if selling isn't right for you, no problem at all.\n\n${from}\n${phone}`
    case "sms":
      return `Hi ${name}, this is ${from} — a local buyer, not an agent. I'm interested in your property at ${lead.addr} and can offer cash, as-is, on your timeline. Open to a quick chat? (Reply STOP to opt out.)`
    case "call":
      return `CALL SCRIPT — ${prop}\n1) "Hi, is this ${lead.owner || "the owner of " + lead.addr}? This is ${from}, a local buyer — did I catch you at an OK time?"\n2) "I work with homeowners around ${lead.city || "the area"} and I'm interested in your property at ${lead.addr}. Have you thought about selling?"\n3) LISTEN. Their situation drives everything — timeline, condition, what they owe.\n4) "I buy as-is for cash, no fees, and can close on your schedule. Would it help if I put a written offer in front of you this week?"\n5) Book a time. Confirm their best phone. Thank them either way.`
  }
}

// ── The daily/one-click step ──────────────────────────────────────────────────

export interface RunResult {
  enrolledNew: number
  emailsSent: number
  queuedActions: number
  due: number
}

export async function runAcquisitionStep(
  businessId: string,
  candidates: ForeclosureLead[],
): Promise<RunResult> {
  const cfg = await loadAcquisitionConfig(businessId)
  const st = await loadAcquisitionState(businessId)
  const now = new Date()
  const nowIso = now.toISOString()
  const result: RunResult = { enrolledNew: 0, emailsSent: 0, queuedActions: 0, due: 0 }
  if (!cfg.enabled) return result

  // 1) Enroll the best new candidates (quality floor, dedup, daily cap).
  const eligible = candidates
    .filter((l) => l.address && (l.score ?? 0) >= cfg.minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  for (const lead of eligible) {
    if (result.enrolledNew >= Math.max(0, cfg.dailyLimit)) break
    const sig = leadSignature(lead)
    if (!sig || sig.length < 4 || st.enrolled[sig]) continue
    st.enrolled[sig] = {
      sig,
      addr: lead.address,
      city: lead.city ?? "",
      state: lead.state ?? "",
      zip: lead.zip ?? "",
      owner: lead.ownerName ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      score: lead.score ?? 0,
      enrolledAt: nowIso,
      step: 0,
      nextAt: nowIso, // first touch due immediately
      paused: false,
      history: [],
    }
    result.enrolledNew++
    st.totals.enrolled++
  }

  // 2) Execute every due step: auto-send email where allowed; everything else
  //    becomes a queued action with the full draft attached.
  const queuedSigs = new Set(st.queue.map((q) => `${q.sig}|${q.channel}`))
  for (const lead of Object.values(st.enrolled)) {
    if (lead.paused || lead.step >= SEQUENCE.length) continue
    if (new Date(lead.nextAt).getTime() > now.getTime()) continue
    result.due++
    const stepDef = SEQUENCE[lead.step]
    const script = draftMessage(stepDef.channel, lead, cfg)

    let status: TouchRecord["status"] = "queued"
    if (stepDef.channel === "email" && cfg.autoEmail && lead.email) {
      const ok = await sendEmail(
        lead.email,
        `About your property at ${lead.addr}`,
        script.split("\n").map((l) => `<p>${l || "&nbsp;"}</p>`).join(""),
      ).catch(() => false)
      if (ok) { status = "sent"; result.emailsSent++; st.totals.emailsSent++ }
    }

    if (status === "queued") {
      const dupeKey = `${lead.sig}|${stepDef.channel}`
      if (!queuedSigs.has(dupeKey)) {
        st.queue.push({
          id: crypto.randomUUID(),
          sig: lead.sig,
          addr: [lead.addr, lead.city].filter(Boolean).join(", "),
          owner: lead.owner,
          phone: lead.phone,
          email: lead.email,
          channel: stepDef.channel,
          script,
          createdAt: nowIso,
        })
        queuedSigs.add(dupeKey)
        result.queuedActions++
      }
    }

    lead.history = [...lead.history, { step: lead.step, channel: stepDef.channel, at: nowIso, status }].slice(-HISTORY_CAP)
    st.totals.touches++
    lead.step += 1
    if (lead.step < SEQUENCE.length) {
      const next = new Date(now)
      next.setDate(next.getDate() + Math.max(1, SEQUENCE[lead.step].day - stepDef.day))
      lead.nextAt = next.toISOString()
    }
  }

  // 3) Caps: keep the freshest enrollments and the newest queue items.
  const entries = Object.values(st.enrolled)
  if (entries.length > ENROLL_CAP) {
    entries.sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt))
    for (const drop of entries.slice(0, entries.length - ENROLL_CAP)) delete st.enrolled[drop.sig]
  }
  st.queue = st.queue.slice(-QUEUE_CAP)

  await saveAcquisitionState(businessId, st)
  return result
}
