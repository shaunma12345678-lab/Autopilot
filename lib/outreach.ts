// Seller-outreach generator — turns a lead into ready-to-send, personalized
// contact pieces a wholesaler/investor can use immediately: a yellow-letter,
// a cold-call script, and an SMS, plus a financing recommendation and a county
// recorder verification link. Templates adapted from proven pre-foreclosure
// outreach playbooks (empathy-first, speed-driven). Pure, no network.

import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import type { DealAnalysis } from "@/lib/deal-analysis"

const ownerFirst = (lead: ForeclosureLead): string => {
  const n = (lead.ownerName || "").trim()
  if (!n || /unknown|estate of|heirs|llc|trust|inc\b/i.test(n)) return "there"
  return n.split(/\s+/)[0]
}
const place = (lead: ForeclosureLead): string => [lead.city, lead.state].filter(Boolean).join(", ") || "your area"

// Empathy-first yellow letter — mail within 7 days of an NOD filing for the best
// response. Investor fills [Your Name]/[Your Phone]/[Your Company].
export function yellowLetter(lead: ForeclosureLead): string {
  const owner = lead.ownerName?.trim() && !/unknown/i.test(lead.ownerName) ? lead.ownerName : "Homeowner"
  return `Dear ${owner},

I'm a local real estate investor and I recently learned you may be going through a difficult time with your property at ${lead.address}${lead.city ? `, ${lead.city}` : ""}. I'm reaching out in complete confidence — not to pressure you, but to let you know there may be an option that helps you avoid foreclosure and protect your credit.

Here's what I can offer:
  • A fair all-cash offer based on the current condition of your home
  • A quick, hassle-free closing — often in 10–21 days
  • Zero commissions, zero agent fees, zero repair costs
  • Help to walk away with cash in your pocket AND avoid a foreclosure on your record

A foreclosure can stay on your credit for 7 years. Selling now — even below market — protects your financial future far better than losing the home at auction. I genuinely want to help you find the best outcome.

If you'd like to learn more, call or text me at [Your Phone] — completely confidential.

Sincerely,
[Your Name]
[Your Phone] · [Your Company]

P.S. — If you're already working with an attorney or have made arrangements, please disregard this letter. I wish you the very best.`
}

// Cold-call script — best Tue–Thu, 5:00–7:30pm local.
export function coldCallScript(lead: ForeclosureLead): string {
  const name = ownerFirst(lead) === "there" ? "[Owner Name]" : ownerFirst(lead)
  return `[When they answer]
"Hi, is this ${name}? My name is [Your Name] — I'm a local real estate investor here in ${place(lead)}. I'm not calling to bother you. I work with homeowners going through a tough time with their mortgage, and I thought I might be able to help. Do you have two minutes?"

[If yes — continue. If no — "No problem, I'll send you a letter instead."]
"I want to be straight with you — I saw there may be a notice related to your property at ${lead.address}. I'm not here to judge — life happens. I just want to see if there's anything I can do to help before things get more complicated."

[If they ask how you found out]
"It's public record at the county — nothing to be embarrassed about. A lot of good people go through this. My job is to help find a solution."

[Key question — then match your offer to their answer]
"Can I ask — what's most important to you right now? Staying in the home, getting some cash, protecting your credit, or just getting this off your plate as fast as possible?"

[If they want cash]
"That's exactly what I help with. I buy as-is, pay cash, close fast, and cover all the costs. Could I come by and take a quick look this week?"

[If they want to stay]
"I understand. I may not be able to help you stay, but I can help you exit in a way that protects your credit and puts money in your pocket — better than what happens at auction."`
}

// SMS — ~98% open rate. Keep it short and human.
export function smsScript(lead: ForeclosureLead): string {
  const name = ownerFirst(lead)
  return `Hi ${name}, my name is [Your Name] — a local home buyer in ${place(lead)}. I know this may be unexpected, but I work with homeowners facing foreclosure and would love to see if I can help. No pressure at all — just want to make sure you know your options before any deadline. Call or text me anytime: [Your Phone]`
}

// Financing recommendation based on the chosen exit.
export function financingFit(deal: DealAnalysis): string {
  const s = (deal.exit?.strategy || "").toLowerCase()
  if (s.includes("wholesale"))
    return "Transactional funding or a double-close (~1–2% flat fee) — no long-term hold; you assign or flip the contract."
  if (s.includes("brrrr") || s.includes("hold") || s.includes("rental"))
    return "Hard money for the buy + rehab (Kiavi / Lima One, ~10–12%, 3–7 day close), then a DSCR refinance (~7–7.5%) to pull your capital back out and hold."
  return "Hard money for acquisition + rehab (~10–13%, 12-month term, 75–80% LTV); private money is fastest if you have it. Refi into a DSCR loan once stabilized."
}

// County recorder link to verify the NOD / lis-pendens filing (free, same-day).
// Keyed by city for the known target markets; generic search otherwise.
const RECORDERS: Record<string, { label: string; url: string }> = {
  "independence:mo": { label: "Jackson County, MO Recorder",        url: "https://recorder.jacksongov.org" },
  "kansas city:mo":  { label: "Jackson County, MO Recorder",        url: "https://recorder.jacksongov.org" },
  "indianapolis:in": { label: "Marion County, IN Recorder",         url: "https://indy.gov/activity/recording" },
  "riverside:ca":    { label: "Riverside County, CA Recorder",      url: "https://recorder.co.riverside.ca.us" },
  "temecula:ca":     { label: "Riverside County, CA Recorder",      url: "https://recorder.co.riverside.ca.us" },
  "san bernardino:ca": { label: "San Bernardino County, CA Recorder", url: "https://arc.sbcounty.gov" },
  "chula vista:ca":  { label: "San Diego County, CA Recorder",      url: "https://arcc.sdcounty.ca.gov" },
  "national city:ca": { label: "San Diego County, CA Recorder",     url: "https://arcc.sdcounty.ca.gov" },
  "san diego:ca":    { label: "San Diego County, CA Recorder",      url: "https://arcc.sdcounty.ca.gov" },
}

export function recorderLink(lead: ForeclosureLead): { label: string; url: string } {
  const city = (lead.city || "").toLowerCase().trim()
  const st = (lead.state || "").toLowerCase().trim()
  const hit = RECORDERS[`${city}:${st}`]
  if (hit) return hit
  const q = encodeURIComponent(`${lead.city ? lead.city + " " : ""}${lead.state} county recorder notice of default lis pendens search`)
  return { label: "County recorder search", url: `https://www.google.com/search?q=${q}` }
}
