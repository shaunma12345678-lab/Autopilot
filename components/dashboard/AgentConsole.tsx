"use client"

// Autonomous Acquisitions Agent console — flip it ON, set your buy-box markets,
// and it runs on a schedule (and on demand) finding NEW deals deduped against
// what it's already surfaced. Manual search stays separate; this is the
// hands-off feed.

import { useState, useEffect } from "react"
import type { AgentConfig, AgentFeedItem } from "@/lib/agent-store"
import { openDealSheet } from "@/lib/deal-sheet"

const TIER: Record<string, string> = {
  elite:  "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40",
  strong: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  solid:  "bg-slate-500/15 text-slate-300 border-slate-500/40",
}
const ago = (iso: string) => { const h = (Date.now() - new Date(iso).getTime()) / 3.6e6; return h < 1 ? "just now" : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago` }

export default function AgentConsole({ password }: { password: string }) {
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [feed, setFeed]     = useState<AgentFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [msg, setMsg]       = useState<string | null>(null)
  const [mode, setMode]     = useState<"city" | "county">("city")
  const [place, setPlace]   = useState("")
  const [stateAbbr, setStateAbbr] = useState("")

  const headers = { "Content-Type": "application/json", "x-admin-password": password }

  useEffect(() => {
    fetch("/api/agent", { headers: { "x-admin-password": password } })
      .then((r) => r.json())
      .then((d) => { if (d?.config) { setConfig(d.config); setFeed(d.feed ?? []) } })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [password])

  const saveConfig = async (next: AgentConfig) => {
    setConfig(next)
    try { const r = await fetch("/api/agent", { method: "POST", headers, body: JSON.stringify({ action: "config", config: next }) }); const d = await r.json(); if (d?.config) setConfig(d.config) } catch { /* keep optimistic */ }
  }
  const addMarket = () => {
    if (!config || !place.trim() || !stateAbbr.trim()) return
    const m = mode === "county" ? { searchType: "county" as const, county: place.trim(), city: "", state: stateAbbr.trim().toUpperCase() } : { searchType: "city" as const, city: place.trim(), county: "", state: stateAbbr.trim().toUpperCase() }
    saveConfig({ ...config, markets: [...config.markets, m].slice(0, 12) })
    setPlace("")
  }
  const removeMarket = (i: number) => { if (config) saveConfig({ ...config, markets: config.markets.filter((_, j) => j !== i) }) }

  const runNow = async () => {
    setRunning(true); setMsg(null)
    try {
      const r = await fetch("/api/agent", { method: "POST", headers, body: JSON.stringify({ action: "run" }) })
      const d = await r.json()
      if (d?.error) setMsg(d.error)
      else { setFeed(d.feed ?? []); if (d.config) setConfig(d.config); setMsg(`Scanned ${d.markets?.join(", ") || "your markets"} · found ${d.found ?? 0} new deal${d.found === 1 ? "" : "s"}.`) }
    } catch { setMsg("Run failed — try again.") }
    setRunning(false)
  }
  const clearFeed = async () => { setFeed([]); try { await fetch("/api/agent", { method: "POST", headers, body: JSON.stringify({ action: "clear" }) }) } catch { /* ignore */ } }

  if (loading) return <p className="text-sm text-gray-400">Loading the agent…</p>
  if (!config) return <p className="text-sm text-red-300">Couldn&apos;t load the agent.</p>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-white">🤖 Autonomous Acquisitions Agent</h3>
          <p className="text-sm text-gray-400 mt-0.5">Flip it on and it hunts your buy-box markets on a schedule, surfacing only NEW elite deals — deduped against everything it&apos;s already shown you.</p>
        </div>
        <button onClick={() => saveConfig({ ...config, enabled: !config.enabled })} className={`shrink-0 text-sm font-bold px-4 py-2 rounded-xl border ${config.enabled ? "bg-emerald-600/30 border-emerald-400/50 text-emerald-100" : "bg-gray-800/50 border-gray-700/50 text-gray-300"}`}>
          {config.enabled ? "● Agent ON" : "○ Agent OFF"}
        </button>
      </div>

      {/* Buy-box */}
      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Your buy-box markets</p>
        <div className="flex flex-wrap gap-1.5">
          {config.markets.length === 0 && <span className="text-xs text-gray-600">No markets yet — add a few below.</span>}
          {config.markets.map((m, i) => (
            <span key={i} className="text-xs bg-gray-800/70 border border-gray-700/50 rounded-lg px-2 py-1 text-gray-200 flex items-center gap-1.5">
              {m.searchType === "county" ? `🗺 ${m.county} County` : `🏙 ${m.city}`}, {m.state}
              <button onClick={() => removeMarket(i)} className="text-gray-500 hover:text-red-300">✕</button>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as "city" | "county")} className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white">
            <option value="city">City</option>
            <option value="county">County</option>
          </select>
          <input value={place} onChange={(e) => setPlace(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMarket()} placeholder={mode === "county" ? "County (e.g. Marion)" : "City (e.g. Kansas City)"} className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
          <input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} onKeyDown={(e) => e.key === "Enter" && addMarket()} placeholder="ST" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <label className="flex items-center gap-2">Min score
              <select value={config.minScore} onChange={(e) => saveConfig({ ...config, minScore: Number(e.target.value) })} className="bg-gray-800/60 border border-gray-700/50 rounded px-2 py-1 text-white">
                {[45, 55, 65, 75].map((v) => <option key={v} value={v}>{v}+</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">Scan depth
              <select value={config.depth} onChange={(e) => saveConfig({ ...config, depth: Number(e.target.value) })} className="bg-gray-800/60 border border-gray-700/50 rounded px-2 py-1 text-white">
                {[200, 300, 500, 1000].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
          <button onClick={addMarket} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white">+ Add market</button>
        </div>
        <p className="text-[11px] text-gray-600">{config.enabled ? "● Running automatically every ~3 hours, rotating through your markets." : "○ Turn the agent ON to run automatically. You can also Run now anytime."}</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={runNow} disabled={running || config.markets.length === 0} className="text-sm font-semibold px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white">{running ? "Hunting…" : "▶ Run now"}</button>
        {feed.length > 0 && <button onClick={clearFeed} className="text-xs font-semibold text-gray-400 hover:text-gray-200">Clear feed</button>}
        {msg && <span className="text-xs text-violet-200">{msg}</span>}
      </div>

      {/* Feed */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">New deals the agent found {feed.length > 0 && `(${feed.length})`}</p>
        {feed.length === 0 && <p className="text-sm text-gray-500">Nothing yet. Add markets, turn the agent on (or Run now), and new deals will land here.</p>}
        <div className="space-y-2">
          {feed.map((it, i) => (
            <div key={`${it.address}-${i}`} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">🆕 {it.address || "Address pending"}</p>
                  <p className="text-xs text-gray-500">{[it.city, it.state, it.zip].filter(Boolean).join(", ")} · found {ago(it.at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-bold text-indigo-300">{it.score}/100</span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${TIER[it.tier] ?? TIER.solid}`}>{it.tier}</span>
                </div>
              </div>
              {it.reasons.length > 0 && <p className="text-[11px] text-gray-400 mt-1.5">{it.reasons.slice(0, 3).join(" · ")}</p>}
              <button onClick={() => openDealSheet(it.lead)} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 mt-2">📄 Deal Sheet</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
