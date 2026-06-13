"use client"

const SIGNAL_CONFIG: Record<string, { label: string; color: string; dot: string; layer: number }> = {
  nod:              { label: "Notice of Default",       color: "border-red-500/40 bg-red-500/8 text-red-300",     dot: "bg-red-500",     layer: 1 },
  lis_pendens:      { label: "Lis Pendens Filed",       color: "border-red-500/40 bg-red-500/8 text-red-300",     dot: "bg-red-500",     layer: 1 },
  notice_of_sale:   { label: "Notice of Trustee Sale",  color: "border-red-600/50 bg-red-600/12 text-red-200",    dot: "bg-red-600",     layer: 1 },
  tax_delinquent:   { label: "Tax Delinquency",         color: "border-orange-500/40 bg-orange-500/8 text-orange-300", dot: "bg-orange-500", layer: 2 },
  code_violation:   { label: "Code Violation",          color: "border-yellow-500/40 bg-yellow-500/8 text-yellow-300", dot: "bg-yellow-500", layer: 2 },
  hoa_lien:         { label: "HOA Lien Filed",          color: "border-amber-500/40 bg-amber-500/8 text-amber-300", dot: "bg-amber-500",   layer: 2 },
  quitclaim:        { label: "Quitclaim Deed",          color: "border-purple-500/40 bg-purple-500/8 text-purple-300", dot: "bg-purple-500", layer: 2 },
  probate:          { label: "Probate Filed",           color: "border-blue-500/40 bg-blue-500/8 text-blue-300",  dot: "bg-blue-400",    layer: 3 },
  divorce:          { label: "Divorce / Dissolution",   color: "border-teal-500/40 bg-teal-500/8 text-teal-300",  dot: "bg-teal-400",    layer: 3 },
  obituary_match:   { label: "Owner Obituary Match",    color: "border-gray-500/40 bg-gray-500/8 text-gray-300",  dot: "bg-gray-400",    layer: 3 },
  business_closure: { label: "Business Closure",        color: "border-slate-500/40 bg-slate-500/8 text-slate-300", dot: "bg-slate-400",  layer: 3 },
}

interface RawSignalRow {
  id: string
  signalType: string
  signalDate: string
  source: string
  rawData: Record<string, unknown>
  apn?: string
}

interface Props {
  signals: RawSignalRow[]
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return d
  }
}

function layerBadge(layer: number) {
  const cls = layer === 1
    ? "bg-red-500/15 text-red-300 border-red-500/30"
    : layer === 2
    ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
    : "bg-blue-500/15 text-blue-300 border-blue-500/30"
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>Layer {layer}</span>
}

export default function SignalTimeline({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700/50 px-4 py-5 text-center">
        <p className="text-sm text-gray-500">No signals recorded yet</p>
      </div>
    )
  }

  const sorted = [...signals].sort((a, b) => new Date(a.signalDate).getTime() - new Date(b.signalDate).getTime())

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Signal History</p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gray-700/50" />

        <div className="space-y-3 pl-8">
          {sorted.map((sig, i) => {
            const cfg = SIGNAL_CONFIG[sig.signalType] ?? {
              label: sig.signalType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
              color: "border-gray-600/40 bg-gray-600/8 text-gray-300",
              dot: "bg-gray-400",
              layer: 2,
            }
            const rawData = sig.rawData as Record<string, unknown>

            return (
              <div key={sig.id} className="relative">
                {/* Dot */}
                <div className={`absolute -left-5 top-3 w-3 h-3 rounded-full border-2 border-gray-900 ${cfg.dot}`} />

                <div className={`rounded-xl border px-4 py-3 ${cfg.color}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold">{cfg.label}</span>
                      {layerBadge(cfg.layer)}
                      {i === sorted.length - 1 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/20">Latest</span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(sig.signalDate)}</span>
                  </div>
                  {Boolean(rawData.ownerName || rawData.amount || rawData.notes || rawData.lender) && (
                    <div className="mt-1.5 text-[11px] text-gray-400 space-y-0.5">
                      {rawData.ownerName != null && <p>Owner: {String(rawData.ownerName)}</p>}
                      {rawData.lender != null && <p>Lender: {String(rawData.lender)}</p>}
                      {rawData.amount != null && <p>Amount: ${Number(rawData.amount).toLocaleString()}</p>}
                      {rawData.notes != null && <p>{String(rawData.notes)}</p>}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-600 mt-1">Source: {sig.source}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
