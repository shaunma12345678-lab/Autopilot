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
  try { window.localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* quota */ }
}

export function crmColor(stage: CrmStage | undefined): string {
  return CRM_STAGES.find((s) => s.id === stage)?.color ?? "#64748b"
}

export function crmLabel(stage: CrmStage | undefined): string {
  return CRM_STAGES.find((s) => s.id === stage)?.label ?? "New"
}
