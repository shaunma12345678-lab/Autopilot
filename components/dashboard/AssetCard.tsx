"use client"

// Unified Asset Card — the markets equivalent of the property Deal Card v2.
//
// Mirrors that structure deliberately: a strength axis and a RISK axis scored
// separately (never collapsed into one number), a data-confidence indicator so
// the user knows how much of the card is verified versus computed, contributing
// reasons always visible, and per-field source attribution available on demand.
//
// The BUY/HOLD/PASS badge sits on top of — not instead of — those two axes, and
// always renders its own rationale so the signal is auditable rather than opaque.

import { actionSignalStyle } from "@/lib/action-signal"

export interface AssetCardMetric {
  label: string
  value: string
  /** Optional emphasis when a value is notably good. */
  highlight?: boolean
}

export interface AssetCardProps {
  symbol: string
  name: string
  subtitle?: string | null
  qualityScore: number | null
  riskScore: number | null
  strengthTier: string | null
  actionSignal?: string | null
  actionRationale?: string | null
  dataConfidence: "insufficient" | "low" | "medium" | "high" | string
  dataCompletenessPct: number | null
  qualityReasons: string[] | null
  riskFlags: string[] | null
  metrics: AssetCardMetric[]
  integritySummary?: string | null
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  B: "text-blue-300 border-blue-500/40 bg-blue-500/10",
  C: "text-yellow-300 border-yellow-500/40 bg-yellow-500/10",
  D: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  F: "text-red-400 border-red-500/40 bg-red-500/10",
}

export function gradeFromScore(score: number): string {
  if (score >= 80) return "A"
  if (score >= 65) return "B"
  if (score >= 50) return "C"
  if (score >= 35) return "D"
  return "F"
}

const TIER_LABEL: Record<string, string> = {
  strong: "Strong fundamentals",
  mixed: "Mixed fundamentals",
  weak: "Weak fundamentals",
}

const CONFIDENCE_LABEL: Record<string, { label: string; color: string }> = {
  insufficient: { label: "Insufficient data", color: "text-gray-500" },
  low: { label: "Low confidence", color: "text-orange-400" },
  medium: { label: "Medium confidence", color: "text-yellow-400" },
  high: { label: "High confidence", color: "text-emerald-400" },
}

function riskStyle(score: number): { label: string; color: string } {
  if (score >= 70) return { label: "High risk", color: "text-red-400 border-red-500/40 bg-red-500/10" }
  if (score >= 45) return { label: "Elevated risk", color: "text-orange-300 border-orange-500/40 bg-orange-500/10" }
  if (score >= 25) return { label: "Moderate risk", color: "text-yellow-300 border-yellow-500/40 bg-yellow-500/10" }
  return { label: "Lower risk", color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" }
}

function Metric({ label, value, highlight }: AssetCardMetric) {
  return (
    <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-gray-500 font-medium">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${highlight ? "text-emerald-400" : "text-white"}`}>{value}</p>
    </div>
  )
}

export default function AssetCard(props: AssetCardProps) {
  const {
    symbol, name, subtitle, qualityScore, riskScore, strengthTier,
    actionSignal, actionRationale,
    dataConfidence, dataCompletenessPct, qualityReasons, riskFlags, metrics, integritySummary,
  } = props

  const confidence = CONFIDENCE_LABEL[dataConfidence] ?? CONFIDENCE_LABEL.insufficient

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{symbol} — {name}</p>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actionSignal && (
          <div className={`shrink-0 rounded-xl border px-4 py-2 text-center ${actionSignalStyle(actionSignal)}`}>
            <p className="text-lg font-black tracking-wide">{actionSignal.toUpperCase()}</p>
          </div>
        )}
      </div>

      {actionSignal && actionRationale && (
        <div className={`rounded-xl border px-4 py-2.5 ${actionSignalStyle(actionSignal)}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Why {actionSignal.toUpperCase()}</p>
          <p className="text-xs mt-0.5">{actionRationale}</p>
        </div>
      )}

      {qualityScore === null ? (
        <div className="rounded-xl bg-gray-800/40 border border-dashed border-gray-700/50 px-4 py-4">
          <p className="text-sm text-gray-400">{confidence.label} — not enough data to analyze this reliably.</p>
          {qualityReasons?.[0] && <p className="text-xs text-gray-500 mt-1">{qualityReasons[0]}</p>}
          <p className="text-[10px] text-gray-600 mt-2">
            Showing nothing is deliberate here — a score built on thin data would look authoritative without being trustworthy.
          </p>
        </div>
      ) : (
        <>
          {/* Two independent axes, side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${GRADE_COLORS[gradeFromScore(qualityScore)]}`}>
              <div>
                <p className="text-xs font-semibold opacity-70">Fundamental Strength</p>
                <p className="text-lg font-black">{qualityScore}/100</p>
                <p className="text-[10px] opacity-80 mt-0.5">{TIER_LABEL[strengthTier ?? ""] ?? "Assessed"}</p>
              </div>
              <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-xl font-black ${GRADE_COLORS[gradeFromScore(qualityScore)]}`}>
                {gradeFromScore(qualityScore)}
              </div>
            </div>

            {riskScore !== null && (
              <div className={`rounded-xl border px-4 py-3 ${riskStyle(riskScore).color}`}>
                <p className="text-xs font-semibold opacity-70">Risk</p>
                <p className="text-lg font-black">{riskScore}/100</p>
                <p className="text-[10px] opacity-80 mt-0.5">{riskStyle(riskScore).label}</p>
              </div>
            )}
          </div>

          {/* Data confidence — how much of this card is verified */}
          <div className="rounded-xl border border-gray-700/40 bg-gray-900/40 px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Data Confidence</p>
              <p className={`text-[11px] font-semibold ${confidence.color}`}>
                {confidence.label}{dataCompletenessPct !== null ? ` · ${dataCompletenessPct}% complete` : ""}
              </p>
            </div>
            {integritySummary && <p className="text-[10px] text-gray-500 mt-1">{integritySummary}</p>}
          </div>

          {metrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {metrics.map(m => <Metric key={m.label} {...m} />)}
            </div>
          )}

          {riskFlags && riskFlags.length > 0 && (
            <div className="rounded-xl bg-red-500/8 border border-red-500/25 px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold text-red-300 uppercase tracking-wide">Risk Flags</p>
              {riskFlags.map((flag, i) => (
                <p key={i} className="text-[11px] text-red-300/90">{flag}</p>
              ))}
            </div>
          )}

          {qualityReasons && qualityReasons.length > 0 && (
            <div className="rounded-xl bg-gray-800/60 border border-gray-700/30 px-4 py-3 space-y-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Why This Score</p>
              {qualityReasons.map((reason, i) => (
                <p key={i} className="text-[11px] text-gray-400">{reason}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
