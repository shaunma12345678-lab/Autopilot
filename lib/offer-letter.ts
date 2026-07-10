// One-Click Offer Engine — generates professional, print/PDF-ready Letters of
// Intent (LOI) to purchase. Deliberately a NON-BINDING LOI, not a purchase
// contract: it gets a real number in front of the seller fast, while the
// binding agreement stays with your state-specific contract + attorney/escrow.
// Client-side only (opens a print window), zero dependencies — like deal-sheet.

export interface OfferInput {
  ownerName: string
  address: string
  city: string
  state: string
  zip: string
  offerPrice: number
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  emd: number              // earnest money deposit
  closeDays: number        // days to close
  inspectionDays: number   // inspection/due-diligence period
  expireDays: number       // offer validity window
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Zero/unknown prices render as a fill-in line so batch LOIs stay honest.
const money = (n: number): string => (n > 0 ? `$${Math.round(n).toLocaleString()}` : "$____________")

function letterBody(o: OfferInput, today: string, expires: string): string {
  const prop = esc([o.address, o.city, o.state, o.zip].filter(Boolean).join(", "))
  const owner = esc(o.ownerName || "Property Owner")
  const buyer = esc(o.buyerName || "[Your Name]")
  return `
  <div class="letter">
    <div class="head">
      <div>
        <p class="brand">LETTER OF INTENT TO PURCHASE</p>
        <p class="sub">Cash offer · as-is · no agent fees</p>
      </div>
      <div class="date">${esc(today)}</div>
    </div>

    <p>Dear ${owner},</p>
    <p>Thank you for the opportunity to present this offer. I am prepared to purchase the property described below on the following terms:</p>

    <table class="terms">
      <tr><td>Property</td><td><b>${prop}</b></td></tr>
      <tr><td>Purchase price</td><td><b class="price">${money(o.offerPrice)}</b> — all cash</td></tr>
      <tr><td>Condition</td><td>Purchased <b>AS-IS</b> — no repairs, no cleaning, take what you want and leave the rest</td></tr>
      <tr><td>Earnest money</td><td>${money(o.emd)} deposited with a neutral escrow/title company upon signing the purchase agreement</td></tr>
      <tr><td>Due diligence</td><td>${o.inspectionDays} days from acceptance</td></tr>
      <tr><td>Closing</td><td>On or before ${o.closeDays} days from acceptance — or a date that fits your timeline</td></tr>
      <tr><td>Fees</td><td>No real-estate commissions; standard escrow/title costs paid as customary in ${esc(o.state || "your state")}</td></tr>
      <tr><td>Offer valid until</td><td>${esc(expires)}</td></tr>
    </table>

    <p>If these terms work for you, we will prepare a standard state purchase agreement for signature and open escrow immediately. You are welcome to have this letter and the agreement reviewed by an attorney or advisor of your choice — I encourage it.</p>

    <p class="legal">This letter is a <b>non-binding</b> expression of intent and does not create an obligation for either party to buy or sell. All terms remain subject to a mutually executed purchase and sale agreement.</p>

    <div class="sigs">
      <div class="sig">
        <p class="line">&nbsp;</p>
        <p><b>${buyer}</b> — Buyer<br>${esc(o.buyerPhone || "[Your Phone]")}${o.buyerEmail ? `<br>${esc(o.buyerEmail)}` : ""}</p>
      </div>
      <div class="sig">
        <p class="line">&nbsp;</p>
        <p><b>${owner}</b> — Seller<br>Accepted (signature / date)</p>
      </div>
    </div>
  </div>`
}

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; background: #fff; }
  .letter { max-width: 7.4in; margin: 0 auto; padding: 0.7in 0.5in; page-break-after: always; }
  .letter:last-child { page-break-after: auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 22px; }
  .brand { font-size: 17px; font-weight: bold; letter-spacing: 1px; }
  .sub { font-size: 11px; color: #555; margin-top: 3px; }
  .date { font-size: 12px; color: #555; }
  p { font-size: 13px; line-height: 1.65; margin: 11px 0; }
  .terms { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .terms td { border: 1px solid #bbb; padding: 8px 10px; font-size: 12.5px; line-height: 1.5; }
  .terms td:first-child { width: 130px; background: #f4f4f4; font-weight: bold; }
  .price { font-size: 16px; }
  .legal { font-size: 11px; color: #444; border-left: 3px solid #999; padding-left: 10px; }
  .sigs { display: flex; gap: 40px; margin-top: 40px; }
  .sig { flex: 1; }
  .sig .line { border-bottom: 1px solid #111; height: 30px; }
  .sig p { font-size: 11.5px; line-height: 1.5; }
  @media print { .noprint { display: none; } }
`

function openPrintWindow(inner: string, title: string): boolean {
  if (typeof window === "undefined") return false
  const w = window.open("", "_blank", "width=900,height=1000")
  if (!w) return false
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLES}</style></head><body>
    <div class="noprint" style="text-align:center;padding:12px;font-family:sans-serif;font-size:13px;background:#f0f0f0;">
      <button onclick="window.print()" style="padding:8px 22px;font-size:14px;cursor:pointer;">🖨 Print / Save as PDF</button>
    </div>
    ${inner}</body></html>`)
  w.document.close()
  return true
}

// One LOI in a print window. Returns false if the popup was blocked.
export function openOfferLetter(o: OfferInput): boolean {
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  const exp = new Date(); exp.setDate(exp.getDate() + Math.max(1, o.expireDays))
  const expires = exp.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  return openPrintWindow(letterBody(o, today, expires), `Offer — ${o.address}`)
}

// A batch of LOIs, one per page — "make 20 written offers before lunch".
export function openOfferBatch(offers: OfferInput[]): boolean {
  if (offers.length === 0) return false
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
  const inner = offers.map((o) => {
    const exp = new Date(); exp.setDate(exp.getDate() + Math.max(1, o.expireDays))
    const expires = exp.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    return letterBody(o, today, expires)
  }).join("\n")
  return openPrintWindow(inner, `Offers — ${offers.length} properties`)
}
