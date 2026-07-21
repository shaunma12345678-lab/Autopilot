// Transaction enrichment — Plaid's Enrich + Personal Finance Categories +
// Recurring products, rebuilt as ours and made trainable: the user's own
// corrections become permanent vendor rules that outrank everything, a builtin
// vendor map + keyword layer handles the common 90%. Recurring streams are
// detected from cadence + amount stability, transfers from mirrored amounts
// across accounts. This module is PURE and client-safe — the model-backed AI
// pass for leftover unknowns lives in categorize-ai.ts (server-only) so a
// client import of CATEGORIES never drags the AI SDK into the browser bundle.

export interface Category { key: string; label: string; emoji: string; flow: "income" | "expense" | "either"; deductible: boolean }

export const CATEGORIES: Category[] = [
  { key: "income",          label: "Income / Sales",       emoji: "💵", flow: "income",  deductible: false },
  { key: "refund",          label: "Refunds",              emoji: "↩️", flow: "either",  deductible: false },
  { key: "cogs",            label: "COGS / Inventory",     emoji: "📦", flow: "expense", deductible: true },
  { key: "software",        label: "Software / SaaS",      emoji: "🖥", flow: "expense", deductible: true },
  { key: "advertising",     label: "Advertising",          emoji: "📣", flow: "expense", deductible: true },
  { key: "contractors",     label: "Contractors",          emoji: "🧑‍🔧", flow: "expense", deductible: true },
  { key: "payroll",         label: "Payroll",              emoji: "🧾", flow: "expense", deductible: true },
  { key: "rent-utilities",  label: "Rent & Utilities",     emoji: "🏢", flow: "expense", deductible: true },
  { key: "insurance",       label: "Insurance",            emoji: "🛡", flow: "expense", deductible: true },
  { key: "fees-bank",       label: "Bank Fees",            emoji: "🏦", flow: "expense", deductible: true },
  { key: "fees-processing", label: "Processing Fees",      emoji: "💳", flow: "expense", deductible: true },
  { key: "travel",          label: "Travel",               emoji: "✈️", flow: "expense", deductible: true },
  { key: "meals",           label: "Meals",                emoji: "🍽", flow: "expense", deductible: true },
  { key: "supplies",        label: "Office & Supplies",    emoji: "📎", flow: "expense", deductible: true },
  { key: "equipment",       label: "Equipment",            emoji: "🔧", flow: "expense", deductible: true },
  { key: "professional",    label: "Legal & Professional", emoji: "⚖️", flow: "expense", deductible: true },
  { key: "taxes",           label: "Taxes",                emoji: "🏛", flow: "expense", deductible: false },
  { key: "loan-debt",       label: "Loans & Debt",         emoji: "📉", flow: "either",  deductible: false },
  { key: "transfer",        label: "Transfer",             emoji: "🔁", flow: "either",  deductible: false },
  { key: "owner",           label: "Owner Draw / Invest",  emoji: "👤", flow: "either",  deductible: false },
  { key: "other",           label: "Other",                emoji: "❔", flow: "either",  deductible: false },
]
export const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key))

// ── Merchant normalization (Plaid Enrich, ours) ─────────────────────────────
const PROCESSOR_PREFIX = /^(sq\s*\*|tst\*\s*|py\s*\*|paypal\s*\*|pp\*|sp\s+|amzn\s*mktp\s*|amazon\s*mktp\s*|gpay\s+|apl\*\s*|ach\s+(debit|credit)\s+|pos\s+(debit|purchase)\s+|checkcard\s+\d*\s*|debit\s+card\s+purchase\s+|recurring\s+payment\s+|web\s+pmt[- ]|ach\s+pmt[- ]|zel\*?\s+|venmo\s*\*?\s*)/i
const TRAILING_JUNK = /(\s+#?\d{3,}|\s+x{2,}\d+|\s+\d{2}\/\d{2}|\s+card\s*\d+|\s+[a-z]{2}\s*\d{5}(-\d{4})?)\s*$/i

export function normalizeMerchant(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim()
  for (let i = 0; i < 3; i++) s = s.replace(PROCESSOR_PREFIX, "")
  for (let i = 0; i < 3; i++) s = s.replace(TRAILING_JUNK, "")
  s = s.replace(/\s*(—|-)\s*$/g, "").replace(/[*#]+/g, " ").replace(/\s+/g, " ").trim()
  if (!s) s = raw.trim()
  // Title-case ALL-CAPS descriptors; keep mixed case as the vendor wrote it.
  if (s === s.toUpperCase()) s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  return s.slice(0, 80)
}

// ── Builtin vendor map — the common 90% ─────────────────────────────────────
const BUILTIN: Array<[RegExp, string]> = [
  [/stripe|square\b|sq \*|shopify pay|paypal fee|braintree/i, "fees-processing"],
  [/google\s*(ads|adwords)|facebook\s*ads|fb\s*ads|meta\s*platforms|tiktok\s*ads|linkedin.*ad|bing\s*ads|yelp/i, "advertising"],
  [/aws|amazon\s*web|google\s*(cloud|workspace|gsuite)|microsoft|azure|github|gitlab|vercel|netlify|heroku|digitalocean|supabase|openai|anthropic|groq|twilio|sendgrid|resend|mailchimp|hubspot|salesforce|notion|slack|zoom\.us|zoom video|adobe|figma|canva|dropbox|atlassian|1password|godaddy|namecheap|cloudflare|wix|squarespace|quickbooks|intuit|docusign|calendly|airtable|zapier/i, "software"],
  [/gusto|adp\b|paychex|justworks|rippling|payroll/i, "payroll"],
  [/upwork|fiverr|toptal|99designs/i, "contractors"],
  [/geico|state farm|progressive|allstate|hiscox|next insurance|liberty mutual/i, "insurance"],
  [/electric|edison|pg&e|pge\b|con ed|duke energy|water dept|gas co|utility|comcast|xfinity|spectrum|verizon|at&t|t-mobile|internet/i, "rent-utilities"],
  [/wework|regus|landlord|property mgmt|rent\b/i, "rent-utilities"],
  [/irs\b|us treasury|franchise tax|tax payment|dept of revenue|edd\b/i, "taxes"],
  [/united air|delta air|american air|southwest|alaska air|jetblue|spirit air|frontier|airbnb|marriott|hilton|hyatt|expedia|booking\.com|hertz|avis|enterprise rent|uber(?!\s*eats)|lyft/i, "travel"],
  [/uber\s*eats|doordash|grubhub|starbucks|chipotle|mcdonald|restaurant|cafe|coffee|pizza|deli|diner|grill|kitchen|bakery/i, "meals"],
  [/staples|office depot|officemax|best buy|home depot|lowe'?s|harbor freight|grainger/i, "supplies"],
  [/lawyer|attorney|legal|cpa\b|accounting|bookkeep|llc filing|registered agent|legalzoom/i, "professional"],
  [/overdraft|maintenance fee|service charge|wire fee|monthly fee|nsf fee|atm fee|analysis charge/i, "fees-bank"],
  [/loan pmt|loan payment|sba\s|lending|kabbage|ondeck|amex epayment|card\s*payment|autopay.*card|capital one.*pymt|chase.*epay/i, "loan-debt"],
  [/transfer|xfer|zelle|venmo|cash app|wise\b|online transfer/i, "transfer"],
  [/owner\s*(draw|distribution)|shareholder|member draw/i, "owner"],
  [/deposit|invoice|payout|payment received|remittance/i, "income"],
  [/refund|reversal|chargeback/i, "refund"],
]

const keywordGuess = (merchant: string, amount: number): { cat: string; conf: number } | null => {
  for (const [re, cat] of BUILTIN) {
    if (re.test(merchant)) {
      // Directional sanity: income-ish categories need positive amounts.
      if (cat === "income" && amount < 0) continue
      return { cat, conf: 0.75 }
    }
  }
  if (amount > 0) return { cat: "income", conf: 0.4 }   // default: money in = revenue until told otherwise
  return null
}

// ── Categorize a batch by rules > builtin > keyword (pure, no AI) ───────────
export interface CatInput { merchant: string; name: string; amount: number }
export interface CatResult { category: string; confidence: number; source: "rule" | "builtin" | "keyword" | "ai" | "none" }

export function categorizeRules(
  txns: CatInput[],
  rules: Map<string, string>,          // normalized-merchant(lower) → category
): CatResult[] {
  return txns.map((t) => {
    const ruleCat = rules.get(t.merchant.toLowerCase())
    if (ruleCat && CATEGORY_KEYS.has(ruleCat)) return { category: ruleCat, confidence: 1, source: "rule" }
    const g = keywordGuess(t.merchant, t.amount) ?? keywordGuess(t.name, t.amount)
    if (g && g.conf >= 0.7) return { category: g.cat, confidence: g.conf, source: "builtin" }
    if (g) return { category: g.cat, confidence: g.conf, source: "keyword" }
    return { category: "other", confidence: 0, source: "none" }
  })
}

// ── Recurring streams (Plaid Recurring, ours) ───────────────────────────────
export interface RecurringStream {
  merchant: string
  category: string
  cadence: "weekly" | "biweekly" | "monthly" | "yearly"
  avgAmount: number          // signed
  lastDate: string
  nextExpected: string
  occurrences: number
  priceChangePct: number | null   // latest vs stream average, when notable
}

const CADENCES: Array<{ name: RecurringStream["cadence"]; days: number; tol: number }> = [
  { name: "weekly", days: 7, tol: 2 }, { name: "biweekly", days: 14, tol: 3 },
  { name: "monthly", days: 30.4, tol: 6 }, { name: "yearly", days: 365, tol: 25 },
]

export function detectRecurring(txns: Array<{ merchant: string; category: string; date: string; amount: number }>): RecurringStream[] {
  const byMerchant = new Map<string, { display: string; rows: Array<{ date: string; amount: number; category: string }> }>()
  for (const t of txns) {
    if (t.amount === 0) continue
    const k = t.merchant.toLowerCase()
    if (!byMerchant.has(k)) byMerchant.set(k, { display: t.merchant, rows: [] })
    byMerchant.get(k)!.rows.push(t)
  }
  const streams: RecurringStream[] = []
  for (const [, { display, rows }] of byMerchant) {
    if (rows.length < 3) continue
    rows.sort((a, b) => a.date.localeCompare(b.date))
    const gaps: number[] = []
    for (let i = 1; i < rows.length; i++) gaps.push((Date.parse(rows[i].date) - Date.parse(rows[i - 1].date)) / 86400000)
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
    const cadence = CADENCES.find((c) => Math.abs(avgGap - c.days) <= c.tol && gaps.every((g) => Math.abs(g - c.days) <= c.tol * 2))
    if (!cadence) continue
    const amounts = rows.map((r) => r.amount)
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length
    const stable = amounts.every((a) => Math.abs(a - avgAmount) <= Math.max(Math.abs(avgAmount) * 0.2, 2))
    if (!stable) continue
    const last = rows[rows.length - 1]
    const next = new Date(Date.parse(last.date) + cadence.days * 86400000)
    // Compare magnitudes so a bigger charge reads as a positive "price up",
    // whether the stream is an expense (negative) or income (positive).
    const latestDelta = avgAmount !== 0 ? ((Math.abs(last.amount) - Math.abs(avgAmount)) / Math.abs(avgAmount)) * 100 : 0
    streams.push({
      merchant: display,
      category: last.category,
      cadence: cadence.name,
      avgAmount: Math.round(avgAmount * 100) / 100,
      lastDate: last.date,
      nextExpected: next.toISOString().slice(0, 10),
      occurrences: rows.length,
      priceChangePct: Math.abs(latestDelta) >= 8 ? Math.round(latestDelta) : null,
    })
  }
  return streams.sort((a, b) => Math.abs(b.avgAmount) - Math.abs(a.avgAmount))
}

// ── Transfer matching: the same money seen from both sides ──────────────────
export function markTransfers<T extends { accountId: string; date: string; amount: number; transfer: boolean }>(txns: T[]): number {
  let marked = 0
  const byAmount = new Map<string, T[]>()
  for (const t of txns) byAmount.set(Math.abs(t.amount).toFixed(2), [...(byAmount.get(Math.abs(t.amount).toFixed(2)) ?? []), t])
  for (const [, group] of byAmount) {
    if (group.length < 2) continue
    for (const a of group) {
      if (a.transfer) continue
      const twin = group.find((b) => b !== a && !b.transfer && b.accountId !== a.accountId &&
        Math.sign(b.amount) !== Math.sign(a.amount) &&
        Math.abs(Date.parse(a.date) - Date.parse(b.date)) <= 4 * 86400000)
      if (twin) { a.transfer = true; twin.transfer = true; marked += 2 }
    }
  }
  return marked
}
