"use client"

// 🤝 Cash Buyers — buyer intelligence, every aspect. Finds the county's active
// investors from public assessor data and shows the full picture on each:
// how many they hold, how ACTIVELY they're buying (recent purchases), where
// (top ZIPs), what (property class), portfolio value, entity type, absentee
// status, and their mailing address. Per buyer: full property dossier, web
// contact discovery, a printable intro letter pitching your deals, and
// one-click save into My Buyers so every deal auto-matches against them.

import { useMemo, useState } from "react"
import { loadBuyers, saveBuyers, type Buyer } from "@/lib/buyers"

interface BuyerProperty { address: string; city: string; zip: string; value: number | null; salePrice: number | null; saleDate: string | null; use: string | null }
interface CashBuyer {
  owner: string; count: number; mailing: string | null; mailingState: string | null
  entity: "LLC" | "Trust" | "Company" | "Individual"; absentee: boolean
  recentBuys: number; lastBuy: string | null; hasSaleData: boolean
  portfolioValue: number | null; avgValue: number | null
  topZips: string[]; topUse: string | null; score: number; sample: BuyerProperty[]
}

const money = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`

const ENTITY_CLS: Record<string, string> = {
  LLC: "bg-indigo-900/60 border-indigo-700/50 text-indigo-200",
  Company: "bg-sky-900/60 border-sky-700/50 text-sky-200",
  Trust: "bg-amber-900/60 border-amber-700/50 text-amber-200",
  Individual: "bg-gray-800 border-gray-700 text-gray-300",
}

function scoreCls(s: number): string {
  if (s >= 70) return "bg-emerald-600 text-white"
  if (s >= 45) return "bg-amber-600 text-white"
  return "bg-gray-700 text-gray-200"
}

export default function CashBuyers({ password }: { password: string }) {
  const apiHeaders = useMemo(() => ({ "Content-Type": "application/json", "x-admin-password": password }), [password])
  const [county, setCounty] = useState("")
  const [stateAbbr, setStateAbbr] = useState("")
  const [limit, setLimit] = useState(40)
  const [loading, setLoading] = useState(false)
  const [buyers, setBuyers] = useState<CashBuyer[] | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [openDossier, setOpenDossier] = useState<string | null>(null)   // owner name
  const [dossiers, setDossiers] = useState<Record<string, BuyerProperty[] | "loading">>({})
  const [contacts, setContacts] = useState<Record<string, { phone: string | null; email: string | null; note?: string } | "loading">>({})
  const [savedOwners, setSavedOwners] = useState<Set<string>>(new Set())
  const [fromName, setFromName] = useState("")
  const [fromPhone, setFromPhone] = useState("")

  const search = async () => {
    if (!county.trim() || !stateAbbr.trim()) { setNote("Enter a county and state."); return }
    setLoading(true); setNote(null); setBuyers(null); setDossiers({}); setContacts({}); setOpenDossier(null)
    try {
      const res = await fetch("/api/leads/buyers", { method: "POST", headers: apiHeaders, body: JSON.stringify({ county: county.trim(), state: stateAbbr.trim(), limit }) })
      const data = await res.json()
      if (data?.error) { setNote(data.error); setLoading(false); return }
      setBuyers(data.buyers ?? [])
      if (data.note) setNote(data.note)
    } catch { setNote("Search failed — try again.") }
    setLoading(false)
  }

  const toggleDossier = async (b: CashBuyer) => {
    if (openDossier === b.owner) { setOpenDossier(null); return }
    setOpenDossier(b.owner)
    if (dossiers[b.owner]) return
    setDossiers((d) => ({ ...d, [b.owner]: "loading" }))
    try {
      const res = await fetch("/api/leads/buyers", { method: "POST", headers: apiHeaders, body: JSON.stringify({ action: "dossier", county: county.trim(), state: stateAbbr.trim(), owner: b.owner }) })
      const data = await res.json()
      setDossiers((d) => ({ ...d, [b.owner]: Array.isArray(data.properties) ? data.properties : [] }))
    } catch { setDossiers((d) => ({ ...d, [b.owner]: [] })) }
  }

  const findContact = async (b: CashBuyer) => {
    setContacts((c) => ({ ...c, [b.owner]: "loading" }))
    try {
      const res = await fetch("/api/leads/buyers", {
        method: "POST", headers: apiHeaders,
        body: JSON.stringify({ action: "contact", county: county.trim(), state: stateAbbr.trim(), owner: b.owner, sampleAddress: b.sample[0]?.address ?? "", sampleCity: b.sample[0]?.city ?? "" }),
      })
      const data = await res.json()
      setContacts((c) => ({ ...c, [b.owner]: { phone: data.phone ?? null, email: data.email ?? null, note: data.note ?? undefined } }))
    } catch { setContacts((c) => ({ ...c, [b.owner]: { phone: null, email: null, note: "Lookup failed — try again." } })) }
  }

  const saveToMyBuyers = (b: CashBuyer) => {
    const existing = loadBuyers()
    if (existing.some((x) => x.name.toLowerCase() === b.owner.toLowerCase())) { setSavedOwners((s) => new Set(s).add(b.owner)); return }
    const contact = contacts[b.owner]
    const buyer: Buyer = {
      id: crypto.randomUUID(),
      name: b.owner,
      contact: (contact !== "loading" && (contact?.phone || contact?.email)) || b.mailing || "",
      maxPrice: 0, minEquityPct: 0, minProfit: 0,
      areas: b.topZips,
      exits: [],
    }
    saveBuyers([...existing, buyer])
    setSavedOwners((s) => new Set(s).add(b.owner))
  }

  const printIntroLetter = (b: CashBuyer) => {
    if (typeof window === "undefined" || !b.mailing) return
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const from = fromName.trim() || "[Your Name]"
    const phone = fromPhone.trim() || "[Your Phone]"
    const area = [county.trim() + " County", stateAbbr.trim()].filter(Boolean).join(", ")
    const zips = b.topZips.length ? ` — especially around ${b.topZips.slice(0, 3).join(", ")}` : ""
    const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    const w = window.open("", "_blank", "width=900,height=1000")
    if (!w) { setNote("Popup blocked — allow popups for this site to print the letter."); return }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Intro — ${esc(b.owner)}</title><style>
      body{font-family:Georgia,serif;color:#111;max-width:7in;margin:0 auto;padding:.7in .4in;line-height:1.65;font-size:13px}
      .noprint{text-align:center;padding:10px;background:#f0f0f0;font-family:sans-serif}
      @media print{.noprint{display:none}}
      .to{margin:18px 0;white-space:pre-line}
    </style></head><body>
      <div class="noprint"><button onclick="window.print()" style="padding:8px 22px;font-size:14px;cursor:pointer;">🖨 Print / Save as PDF</button></div>
      <p style="text-align:right;color:#555">${esc(today)}</p>
      <p class="to"><b>${esc(b.owner)}</b>\n${esc(b.mailing)}</p>
      <p>Hi,</p>
      <p>I noticed you're an active investor in ${esc(area)}${esc(zips)} — I work that same market and regularly come across off-market, deeply discounted properties (pre-foreclosures, inherited homes, distressed sellers) before they hit any list.</p>
      <p>I'd love to send you first look at deals that fit what you already buy. No obligation — if a property fits your numbers, great; if not, toss it.</p>
      <p>What's the best way to send you deals — text, email, or a quick call? Reach me anytime at ${esc(phone)}.</p>
      <p>Warm regards,<br><b>${esc(from)}</b><br>${esc(phone)}</p>
    </body></html>`)
    w.document.close()
  }

  const csv = () => {
    if (!buyers || typeof window === "undefined") return
    const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`
    const header = "buyer,entity,score,properties_owned,recent_buys_18mo,last_buy,portfolio_value_est,avg_value,top_zips,buys_mostly,absentee,mailing_address"
    const rows = buyers.map((b) => [
      b.owner, b.entity, b.score, b.count, b.hasSaleData ? b.recentBuys : "n/a", b.lastBuy ?? "",
      b.portfolioValue ?? "", b.avgValue ?? "", b.topZips.join(" "), b.topUse ?? "", b.absentee ? "yes" : "no", b.mailing ?? "",
    ].map(q).join(","))
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob); a.download = `cash-buyers-${county.toLowerCase().replace(/\s+/g, "-")}.csv`; a.click()
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">🤝 Cash Buyers — full intelligence</h3>
        <p className="text-sm text-gray-400 mt-0.5">Every active buyer in the county with every detail: portfolio, recent purchase activity, where and what they buy, estimated holdings value, and how to reach them. Sorted so the hottest buyers — the ones actively closing — are on top.</p>
      </div>

      <div className="bg-gray-900/60 border border-gray-700/40 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={county} onChange={(e) => setCounty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="County (e.g. Maricopa)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 sm:col-span-2" />
          <input value={stateAbbr} onChange={(e) => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="State (e.g. AZ)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-300">Buyers:
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-white">
                {[20, 40, 60, 100].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your name (for letters)" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 w-40" />
            <input value={fromPhone} onChange={(e) => setFromPhone(e.target.value)} placeholder="Your phone" className="bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 w-32" />
          </div>
          <button onClick={search} disabled={loading} className="text-sm font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">{loading ? "Building buyer intel…" : "🤝 Find cash buyers"}</button>
        </div>
        <p className="text-[11px] text-gray-600">Live counties: Wayne MI (Detroit) · Maricopa AZ (Phoenix) · Marion IN (Indianapolis). Each is verified assessor data — more added as they&apos;re confirmed.</p>
      </div>

      {note && <p className="text-xs text-amber-300">{note}</p>}

      {buyers && buyers.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">{buyers.length} active buyers · ranked by activity + scale + reachability</p>
          <button onClick={csv} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-600/15 hover:bg-amber-600/30 text-amber-200">⬇ Full intel CSV</button>
        </div>
      )}

      <div className="space-y-2">
        {(buyers ?? []).map((b) => {
          const contact = contacts[b.owner]
          const dossier = dossiers[b.owner]
          return (
            <div key={b.owner} className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${scoreCls(b.score)}`}>{b.score}</span>
                    <p className="text-sm font-bold text-white truncate">👤 {b.owner}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ENTITY_CLS[b.entity]}`}>{b.entity}</span>
                    {b.absentee && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-purple-900/60 border-purple-700/50 text-purple-200" title="Mails out of state — remote investor who relies on local deal flow">✈ Out-of-state</span>}
                    {b.hasSaleData && b.recentBuys > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-700/70 text-emerald-100" title={b.lastBuy ? `Most recent purchase ${b.lastBuy}` : undefined}>🔥 {b.recentBuys} buys in 18mo</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    <b className="text-emerald-300">{b.count} properties</b>
                    {b.portfolioValue != null && <> · portfolio ≈ <b className="text-white">{money(b.portfolioValue)}</b></>}
                    {b.avgValue != null && <> · avg {money(b.avgValue)}</>}
                    {b.topUse && <> · buys mostly <span className="text-gray-300">{b.topUse.toLowerCase()}</span></>}
                    {b.lastBuy && <> · last buy {b.lastBuy}</>}
                  </p>
                  {b.topZips.length > 0 && (
                    <p className="text-[11px] text-gray-500 mt-0.5">Buys in: {b.topZips.map((z) => <span key={z} className="inline-block bg-gray-800 border border-gray-700 rounded px-1.5 mx-0.5">{z}</span>)}</p>
                  )}
                  {b.mailing && <p className="text-[11px] text-gray-500 mt-0.5">✉ {b.mailing}</p>}
                  {contact && contact !== "loading" && (
                    <p className="text-[11px] mt-1 text-sky-200">
                      {contact.phone && <>📞 <a className="underline" href={`tel:${contact.phone}`}>{contact.phone}</a> </>}
                      {contact.email && <>✉️ <a className="underline" href={`mailto:${contact.email}`}>{contact.email}</a></>}
                      {contact.note && <span className="text-gray-500">{contact.note}</span>}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <button onClick={() => toggleDossier(b)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg">{openDossier === b.owner ? "Hide" : "📁 Full dossier"}</button>
                  <button onClick={() => findContact(b)} disabled={contact === "loading"} className="bg-sky-700/50 hover:bg-sky-600 disabled:opacity-50 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" title="Search the public web for a verifiable phone/email (never guessed)">{contact === "loading" ? "Searching…" : "📞 Find contact"}</button>
                  {b.mailing && <button onClick={() => printIntroLetter(b)} className="bg-amber-700/50 hover:bg-amber-600 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" title="Print an intro letter pitching your off-market deal flow to their mailing address">🖨 Intro letter</button>}
                  <button onClick={() => saveToMyBuyers(b)} disabled={savedOwners.has(b.owner)} className="bg-emerald-700/60 hover:bg-emerald-600 disabled:opacity-60 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-lg" title="Add to My Buyers — every deal you analyze will auto-match against their buy-box">{savedOwners.has(b.owner) ? "✓ In My Buyers" : "💾 Save buyer"}</button>
                </div>
              </div>

              {openDossier === b.owner && (
                <div className="mt-3 bg-gray-950/60 border border-gray-800 rounded-lg p-3">
                  {dossier === "loading" && <p className="text-xs text-gray-500">Pulling their full portfolio from county records…</p>}
                  {Array.isArray(dossier) && dossier.length === 0 && <p className="text-xs text-gray-500">Couldn&apos;t load the portfolio — try again.</p>}
                  {Array.isArray(dossier) && dossier.length > 0 && (
                    <div className="overflow-x-auto">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Complete portfolio · {dossier.length} properties{b.hasSaleData ? " · newest purchases first" : ""}</p>
                      <table className="w-full text-[11px]">
                        <thead><tr className="text-gray-600 text-left"><th className="pr-3 pb-1">Address</th><th className="pr-3 pb-1">City</th><th className="pr-3 pb-1">ZIP</th><th className="pr-3 pb-1">Value</th>{b.hasSaleData && <><th className="pr-3 pb-1">Bought</th><th className="pr-3 pb-1">Paid</th></>}<th className="pb-1">Type</th></tr></thead>
                        <tbody>
                          {dossier.slice(0, 60).map((p, i) => (
                            <tr key={i} className="text-gray-300 border-t border-gray-800/60">
                              <td className="pr-3 py-1">{p.address}</td>
                              <td className="pr-3 py-1">{p.city}</td>
                              <td className="pr-3 py-1">{p.zip}</td>
                              <td className="pr-3 py-1">{p.value != null ? money(p.value) : "—"}</td>
                              {b.hasSaleData && <>
                                <td className="pr-3 py-1">{p.saleDate ?? "—"}</td>
                                <td className="pr-3 py-1">{p.salePrice != null ? money(p.salePrice) : "—"}</td>
                              </>}
                              <td className="py-1 text-gray-500">{p.use ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {dossier.length > 60 && <p className="text-[10px] text-gray-600 mt-1">+ {dossier.length - 60} more (in the CSV export)</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
