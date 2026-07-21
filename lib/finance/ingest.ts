// Universal bank-statement ingestion — the "better than Plaid" data plane.
// Plaid rents you bank connections; every bank already EXPORTS this data for
// free. This module reads all of it: OFX/QFX and QIF (the standards every US
// bank supports) and arbitrary CSV — auto-detected delimiter, fuzzy header
// mapping, debit/credit split columns, US/EU/ISO date inference, negatives in
// parentheses. No credentials, no per-connection fees, no coverage gaps.
// Pure and synchronous. Never throws — bad rows are skipped and counted.

import { createHash } from "crypto"

export interface ParsedTxn {
  date: string          // ISO yyyy-mm-dd
  amount: number        // + income, − expense
  name: string          // raw descriptor
  fitId?: string        // bank's own transaction id when the format carries one
}

export interface ParseResult {
  format: "ofx" | "qif" | "csv" | "unknown"
  transactions: ParsedTxn[]
  skipped: number
  accountHint?: string  // acct id / name found inside the file
}

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

// ── OFX / QFX (SGML or XML flavors) ─────────────────────────────────────────
function parseOfx(text: string): ParseResult {
  const transactions: ParsedTxn[] = []
  let skipped = 0
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  for (const b of blocks) {
    const tag = (name: string): string | null => {
      const m = b.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"))
      return m ? m[1].trim() : null
    }
    const dt = tag("DTPOSTED") ?? tag("DTUSER")
    const amtRaw = tag("TRNAMT")
    const name = [tag("NAME"), tag("MEMO")].filter(Boolean).join(" — ")
    const dm = dt?.match(/^(\d{4})(\d{2})(\d{2})/)
    const amount = amtRaw != null ? Number(amtRaw.replace(/[+,]/g, "")) : NaN
    const date = dm ? iso(Number(dm[1]), Number(dm[2]), Number(dm[3])) : null
    if (!date || !Number.isFinite(amount) || !name) { skipped++; continue }
    transactions.push({ date, amount, name: name.slice(0, 200), fitId: tag("FITID") ?? undefined })
  }
  const acct = text.match(/<ACCTID>([^<\r\n]*)/i)?.[1]?.trim()
  return { format: "ofx", transactions, skipped, accountHint: acct ? `…${acct.slice(-4)}` : undefined }
}

// ── QIF ─────────────────────────────────────────────────────────────────────
function parseQif(text: string): ParseResult {
  const transactions: ParsedTxn[] = []
  let skipped = 0
  for (const entry of text.split(/^\^\s*$/m)) {
    let date: string | null = null, amount: number | null = null
    const nameParts: string[] = []
    for (const line of entry.split(/\r?\n/)) {
      const code = line[0], v = line.slice(1).trim()
      if (code === "D") {
        const m = v.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-'’ ]?(\d{2,4})/)
        if (m) {
          const yy = Number(m[3].length === 2 ? (Number(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`) : m[3])
          date = iso(yy, Number(m[1]), Number(m[2]))
        }
      } else if (code === "T" || code === "U") {
        const n = Number(v.replace(/[$,]/g, ""))
        if (Number.isFinite(n)) amount = n
      } else if (code === "P" || code === "M") {
        if (v) nameParts.push(v)
      }
    }
    if (!date || amount == null || !nameParts.length) { if (entry.trim() && !entry.trim().startsWith("!")) skipped++; continue }
    transactions.push({ date, amount, name: nameParts.join(" — ").slice(0, 200) })
  }
  return { format: "qif", transactions, skipped }
}

// ── CSV — the hard one: every bank invents its own layout ───────────────────
const DATE_HEADERS = ["date", "transaction date", "posted date", "post date", "posting date", "trans date", "effective date", "value date"]
const DESC_HEADERS = ["description", "payee", "name", "memo", "transaction", "details", "narrative", "merchant", "transaction description", "original description"]
const AMOUNT_HEADERS = ["amount", "transaction amount", "amt", "value"]
const DEBIT_HEADERS = ["debit", "withdrawal", "withdrawals", "money out", "paid out", "debit amount", "outflow"]
const CREDIT_HEADERS = ["credit", "deposit", "deposits", "money in", "paid in", "credit amount", "inflow"]

function sniffDelimiter(lines: string[]): string {
  const cands = [",", ";", "\t", "|"]
  let best = ",", bestScore = -1
  for (const d of cands) {
    const counts = lines.slice(0, 8).map((l) => l.split(d).length)
    const first = counts[0]
    if (first < 2) continue
    const consistent = counts.filter((c) => c === first).length
    const score = consistent * 10 + first
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

// Split one CSV line honoring quotes.
function splitCsv(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = "", inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ
    } else if (ch === delim && !inQ) { out.push(cur); cur = "" }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

function cleanAmount(v: string): number | null {
  if (!v) return null
  let s = v.replace(/[$€£,\s]/g, "")
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (/(cr)$/i.test(s)) s = s.replace(/cr$/i, "")
  if (/(dr)$/i.test(s)) { neg = true; s = s.replace(/dr$/i, "") }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -Math.abs(n) : n
}

// Infer date order from samples: if any first-part > 12 it's DMY; if any
// middle-part > 12 it's MDY; ISO detected directly. Default: MDY (US banks).
function makeDateParser(samples: string[]): (v: string) => string | null {
  const isoLike = samples.some((s) => /^\d{4}-\d{2}-\d{2}/.test(s))
  if (isoLike) {
    return (v) => {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
      return m ? iso(Number(m[1]), Number(m[2]), Number(m[3])) : null
    }
  }
  let dmy = false
  for (const s of samples) {
    const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/)
    if (m && Number(m[1]) > 12) { dmy = true; break }
  }
  return (v) => {
    const m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/)
    if (!m) {
      const t = Date.parse(v)   // last resort: "Jan 5, 2026" styles
      if (Number.isNaN(t)) return null
      const d = new Date(t)
      return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    }
    const yy = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
    return dmy ? iso(yy, Number(m[2]), Number(m[1])) : iso(yy, Number(m[1]), Number(m[2]))
  }
}

const matchHeader = (h: string, cands: string[]): boolean => {
  const n = h.toLowerCase().replace(/["#_]/g, " ").trim()
  return cands.some((c) => n === c || n.startsWith(c) || c.startsWith(n) && n.length >= 4)
}

function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { format: "csv", transactions: [], skipped: lines.length }
  const delim = sniffDelimiter(lines)

  // Find the header row (banks love preamble junk above it).
  let headerIdx = -1, cols: string[] = []
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = splitCsv(lines[i], delim)
    const hasDate = cells.some((c) => matchHeader(c, DATE_HEADERS))
    const hasDesc = cells.some((c) => matchHeader(c, DESC_HEADERS))
    const hasAmt = cells.some((c) => matchHeader(c, AMOUNT_HEADERS) || matchHeader(c, DEBIT_HEADERS) || matchHeader(c, CREDIT_HEADERS))
    if (hasDate && (hasDesc || hasAmt)) { headerIdx = i; cols = cells; break }
  }

  let dateI = -1, descI = -1, amtI = -1, debitI = -1, creditI = -1
  if (headerIdx >= 0) {
    cols.forEach((c, i) => {
      if (dateI < 0 && matchHeader(c, DATE_HEADERS)) dateI = i
      else if (descI < 0 && matchHeader(c, DESC_HEADERS)) descI = i
      else if (amtI < 0 && matchHeader(c, AMOUNT_HEADERS)) amtI = i
      else if (debitI < 0 && matchHeader(c, DEBIT_HEADERS)) debitI = i
      else if (creditI < 0 && matchHeader(c, CREDIT_HEADERS)) creditI = i
    })
  } else {
    // Headerless: assume date, description, amount by probing the first row.
    headerIdx = -1
    const probe = splitCsv(lines[0], delim)
    probe.forEach((c, i) => {
      if (dateI < 0 && /\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}/.test(c)) dateI = i
      else if (amtI < 0 && cleanAmount(c) != null && /\d/.test(c)) amtI = i
      else if (descI < 0 && /[a-z]{3}/i.test(c)) descI = i
    })
  }
  if (dateI < 0 || (amtI < 0 && debitI < 0 && creditI < 0)) return { format: "csv", transactions: [], skipped: lines.length }

  const rows = lines.slice(headerIdx + 1).map((l) => splitCsv(l, delim))
  const parseDate = makeDateParser(rows.slice(0, 12).map((r) => r[dateI] ?? "").filter(Boolean))

  const transactions: ParsedTxn[] = []
  let skipped = 0
  for (const r of rows) {
    const date = parseDate(r[dateI] ?? "")
    let amount: number | null = null
    if (amtI >= 0) amount = cleanAmount(r[amtI] ?? "")
    if (amount == null && (debitI >= 0 || creditI >= 0)) {
      const deb = debitI >= 0 ? cleanAmount(r[debitI] ?? "") : null
      const cred = creditI >= 0 ? cleanAmount(r[creditI] ?? "") : null
      if (deb != null && deb !== 0) amount = -Math.abs(deb)
      else if (cred != null && cred !== 0) amount = Math.abs(cred)
    }
    const name = (descI >= 0 ? r[descI] : r.filter((_, i) => i !== dateI && i !== amtI).join(" ")).trim()
    if (!date || amount == null || amount === 0 || !name) { skipped++; continue }
    transactions.push({ date, amount, name: name.slice(0, 200) })
  }
  return { format: "csv", transactions, skipped }
}

// ── Entry point ─────────────────────────────────────────────────────────────
export function parseStatement(text: string, fileName?: string): ParseResult {
  const t = text.trim()
  if (!t) return { format: "unknown", transactions: [], skipped: 0 }
  const lower = (fileName ?? "").toLowerCase()
  if (/<OFX|<STMTTRN|OFXHEADER/i.test(t) || lower.endsWith(".ofx") || lower.endsWith(".qfx")) return parseOfx(t)
  if (/^!Type:/m.test(t) || lower.endsWith(".qif")) return parseQif(t)
  return parseCsv(t)
}

// Stable dedupe signature: same txn imported twice (overlapping statements,
// re-uploads) collapses to one row. Bank FITIDs win when present.
export function txnHash(accountId: string, t: ParsedTxn): string {
  const basis = t.fitId
    ? `${accountId}|fit|${t.fitId}`
    : `${accountId}|${t.date}|${t.amount.toFixed(2)}|${t.name.toLowerCase().replace(/\s+/g, " ").slice(0, 80)}`
  return createHash("sha256").update(basis).digest("hex").slice(0, 32)
}
