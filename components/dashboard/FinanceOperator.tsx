"use client"

// 💰 Finance Operator — our own bank-data engine (no Plaid). Import any bank's
// statement export (CSV/OFX/QFX/QIF) or sync Stripe natively; the engine
// enriches, dedupes, detects recurring charges + transfers, catches anomalies,
// and writes a plain-language briefing. Correcting a category teaches it that
// vendor permanently (retroactive across the whole history).

import { useCallback, useEffect, useRef, useState } from "react"
import { CATEGORIES } from "@/lib/finance/categorize"

interface Summary {
  cash: number | null; income30: number; expenses30: number; net30: number
  burnRate: number; daysCashOnHand: number | null
  months: Array<{ month: string; income: number; expenses: number; net: number }>
  categories: Array<{ category: string; label: string; emoji: string; thisMonth: number; lastMonth: number; deltaPct: number | null }>
  anomalies: Array<{ merchant: string; note: string; ratio: number }>
  subscriptions: { streams: Array<{ merchant: string; cadence: string; avgAmount: number; nextExpected: string; priceChangePct: number | null }>; monthlyTotal: number }
  deductibleYtd: number; uncategorizedPct: number; briefing: string[]
  accounts: Array<{ id: string; name: string; kind: string; balance: number | null }>
}
interface Txn { id: string; date: string; amount: number; name: string; merchant: string; category: string; catSource: string; transfer: boolean; recurring: boolean }

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`

export default function FinanceOperator({ password }: { password: string }) {
  const headers = { "Content-Type": "application/json", "x-admin-password": password }
  const [summary, setSummary] = useState<Summary | null>(null)
  const [txns, setTxns] = useState<Txn[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [accountName, setAccountName] = useState("Main account")
  const [balance, setBalance] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        fetch("/api/finance/summary", { headers }).then((r) => r.json()),
        fetch("/api/finance/transactions?limit=200", { headers }).then((r) => r.json()),
      ])
      if (!s.error) setSummary(s)
      if (Array.isArray(t.transactions)) setTxns(t.transactions)
    } catch { /* panel stays empty */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password])
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(t)
  }, [load])

  const importText = async (fileText: string, fileName?: string) => {
    setBusy("import"); setNote(null)
    try {
      const res = await fetch("/api/finance/import", {
        method: "POST", headers,
        body: JSON.stringify({ fileText, fileName, accountName, balance: balance.trim() ? Number(balance.replace(/[$,]/g, "")) : undefined }),
      })
      const d = await res.json()
      if (d.error) setNote(`⚠ ${d.error}`)
      else setNote(`✓ ${d.format.toUpperCase()} parsed: ${d.parsed} rows → ${d.inserted} new, ${d.duplicates} already known${d.skipped ? `, ${d.skipped} unreadable` : ""}. Categorized: ${d.categorized.rule} learned-rule, ${d.categorized.builtin + d.categorized.keyword} builtin, ${d.categorized.ai} AI.`)
      await load()
    } catch { setNote("⚠ Import failed — try again.") }
    setBusy(null)
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    const text = await f.text()
    void importText(text, f.name)
  }

  const syncStripe = async () => {
    setBusy("stripe"); setNote(null)
    try {
      const d = await fetch("/api/finance/stripe-sync", { method: "POST", headers }).then((r) => r.json())
      setNote(d.ok ? `✓ ${d.note}` : `⚠ ${d.note ?? d.error}`)
      await load()
    } catch { setNote("⚠ Stripe sync failed.") }
    setBusy(null)
  }

  const correct = async (t: Txn, category: string) => {
    setTxns((prev) => prev.map((x) => (x.merchant === t.merchant ? { ...x, category, catSource: "user" } : x)))
    try {
      const d = await fetch("/api/finance/rules", { method: "POST", headers, body: JSON.stringify({ merchant: t.merchant, category }) }).then((r) => r.json())
      if (d.ok) setNote(`✓ Learned: "${t.merchant}" → ${category}. ${d.updated} transactions recategorized — permanently.`)
      await load()
    } catch { /* optimistic UI already applied */ }
  }

  const maxBar = summary ? Math.max(...summary.months.map((m) => Math.max(m.income, m.expenses)), 1) : 1

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">💰 Finance Operator <span className="text-xs font-normal text-gray-500">— our own engine, no Plaid</span></h3>
        <p className="text-sm text-gray-400 mt-0.5">Import any bank&apos;s statement export (CSV, OFX/QFX, QIF — auto-detected) or sync Stripe natively. The engine enriches merchants, learns your corrections forever, finds recurring charges and anomalies, and briefs you in plain language.</p>
      </div>

      {/* Import bar */}
      <div className="bg-gray-900/60 border border-emerald-500/25 rounded-2xl p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account name" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-44 focus:outline-none focus:border-emerald-500" />
          <input value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Current balance (optional)" className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-52 focus:outline-none focus:border-emerald-500" />
          <input ref={fileRef} type="file" accept=".csv,.ofx,.qfx,.qif,.txt" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={busy !== null} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg">
            {busy === "import" ? "Parsing + enriching…" : "📄 Import statement"}
          </button>
          <button onClick={syncStripe} disabled={busy !== null} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg">
            {busy === "stripe" ? "Syncing…" : "⚡ Sync Stripe"}
          </button>
        </div>
        <p className="text-[11px] text-gray-500">Every bank exports these files free (look for &quot;Download/Export&quot; in online banking). No credentials shared, no per-connection fees, works with banks aggregators don&apos;t cover.</p>
        {note && <p className="text-xs text-emerald-200">{note}</p>}
      </div>

      {summary && (
        <>
          {/* Briefing */}
          {summary.briefing.length > 0 && (
            <div className="bg-emerald-950/25 border border-emerald-600/30 rounded-2xl p-4 space-y-1.5">
              <p className="text-[10px] text-emerald-300 font-bold uppercase tracking-wide">📬 The briefing — what actually moved</p>
              {summary.briefing.map((b, i) => <p key={i} className="text-sm text-gray-200 leading-relaxed">{b}</p>)}
            </div>
          )}

          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ["Cash on hand", summary.cash != null ? money(summary.cash) : "— set a balance", "text-white"],
              ["In (30d)", money(summary.income30), "text-emerald-300"],
              ["Out (30d)", money(summary.expenses30), "text-rose-300"],
              ["Monthly trend", `${summary.burnRate >= 0 ? "+" : ""}${money(summary.burnRate)}`, summary.burnRate >= 0 ? "text-emerald-300" : "text-amber-300"],
              ["Days of cash", summary.daysCashOnHand != null ? `${summary.daysCashOnHand}d` : "—", (summary.daysCashOnHand ?? 999) < 90 ? "text-rose-300" : "text-white"],
            ].map(([label, value, cls]) => (
              <div key={label as string} className="bg-gray-900/60 border border-gray-800 rounded-xl px-3 py-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                <p className={`text-base font-bold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Monthly bars */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-2">12 months — in vs out</p>
            <div className="flex items-end gap-1.5 h-28">
              {summary.months.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.month}: in ${money(m.income)} / out ${money(m.expenses)}`}>
                  <div className="w-full flex items-end gap-px h-24">
                    <div className="flex-1 bg-emerald-600/80 rounded-t" style={{ height: `${(m.income / maxBar) * 100}%` }} />
                    <div className="flex-1 bg-rose-600/70 rounded-t" style={{ height: `${(m.expenses / maxBar) * 100}%` }} />
                  </div>
                  <span className="text-[8px] text-gray-600">{m.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {/* Categories this month */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 space-y-1.5">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Spend by category — this month vs last</p>
              {summary.categories.slice(0, 10).map((c) => (
                <div key={c.category} className="flex items-center gap-2 text-sm">
                  <span className="w-40 truncate text-gray-300">{c.emoji} {c.label}</span>
                  <span className="font-semibold text-white w-20 text-right">{money(c.thisMonth)}</span>
                  <span className="text-[10px] text-gray-500">vs {money(c.lastMonth)}</span>
                  {c.deltaPct != null && Math.abs(c.deltaPct) >= 15 && <span className={`text-[10px] font-bold ${c.deltaPct > 0 ? "text-rose-300" : "text-emerald-300"}`}>{c.deltaPct > 0 ? "+" : ""}{c.deltaPct}%</span>}
                </div>
              ))}
              {summary.categories.length === 0 && <p className="text-xs text-gray-600">No categorized spend yet this month.</p>}
              <p className="text-[10px] text-gray-500 pt-1">🧾 Deductible YTD: <span className="text-emerald-300 font-semibold">{money(summary.deductibleYtd)}</span> — tagged for tax time as it happens.</p>
            </div>

            {/* Subscriptions + anomalies */}
            <div className="space-y-3">
              <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 space-y-1.5">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">🔁 Recurring — ≈{money(summary.subscriptions.monthlyTotal)}/mo</p>
                {summary.subscriptions.streams.slice(0, 8).map((s) => (
                  <div key={s.merchant} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-gray-300">{s.merchant}</span>
                    <span className="text-[10px] text-gray-500">{s.cadence} · next ~{s.nextExpected.slice(5)}</span>
                    <span className="font-semibold text-white">{money(Math.abs(s.avgAmount))}</span>
                    {s.priceChangePct != null && s.priceChangePct > 0 && <span className="text-[10px] font-bold text-rose-300">↑{s.priceChangePct}%</span>}
                  </div>
                ))}
                {summary.subscriptions.streams.length === 0 && <p className="text-xs text-gray-600">No recurring charges detected yet (needs 3+ occurrences).</p>}
              </div>
              {summary.anomalies.length > 0 && (
                <div className="bg-rose-950/25 border border-rose-700/40 rounded-2xl p-4 space-y-1">
                  <p className="text-[10px] text-rose-300 font-bold uppercase tracking-wide">⚠ Anomalies — vs each vendor&apos;s own history</p>
                  {summary.anomalies.slice(0, 5).map((a, i) => <p key={i} className="text-xs text-gray-200">{a.note}</p>)}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Transactions with trainable categories */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-2">Transactions {summary && summary.uncategorizedPct > 0 ? `· ${summary.uncategorizedPct}% uncategorized — correct one and the engine learns that vendor forever` : ""}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="text-gray-600">
              <th className="py-1 pr-3">Date</th><th className="pr-3">Merchant</th><th className="pr-3 text-right">Amount</th><th className="pr-3">Category</th><th>Flags</th>
            </tr></thead>
            <tbody>
              {txns.slice(0, 100).map((t) => (
                <tr key={t.id} className="border-t border-gray-800/60">
                  <td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap">{t.date.slice(0, 10)}</td>
                  <td className="pr-3 text-gray-200 max-w-[260px] truncate" title={t.name}>{t.merchant}</td>
                  <td className={`pr-3 text-right font-semibold ${t.amount >= 0 ? "text-emerald-300" : "text-gray-200"}`}>{money(t.amount)}</td>
                  <td className="pr-3">
                    <select value={t.category} onChange={(e) => void correct(t, e.target.value)}
                      className={`bg-gray-950 border rounded px-1.5 py-0.5 text-[11px] ${t.catSource === "user" || t.catSource === "rule" ? "border-emerald-700 text-emerald-200" : t.catSource === "ai" ? "border-sky-800 text-sky-200" : "border-gray-700 text-gray-300"}`}>
                      {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
                    </select>
                  </td>
                  <td className="text-[10px] text-gray-600">{t.transfer ? "🔁 transfer " : ""}{t.recurring ? "♻ recurring" : ""}</td>
                </tr>
              ))}
              {txns.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-600">No transactions yet — import a statement or sync Stripe above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
