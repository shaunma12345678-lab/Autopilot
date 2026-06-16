// #9 CRM pipeline — per-lead deal stage, saved locally. Pins can be colored by
// stage so the map doubles as your pipeline board. Client-only, null-safe.

export type CrmStage = "new" | "contacted" | "offer" | "contract" | "closed" | "dead"

export const CRM_STAGES: { id: CrmStage; label: string; color: string }[] = [
  { id: "new",       label: "New",       color: "#64748b" },
  { id: "contacted", label: "Contacted", color: "#3b82f6" },
  { id: "offer",     label: "Offer",     color: "#a855f7" },
  { id: "contract",  label: "Contract",  color: "#f59e0b" },
  { id: "closed",    label: "Closed",    color: "#22c55e" },
  { id: "dead",      label: "Dead",      color: "#ef4444" },
]

export type CrmMap = Record<number, CrmStage>
const KEY = "ap_crm_v1"

export function loadCrm(): CrmMap {
  if (typeof window === "undefined") return {}
  try { const raw = window.localStorage.getItem(KEY); const a = raw ? JSON.parse(raw) : {}; return a && typeof a === "object" ? a : {} } catch { return {} }
}

export function persistCrm(map: CrmMap): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(KEY, JSON.stringify(map)); window.dispatchEvent(new Event(CRM_EVENT)) } catch { /* quota */ }
}

export function crmColor(stage: CrmStage | undefined): string {
  return CRM_STAGES.find((s) => s.id === stage)?.color ?? "#64748b"
}

export function crmLabel(stage: CrmStage | undefined): string {
  return CRM_STAGES.find((s) => s.id === stage)?.label ?? "New"
}

// ── Follow-up reminders (next action + due date per lead) ─────────────────────
export interface Reminder { note: string; due: string } // due = YYYY-MM-DD
export type ReminderMap = Record<number, Reminder>
const R_KEY = "ap_crm_reminders_v1"
export const CRM_EVENT = "ap-crm-changed"

export function loadReminders(): ReminderMap {
  if (typeof window === "undefined") return {}
  try { const raw = window.localStorage.getItem(R_KEY); const a = raw ? JSON.parse(raw) : {}; return a && typeof a === "object" ? a : {} } catch { return {} }
}

export function setReminder(id: number, reminder: Reminder | null): ReminderMap {
  const map = loadReminders()
  if (reminder && reminder.due) map[id] = reminder; else delete map[id]
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(R_KEY, JSON.stringify(map)); window.dispatchEvent(new Event(CRM_EVENT)) } catch { /* quota */ }
  }
  return map
}

// "overdue" | "today" | "upcoming" | null
export function reminderStatus(due: string | undefined): "overdue" | "today" | "upcoming" | null {
  if (!due) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(due + "T00:00:00")
  if (Number.isNaN(d.getTime())) return null
  if (d < today) return "overdue"
  if (d.getTime() === today.getTime()) return "today"
  return "upcoming"
}
