// One-click "act on the lead" helpers that work on ANY device with no provider
// config: native call / text / email deep links pre-filled with the message,
// plus a printable direct-mail letter (the wholesaler's "yellow letter"). These
// complement the server-side send (which needs an SMS/email provider) so a user
// can always reach an owner immediately.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"

const digits = (phone: string | null | undefined) => (phone ?? "").replace(/[^\d+]/g, "")

export function telHref(phone: string | null | undefined): string {
  return `tel:${digits(phone)}`
}

// `sms:NUMBER?&body=...` is the most broadly-compatible form across iOS/Android.
export function smsHref(phone: string | null | undefined, body: string): string {
  const n = digits(phone)
  return body ? `sms:${n}?&body=${encodeURIComponent(body)}` : `sms:${n}`
}

export function mailtoHref(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

// A clean, print/mail-ready letter. Owner block is positioned for a standard
// #10 window envelope; the body is the (edited) outreach copy.
export function printLetter(lead: ForeclosureLead, body: string, fromName?: string, fromPhone?: string): void {
  if (typeof window === "undefined") return
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  const paras = (body || "").trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
  const sig = fromName
    ? `<p class="sig">Warm regards,<br><b>${esc(fromName)}</b>${fromPhone ? `<br>${esc(fromPhone)}` : ""}</p>`
    : `<p class="sig">Warm regards,<br><b>[Your Name]</b>${fromPhone ? `<br>${esc(fromPhone)}` : "<br>[Your Phone]"}</p>`

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Letter — ${esc(lead.address)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Georgia,"Times New Roman",serif;color:#111;margin:0;background:#f1f5f9}
  .sheet{max-width:8.5in;min-height:11in;margin:0 auto;background:#fff;padding:1in 1in 0.8in}
  .date{margin:0 0 28px;color:#333}
  .to{margin:0 0 30px;line-height:1.5}
  p{font-size:15px;line-height:1.7;margin:0 0 14px}
  .sig{margin-top:26px}
  .btns{position:fixed;top:12px;right:12px;display:flex;gap:8px}
  .btns button{font-family:-apple-system,system-ui,sans-serif;font-weight:700;font-size:13px;padding:8px 14px;border-radius:8px;border:0;cursor:pointer}
  @media print{.btns{display:none} body{background:#fff} .sheet{margin:0;padding:1in}}
</style></head>
<body>
  <div class="btns">
    <button style="background:#4f46e5;color:#fff" onclick="window.print()">🖨 Print / Save PDF</button>
    <button style="background:#e2e8f0;color:#0f172a" onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <p class="date">${esc(today)}</p>
    <div class="to">
      <b>${esc(lead.ownerName || "Current Homeowner")}</b><br>
      ${esc(lead.address)}<br>
      ${esc(lead.city)}, ${esc(lead.state)} ${esc(lead.zip)}
    </div>
    ${paras || "<p>[Your letter copy here]</p>"}
    ${sig}
  </div>
</body></html>`

  const w = window.open("", "_blank", "width=820,height=1000")
  if (!w) { window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank"); return }
  w.document.open(); w.document.write(html); w.document.close()
}

// Bulk mail-merge: one print job, a personalized letter per lead (each on its
// own page). Lets a wholesaler mail an ENTIRE area at once — every lead has an
// owner name + property address, so this reaches people who have no phone/email.
// Supports [OWNER], [ADDRESS], [CITY] placeholders in the body.
export function printLetterBatch(leads: ForeclosureLead[], body: string, fromName?: string, fromPhone?: string): void {
  if (typeof window === "undefined" || leads.length === 0) return
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  const sigName  = fromName || "[Your Name]"
  const sigPhone = fromPhone || "[Your Phone]"

  const letterFor = (lead: ForeclosureLead): string => {
    const filled = (body || "")
      .replace(/\[OWNER\]/gi, lead.ownerName || "Homeowner")
      .replace(/\[ADDRESS\]/gi, lead.address || "")
      .replace(/\[CITY\]/gi, lead.city || "")
    const paras = filled.trim().split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
    return `<div class="sheet">
      <p class="date">${esc(today)}</p>
      <div class="to"><b>${esc(lead.ownerName || "Current Homeowner")}</b><br>${esc(lead.address)}<br>${esc(lead.city)}, ${esc(lead.state)} ${esc(lead.zip)}</div>
      ${paras || "<p>[Your letter copy here]</p>"}
      <p class="sig">Warm regards,<br><b>${esc(sigName)}</b><br>${esc(sigPhone)}</p>
    </div>`
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${leads.length} Letters — mail merge</title>
<style>
  *{box-sizing:border-box} body{font-family:Georgia,"Times New Roman",serif;color:#111;margin:0;background:#f1f5f9}
  .sheet{max-width:8.5in;min-height:10.6in;margin:0 auto 18px;background:#fff;padding:1in;page-break-after:always}
  .date{margin:0 0 28px;color:#333} .to{margin:0 0 30px;line-height:1.5}
  p{font-size:15px;line-height:1.7;margin:0 0 14px} .sig{margin-top:26px}
  .btns{position:fixed;top:12px;right:12px;display:flex;gap:8px}
  .btns button{font-family:-apple-system,system-ui,sans-serif;font-weight:700;font-size:13px;padding:8px 14px;border-radius:8px;border:0;cursor:pointer}
  @media print{.btns{display:none} body{background:#fff} .sheet{margin:0;padding:1in}}
</style></head>
<body>
  <div class="btns">
    <button style="background:#4f46e5;color:#fff" onclick="window.print()">🖨 Print all ${leads.length}</button>
    <button style="background:#e2e8f0;color:#0f172a" onclick="window.close()">Close</button>
  </div>
  ${leads.map(letterFor).join("")}
</body></html>`

  const w = window.open("", "_blank", "width=820,height=1000")
  if (!w) { window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank"); return }
  w.document.open(); w.document.write(html); w.document.close()
}
