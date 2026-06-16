"use client"

// Manage your cash buyers and their buy-boxes. Stored locally; every deal then
// shows which of these buyers it fits (see BuyerMatch in the lead card).

import { useState } from "react"
import { loadBuyers, saveBuyers, type Buyer } from "@/lib/buyers"

const EXITS = ["Wholesale", "Flip", "BRRRR", "Hold"]
const blank = (): Buyer => ({ id: `${Date.now()}`, name: "", contact: "", maxPrice: 0, minEquityPct: 0, minProfit: 0, areas: [], exits: [] })

export default function BuyersModal({ onClose }: { onClose: () => void }) {
  const [buyers, setBuyers] = useState<Buyer[]>(() => loadBuyers())
  const [draft, setDraft]   = useState<Buyer>(blank)

  const persist = (next: Buyer[]) => { setBuyers(next); saveBuyers(next) }
  const addOrUpdate = () => {
    if (!draft.name.trim()) return
    const exists = buyers.some((b) => b.id === draft.id)
    persist(exists ? buyers.map((b) => (b.id === draft.id ? draft : b)) : [...buyers, draft])
    setDraft(blank())
  }
  const remove = (id: string) => persist(buyers.filter((b) => b.id !== id))
  const toggleExit = (e: string) => setDraft((d) => ({ ...d, exits: d.exits.includes(e) ? d.exits.filter((x) => x !== e) : [...d.exits, e] }))

  const numField = (label: string, key: "maxPrice" | "minEquityPct" | "minProfit", pre = "") => (
    <div>
      <label className="text-[10px] text-gray-500">{label}</label>
      <input type="number" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) || 0 })}
        className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" placeholder={pre} />
    </div>
  )

  return (
    <div className="fixed inset-0 z-[2000] bg-black/70 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-700/60 rounded-2xl w-full max-w-2xl my-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="text-sm font-bold text-white">💼 Cash buyers &amp; buy-boxes</div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-2">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Existing buyers */}
          {buyers.length > 0 && (
            <div className="space-y-1.5">
              {buyers.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 bg-gray-900/60 border border-gray-800 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{b.name} {b.contact && <span className="text-gray-500 font-normal">· {b.contact}</span>}</div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {b.maxPrice ? `≤$${b.maxPrice.toLocaleString()}` : "any price"} · {b.minEquityPct ? `${b.minEquityPct}%+ eq` : "any eq"} · {b.minProfit ? `$${b.minProfit.toLocaleString()}+ profit` : "any profit"}
                      {b.areas.length ? ` · ${b.areas.join(", ")}` : ""}{b.exits.length ? ` · ${b.exits.join("/")}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setDraft(b)} className="text-[11px] text-indigo-300 hover:text-indigo-200">edit</button>
                    <button onClick={() => remove(b.id)} className="text-[11px] text-gray-600 hover:text-red-400">delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add / edit form */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-3 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">{buyers.some((b) => b.id === draft.id) ? "Edit buyer" : "Add a buyer"}</div>
            <div className="grid grid-cols-2 gap-2">
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Buyer name" className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" />
              <input value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} placeholder="Phone / email" className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {numField("Max price $", "maxPrice")}
              {numField("Min equity %", "minEquityPct")}
              {numField("Min profit $", "minProfit")}
            </div>
            <div>
              <label className="text-[10px] text-gray-500">Areas (cities or ZIPs, comma-separated)</label>
              <input value={draft.areas.join(", ")} onChange={(e) => setDraft({ ...draft, areas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="Phoenix, 85001, Mesa" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXITS.map((e) => (
                <button key={e} onClick={() => toggleExit(e)} className={`text-[11px] px-2 py-0.5 rounded-lg border ${draft.exits.includes(e) ? "bg-indigo-600 border-indigo-500 text-white" : "border-gray-700 text-gray-400 hover:text-white"}`}>{e}</button>
              ))}
            </div>
            <button onClick={addOrUpdate} disabled={!draft.name.trim()} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">
              {buyers.some((b) => b.id === draft.id) ? "Save changes" : "+ Add buyer"}
            </button>
          </div>
          <p className="text-[10px] text-gray-600">Every deal in your results will show which of these buyers it fits — instant disposition.</p>
        </div>
      </div>
    </div>
  )
}
