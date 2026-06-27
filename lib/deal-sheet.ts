// One-click "Deal Sheet" — a clean, printable/shareable investment report a
// wholesaler can send straight to a cash buyer. Pure client-side: builds a
// self-contained HTML document and opens it in a new window for print / save as
// PDF. No external libraries, no API calls.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { analyzeDeal, fmtMoney } from "@/lib/deal-analysis"
import { predictPreForeclosure } from "@/lib/predictive"
import { bestStrategy, carryingCosts } from "@/lib/strategy"
import { yellowLetter, coldCallScript, smsScript, financingFit, recorderLink } from "@/lib/outreach"
import { predictLikelyToSell } from "@/lib/sell-predictor"
import { competitionRadar } from "@/lib/competition"
import { predictNegotiation } from "@/lib/negotiation"
import { opportunityScore } from "@/lib/opportunity"

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

const VERDICT_COLOR: Record<string, string> = {
  Pursue: "#16a34a", Negotiate: "#d97706", Underwrite: "#6366f1", Pass: "#dc2626",
}

export function dealSheetHtml(lead: ForeclosureLead, fallbackPsf?: number): string {
  const a    = analyzeDeal(lead, undefined, fallbackPsf ? { fallbackPsf } : undefined)
  const pred = predictPreForeclosure(lead)
  const m    = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? fmtMoney(n) : "—")

  const facts: Array<[string, string]> = [
    ["Beds / Baths", lead.beds ? `${lead.beds} bd / ${lead.baths ?? "?"} ba` : "—"],
    ["Sq Ft", lead.sqft ? lead.sqft.toLocaleString() : "—"],
    ["Year Built", lead.yearBuilt ? String(lead.yearBuilt) : "—"],
    ["Type", lead.propertyType ? esc(lead.propertyType) : "—"],
    ["Lot Size", lead.lotSize ? lead.lotSize.toLocaleString() : "—"],
    ["Stage", esc((lead.foreclosureStage || "").replace(/_/g, " "))],
  ]

  const numbers: Array<[string, string, string]> = [
    ["After-Repair Value (ARV)", m(a.arv), "#0f172a"],
    ["Est. Repairs", m(a.repairCost), "#0f172a"],
    ["Max Allowable Offer", m(a.mao), "#1d4ed8"],
    ["Projected Profit", m(a.profitRange.likely), "#16a34a"],
    ["Profit Range", `${m(a.profitRange.low)} – ${m(a.profitRange.high)}`, "#0f172a"],
    ["ROI", a.roiPct ? `${a.roiPct}%` : "—", "#16a34a"],
    ["Equity", a.hasValue ? `${a.equityPercent}% (${m(a.equityAvailable)})` : "—", "#0f172a"],
    ["Best Exit", esc(a.exit?.strategy ?? "—"), "#0f172a"],
  ]

  const comps = (lead.comps ?? []).filter((c) => c?.address).slice(0, 6)
  const compRows = comps.length
    ? comps.map((c) => `<tr><td>${esc(c.address)}</td><td style="text-align:right">${m(c.price)}</td><td style="text-align:right">${c.sqft ? c.sqft.toLocaleString() : "—"}</td></tr>`).join("")
    : `<tr><td colspan="3" style="color:#64748b">Comps build as more area data is gathered.</td></tr>`

  const why = (a.whyGood ?? []).slice(0, 6)
  const whyList = why.length ? why.map((w) => `<li>${esc(w)}</li>`).join("") : "<li>Distressed acquisition — underwrite to confirm spread.</li>"

  const predBlock = pred.predicted ? `
    <div class="card" style="border-color:#e9d5ff;background:#faf5ff">
      <div class="h">🔮 Predictive Pre-Foreclosure</div>
      <p style="margin:0 0 6px"><b>${pred.probability}%</b> likely to reach foreclosure · ${esc(pred.timeframe)} · ${esc(pred.confidence)} confidence</p>
      <ul>${pred.factors.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    </div>` : ""

  const contact = [
    lead.phone ? `📞 ${esc(lead.phone)}` : "",
    lead.email ? `✉ ${esc(lead.email)}` : "",
    ...(lead.phones ?? []).slice(0, 3).map((p) => `📞 ${esc(p)}`),
  ].filter(Boolean)
  const contactHtml = contact.length ? contact.join(" &nbsp;·&nbsp; ") : '<span style="color:#64748b">Run skip-trace to reveal owner contact</span>'

  const maoBlock = a.maoDetail ? `
    <div class="card" style="border-color:#bfdbfe;background:#eff6ff">
      <div class="h">Max Allowable Offer — Full Breakdown</div>
      <table>
        ${a.maoDetail.lines.map((ln, i) => {
          const last = i === a.maoDetail!.lines.length - 1
          const color = last ? "#1d4ed8" : ln.deduction ? "#b91c1c" : "#0f172a"
          const weight = (last || i === 0) ? "700" : "400"
          const val = (ln.deduction ? "− " : "") + m(ln.amount)
          return `<tr${last ? ' style="border-top:2px solid #1d4ed8"' : ""}><td style="font-weight:${weight}">${esc(ln.label)}</td><td style="text-align:right;color:${color};font-weight:${weight}">${val}</td></tr>`
        }).join("")}
      </table>
      <p style="margin:8px 0 0;color:#64748b;font-size:11px">Offer at or below the MAO to keep the full projected profit. Renovation = ${esc(a.repairLevel)} rehab.</p>
    </div>` : ""

  const br = a.brrrr
  const brrrrBlock = br ? `
    <div class="card" style="border-color:#bbf7d0;background:#f0fdf4">
      <div class="h">BRRRR — Buy · Rehab · Rent · Refinance · Repeat</div>
      <div class="grid" style="margin:0">
        <div class="cell"><div class="k">ARV</div><div class="v">${m(br.arv)}</div></div>
        <div class="cell"><div class="k">All-in (buy + rehab)</div><div class="v">${m(br.allIn)}</div></div>
        <div class="cell"><div class="k">Refi @ 75% ARV</div><div class="v">${m(br.refiLoan)}</div></div>
        <div class="cell"><div class="k">Cash left in deal</div><div class="v" style="color:${br.infinite ? "#16a34a" : "#0f172a"}">${m(br.cashLeftInDeal)}${br.infinite ? " ♾️" : ""}</div></div>
        <div class="cell"><div class="k">Forced equity</div><div class="v" style="color:#16a34a">${m(br.forcedEquity)}</div></div>
        <div class="cell"><div class="k">Discount to ARV</div><div class="v">${br.discountToArvPct}%</div></div>
      </div>
      <p style="margin:8px 0 0;color:#475569;font-size:12px">${br.infinite ? `<b>Capital fully recycled</b> — refinancing at 75% of ARV pulls back your entire ${m(br.allIn)} all-in. A (nearly) free rental.` : `Buy at or below <b>${m(br.maxBuyForFullPull)}</b> to recover all your capital on the refinance.`}</p>
    </div>` : ""

  const comp = competitionRadar(lead, pred.predicted, opportunityScore(lead).tier === "gem")
  const nego = predictNegotiation(lead, a)
  const dealColor = comp.level === "fresh" ? "#16a34a" : comp.level === "moderate" ? "#d97706" : "#dc2626"
  const compBlock = `
    <div class="card">
      <div class="h">Competition & Negotiation</div>
      <p style="margin:0 0 6px;font-size:14px"><b style="color:${dealColor}">${comp.level === "fresh" ? "🟢" : comp.level === "moderate" ? "🟡" : "🔴"} ${esc(comp.label)}</b></p>
      ${comp.reasons.length ? `<ul style="margin:0 0 8px">${comp.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${nego ? (nego.fitsMao
        ? `<p style="margin:6px 0 0;font-size:13px">🤝 <b>Likely accepts ${m(nego.acceptLow)}–${m(nego.acceptHigh)}</b> (~${nego.discountPct}% off) · suggested opening offer <b>${m(nego.opening)}</b></p>`
        : `<p style="margin:6px 0 0;font-size:13px;color:#b45309">🤝 Seller likely wants <b>${m(nego.acceptLow)}–${m(nego.acceptHigh)}</b> — above your max offer (${m(a.maoDetail ? a.maoDetail.mao : a.mao)}). Only a deal if they're far more motivated than they appear.</p>`)
        + (nego.reasons.length ? `<p style="margin:4px 0 0;color:#475569;font-size:12px">${nego.reasons.map(esc).join(" · ")}</p>` : "")
        + (nego.note ? `<p style="margin:4px 0 0;color:#b45309;font-size:12px">⚠ ${esc(nego.note)}</p>` : "") : ""}
      <p style="margin:8px 0 0;color:#94a3b8;font-size:11px">Estimates from the seller's situation — confirm in conversation.</p>
    </div>`

  const sell = predictLikelyToSell(lead)
  const sellBlock = sell.score >= 30 ? `
    <div class="card" style="border-color:#fbcfe8;background:#fdf2f8">
      <div class="h">🎯 Likely to Sell — ${sell.score}% (${esc(sell.band)})</div>
      <p style="margin:0 0 6px;font-size:13px">Forward-looking owner intent · est. timeframe <b>${esc(sell.timeframe)}</b></p>
      <ul>${sell.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
    </div>` : ""

  const rec = recorderLink(lead)
  const outreachBlock = `
    <div class="card" style="border-color:#fde68a;background:#fffbeb">
      <div class="h">Ready-to-Send Seller Outreach</div>
      <p style="margin:0 0 8px;color:#92400e;font-size:12px">Multi-channel wins: mail + call + text, 3 touches. Reach out fast — competition jumps after the first weeks. Replace [Your Name]/[Your Phone] before sending.</p>
      <p style="margin:10px 0 4px;font-weight:700;font-size:12px">📬 Yellow letter</p>
      <pre class="ltr">${esc(yellowLetter(lead))}</pre>
      <p style="margin:14px 0 4px;font-weight:700;font-size:12px">📞 Cold-call script <span style="font-weight:400;color:#64748b">(best Tue–Thu, 5–7:30pm)</span></p>
      <pre class="ltr">${esc(coldCallScript(lead))}</pre>
      <p style="margin:14px 0 4px;font-weight:700;font-size:12px">💬 Text message</p>
      <pre class="ltr">${esc(smsScript(lead))}</pre>
      <p style="margin:14px 0 0;font-size:12px"><b>💵 Financing fit:</b> ${esc(financingFit(a))}</p>
    </div>`

  const strat = bestStrategy(lead)
  const cc    = carryingCosts(lead)
  const carryBlock = (cc.propertyTaxYr != null || cc.insuranceYr != null) ? `
    <div class="card">
      <div class="h">Strategy & Carrying Costs</div>
      <p style="margin:0 0 8px;font-size:14px"><b>${strat.emoji} ${esc(strat.strategy)}</b> — <span style="color:#475569">${esc(strat.why)}</span></p>
      <div class="grid" style="margin:0">
        <div class="cell"><div class="k">Est. Property Tax / yr</div><div class="v">${cc.propertyTaxYr != null ? m(cc.propertyTaxYr) : "—"}${cc.rate != null ? ` <span style="font-size:11px;color:#64748b">(${cc.rate}%)</span>` : ""}</div></div>
        <div class="cell"><div class="k">Est. Insurance / yr</div><div class="v">${cc.insuranceYr != null ? m(cc.insuranceYr) : "—"}</div></div>
        <div class="cell"><div class="k">Est. Carry / mo</div><div class="v">${cc.propertyTaxYr != null && cc.insuranceYr != null ? m(Math.round((cc.propertyTaxYr + cc.insuranceYr) / 12)) : "—"}</div></div>
      </div>
    </div>` : ""

  const vc = VERDICT_COLOR[a.verdict.call] ?? "#0f172a"

  return `<!doctype html><html><head><meta charset="utf-8"><title>Deal Sheet — ${esc(lead.address)}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:0;background:#f1f5f9}
  .page{max-width:820px;margin:0 auto;background:#fff;padding:34px 40px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4f46e5;padding-bottom:14px;margin-bottom:18px}
  .brand{font-size:13px;font-weight:800;letter-spacing:.14em;color:#4f46e5;text-transform:uppercase}
  .addr{font-size:24px;font-weight:800;margin:8px 0 2px}
  .sub{color:#475569;font-size:14px}
  .badge{display:inline-block;color:#fff;font-weight:800;font-size:13px;padding:7px 14px;border-radius:999px}
  .grade{display:inline-block;border:2px solid #0f172a;font-weight:800;border-radius:8px;padding:5px 10px;margin-left:8px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}
  .cell{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px}
  .cell .k{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;font-weight:700}
  .cell .v{font-size:16px;font-weight:700;margin-top:2px}
  .card{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:14px 0}
  .card .h{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#334155;margin-bottom:8px}
  table{width:100%;border-collapse:collapse;font-size:13px} td,th{padding:7px 6px;border-bottom:1px solid #eef2f7;text-align:left}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
  ul{margin:4px 0 0;padding-left:18px} li{margin:3px 0;font-size:13px}
  .verdict{font-size:14px;margin-top:6px;color:#334155}
  .foot{margin-top:22px;border-top:1px solid #e2e8f0;padding-top:12px;color:#94a3b8;font-size:11px;display:flex;justify-content:space-between}
  .btns{position:fixed;top:12px;right:12px;display:flex;gap:8px}
  .btns button{font:inherit;font-weight:700;font-size:13px;padding:8px 14px;border-radius:8px;border:0;cursor:pointer}
  pre.ltr{white-space:pre-wrap;word-wrap:break-word;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin:0;color:#1f2937}
  @media print{.btns{display:none} body{background:#fff} .page{padding:0}}
</style></head>
<body>
  <div class="btns">
    <button style="background:#4f46e5;color:#fff" onclick="window.print()">🖨 Print / Save PDF</button>
    <button style="background:#e2e8f0;color:#0f172a" onclick="window.close()">Close</button>
  </div>
  <div class="page">
    <div class="top">
      <div>
        <div class="brand">AutoPilot · Investment Deal Sheet</div>
        <div class="addr">${esc(lead.address)}</div>
        <div class="sub">${esc(lead.city)}, ${esc(lead.state)} ${esc(lead.zip)}</div>
      </div>
      <div style="text-align:right">
        <span class="badge" style="background:${vc}">${esc(a.verdict.call)}</span>
        <span class="grade">Grade ${esc(a.grade)}</span>
        <div class="sub" style="margin-top:8px">${new Date().toLocaleDateString()}</div>
      </div>
    </div>

    <div class="verdict"><b>Verdict:</b> ${esc(a.verdict.reason)}</div>

    <div class="grid">
      ${facts.map(([k, v]) => `<div class="cell"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`).join("")}
    </div>

    <div class="card">
      <div class="h">The Numbers</div>
      <div class="grid" style="margin:0">
        ${numbers.map(([k, v, c]) => `<div class="cell"><div class="k">${esc(k)}</div><div class="v" style="color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>

    <div class="card">
      <div class="h">Why It's a Deal</div>
      <ul>${whyList}</ul>
    </div>

    ${maoBlock}

    ${brrrrBlock}

    ${compBlock}

    ${sellBlock}

    ${carryBlock}

    ${predBlock}

    <div class="card">
      <div class="h">Comparable Properties</div>
      <table><thead><tr><th>Address</th><th style="text-align:right">Value</th><th style="text-align:right">Sq Ft</th></tr></thead>
      <tbody>${compRows}</tbody></table>
    </div>

    <div class="card">
      <div class="h">Owner & Foreclosure</div>
      <p style="margin:0 0 6px"><b>${esc(lead.ownerName || "Owner Unknown")}</b>${lead.isAbsentee ? ' · <span style="color:#7c3aed">Absentee</span>' : ""}${lead.taxDelinquent ? ' · <span style="color:#dc2626">Tax delinquent</span>' : ""}</p>
      <p style="margin:0 0 6px">${contactHtml}</p>
      <p style="margin:0 0 6px;color:#475569;font-size:13px">${lead.auctionDate ? `Auction: ${esc(lead.auctionDate)}${typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0 ? ` (${lead.daysUntilAuction} days)` : ""} · ` : ""}${lead.defaultAmount ? `Default: ${m(lead.defaultAmount)} · ` : ""}${lead.estimatedValue ? `Listed/Value: ${m(lead.estimatedValue)}` : ""}</p>
      <p style="margin:0;font-size:12px">✅ Verify the filing (free, same-day): <a href="${esc(rec.url)}" target="_blank" style="color:#1d4ed8">${esc(rec.label)}</a></p>
    </div>

    ${outreachBlock}

    <div class="foot">
      <span>Generated by AutoPilot — figures are estimates for investor underwriting, not an appraisal.</span>
      <span>${esc(lead.address)}</span>
    </div>
  </div>
</body></html>`
}

// Open the deal sheet in a new window (print / save-as-PDF ready).
export function openDealSheet(lead: ForeclosureLead, fallbackPsf?: number): void {
  if (typeof window === "undefined") return
  const html = dealSheetHtml(lead, fallbackPsf)
  const w = window.open("", "_blank", "width=900,height=1000")
  if (!w) {
    // Pop-up blocked — fall back to a Blob URL the user can open.
    const blob = new Blob([html], { type: "text/html" })
    window.open(URL.createObjectURL(blob), "_blank")
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
