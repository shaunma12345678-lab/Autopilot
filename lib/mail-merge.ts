// Our own bulk direct-mail system — turns a batch of leads into print-ready,
// personalized letters (one per page) plus a CSV for any mail house. No third
// party: the letter copy is ours, the owner name comes from public records /
// the foreclosure filing, and it mails to the property (or the owner's mailing
// address when we have it). Client-side; opens a print window.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { yellowLetter } from "@/lib/outreach"

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

// Where to mail: the owner's mailing address if we have it (absentee owners),
// else the property address.
function recipientBlock(lead: ForeclosureLead): string {
  const name = lead.ownerName?.trim() && !/unknown/i.test(lead.ownerName) ? lead.ownerName : "Current Homeowner"
  const mailTo = (lead.mailingAddress || "").trim()
  const line2 = mailTo || [lead.address, [lead.city, lead.state, lead.zip].filter(Boolean).join(", ")].filter(Boolean).join(", ")
  return `<div class="rcpt">${esc(name)}<br>${esc(line2)}</div>`
}

export function mailMergeHtml(leads: ForeclosureLead[]): string {
  const pages = leads.map((l) => `
    <div class="page">
      ${recipientBlock(l)}
      <div class="body">${esc(yellowLetter(l)).replace(/\n/g, "<br>")}</div>
    </div>`).join("")
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mail Merge — ${leads.length} letters</title>
<style>
  *{box-sizing:border-box} body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:0;background:#f1f5f9}
  .page{max-width:720px;margin:0 auto 18px;background:#fff;padding:48px 56px;min-height:9.5in}
  .rcpt{font-size:14px;line-height:1.4;margin-bottom:40px}
  .body{font-size:14px;line-height:1.7;white-space:normal}
  .bar{position:fixed;top:12px;right:12px;display:flex;gap:8px}
  .bar button{font:inherit;font-weight:700;font-size:13px;padding:8px 14px;border-radius:8px;border:0;cursor:pointer}
  @media print{.bar{display:none} body{background:#fff} .page{margin:0;box-shadow:none;page-break-after:always}}
</style></head>
<body>
  <div class="bar">
    <button style="background:#4f46e5;color:#fff" onclick="window.print()">🖨 Print all ${leads.length}</button>
    <button style="background:#e2e8f0;color:#0f172a" onclick="window.close()">Close</button>
  </div>
  ${pages || '<div class="page">No leads to mail.</div>'}
</body></html>`
}

export function openMailMerge(leads: ForeclosureLead[]): void {
  if (typeof window === "undefined" || leads.length === 0) return
  const html = mailMergeHtml(leads)
  const w = window.open("", "_blank", "width=820,height=1000")
  if (!w) { const blob = new Blob([html], { type: "text/html" }); window.open(URL.createObjectURL(blob), "_blank"); return }
  w.document.open(); w.document.write(html); w.document.close()
}

// CSV for a mail house / your own mailing list.
export function mailMergeCsv(leads: ForeclosureLead[]): string {
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`
  const rows = leads.map((l) => [
    l.ownerName && !/unknown/i.test(l.ownerName) ? l.ownerName : "Current Homeowner",
    l.mailingAddress || l.address, l.city, l.state, l.zip, l.address,
  ].map(q).join(","))
  return ["owner,mail_address,city,state,zip,property_address", ...rows].join("\n")
}

export function downloadMailCsv(leads: ForeclosureLead[]): void {
  if (typeof window === "undefined" || leads.length === 0) return
  const blob = new Blob([mailMergeCsv(leads)], { type: "text/csv" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = `mail-list-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}
