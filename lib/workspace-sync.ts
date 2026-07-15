"use client"

// Workspace sync — makes the browser stores durable without touching a single
// consumer. localStorage stays the fast synchronous cache every component
// already reads; this module mirrors each store to the database (last-write-
// wins) and back. `initWorkspaceSync(headers)` runs once per session: pulls
// newer server copies into localStorage (firing the stores' change events so
// open UIs refresh), then pushes anything local the server hasn't seen — which
// doubles as the one-time import of a user's existing data. Mutating helpers
// (persistCrm, saveBuyers, …) call `schedulePush(kind)`; pushes are debounced
// and silently no-op until init has provided auth headers. Never throws.

export type WorkspaceKind = "crm" | "crmReminders" | "buyers" | "buybox" | "farms" | "driving" | "zoneAlerts" | "voiceCustom"

const KIND_TO_KEY: Record<WorkspaceKind, string> = {
  crm: "ap_crm_v1",
  crmReminders: "ap_crm_reminders_v1",
  buyers: "ap_buyers_v1",
  buybox: "ap_buybox_v1",
  farms: "ap_farm_zones_v1",
  driving: "ap_driving_leads_v1",
  zoneAlerts: "ap_zone_alerts_v1",
  voiceCustom: "ap_voice_custom_v1",
}

// Change events some stores already broadcast — refire after a server pull so
// mounted components re-read localStorage.
const KIND_EVENT: Partial<Record<WorkspaceKind, string>> = {
  crm: "ap-crm-changed",
  buyers: "ap-buyers-changed",
}

const TS_KEY = "ap_ws_ts_v1"
let headers: Record<string, string> | null = null
let pulled = false
const pushTimers = new Map<WorkspaceKind, ReturnType<typeof setTimeout>>()

function loadTs(): Record<string, string> {
  try { const raw = window.localStorage.getItem(TS_KEY); const o = raw ? JSON.parse(raw) : {}; return o && typeof o === "object" ? o : {} } catch { return {} }
}
function saveTs(ts: Record<string, string>): void {
  try { window.localStorage.setItem(TS_KEY, JSON.stringify(ts)) } catch { /* quota */ }
}

function readLocal(kind: WorkspaceKind): unknown {
  try {
    const raw = window.localStorage.getItem(KIND_TO_KEY[kind])
    if (raw == null) return null
    if (kind === "voiceCustom") return raw          // plain string store
    return JSON.parse(raw)
  } catch { return null }
}

function writeLocal(kind: WorkspaceKind, value: unknown): void {
  try {
    const raw = kind === "voiceCustom" ? String(value ?? "") : JSON.stringify(value)
    window.localStorage.setItem(KIND_TO_KEY[kind], raw)
    const ev = KIND_EVENT[kind]
    if (ev) window.dispatchEvent(new Event(ev))
  } catch { /* quota */ }
}

function hasContent(v: unknown): boolean {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "string") return v.trim().length > 0
  if (typeof v === "object") return Object.keys(v as object).length > 0
  return true
}

async function pushNow(kind: WorkspaceKind): Promise<void> {
  if (!headers || typeof window === "undefined") return
  const value = readLocal(kind)
  if (value == null) return
  try {
    const res = await fetch("/api/workspace", { method: "POST", headers, body: JSON.stringify({ kind, value }) })
    const d = await res.json().catch(() => null)
    if (d?.updatedAt) { const ts = loadTs(); ts[kind] = d.updatedAt; saveTs(ts) }
  } catch { /* retried on next mutation or next session */ }
}

// Debounced push — call this from every mutating store helper.
export function schedulePush(kind: WorkspaceKind): void {
  if (typeof window === "undefined") return
  const t = pushTimers.get(kind)
  if (t) clearTimeout(t)
  pushTimers.set(kind, setTimeout(() => { void pushNow(kind) }, 1500))
}

// One-shot session init: pull newer server copies, then push local-only data.
export async function initWorkspaceSync(authHeaders: Record<string, string>): Promise<void> {
  if (typeof window === "undefined") return
  headers = { "Content-Type": "application/json", ...authHeaders }
  if (pulled) return
  pulled = true
  try {
    const res = await fetch("/api/workspace", { headers })
    const d = await res.json().catch(() => null)
    const stores: Record<string, { value: unknown; updatedAt: string }> = d?.stores ?? {}
    const ts = loadTs()
    for (const kind of Object.keys(KIND_TO_KEY) as WorkspaceKind[]) {
      const server = stores[kind]
      const localSynced = ts[kind] ? Date.parse(ts[kind]) : 0
      const local = readLocal(kind)
      if (server && Date.parse(server.updatedAt) > localSynced && hasContent(server.value)) {
        // Server is newer than our last sync → adopt it (multi-device wins).
        writeLocal(kind, server.value)
        ts[kind] = server.updatedAt
      } else if (hasContent(local) && (!server || !hasContent(server.value))) {
        // Server has nothing → import this browser's data (the migration).
        void pushNow(kind)
      }
    }
    saveTs(ts)
  } catch { /* offline / unauthorized — local keeps working as before */ }
}
