// Rental Intelligence — OUR criteria for LTR / MTR / STR, deeper than anyone
// sells. Fuses five things nobody else combines keylessly:
//   1. TREND — Zillow Research public CSVs (ZHVI values + ZORI rents, monthly
//      since 2000/2015): rent growth, price momentum, price-to-rent, drawdown.
//   2. TODAY'S MONEY — Freddie Mac PMMS current 30-yr rate → does the median
//      house actually cash flow at today's payment, not last year's.
//   3. DEMAND PROXIES — ACS: seasonal-home share (revealed vacation demand for
//      STR), healthcare-employment share (travel-nurse MTR demand), college
//      enrollment share (MTR/LTR student demand).
//   4. LAW — curated landlord-friendliness by state (eviction timeline, rent
//      control) and STR legality by city. Approximations, clearly labeled.
//   5. Everything the fundamentals engine already measures (vacancy, renter
//      depth, jobs, migration).
// Every criterion is returned as a checklist row {label, value, ok, why} so the
// verdict is fully explainable. Sources cached in-module (24h). Never throws.

import type { Fundamentals } from "@/lib/market-fundamentals"

// ── Zillow Research (keyless public CSVs, verified live 2026-07) ─────────────
const ZORI_URL = "https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_sfrcondomfr_sm_month.csv"
const ZHVI_URL = "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
const PMMS_URL = "https://www.freddiemac.com/pmms/docs/PMMS_history.csv"

interface MetroSeries { name: string; state: string; last: number; yoy: number | null; m3Annualized: number | null; y3Annual: number | null; drawdown10y: number | null }

const seriesCache = new Map<string, { at: number; rows: MetroSeries[] }>()
const CACHE_TTL = 24 * 60 * 60 * 1000

// Minimal CSV line parser (Zillow files quote names containing commas).
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = "", inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === "," && !inQ) { out.push(cur); cur = "" }
    else cur += ch
  }
  out.push(cur)
  return out
}

async function loadZillow(url: string, key: string): Promise<MetroSeries[]> {
  const cached = seriesCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.rows
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25000) })
    if (!res.ok) return cached?.rows ?? []
    const text = await res.text()
    const lines = text.split("\n")
    const header = splitCsv(lines[0] ?? "")
    const firstMonth = header.findIndex((h) => /^\d{4}-\d{2}-\d{2}$/.test(h))
    if (firstMonth < 0) return cached?.rows ?? []
    const rows: MetroSeries[] = []
    for (let i = 1; i < lines.length; i++) {
      const c = splitCsv(lines[i])
      if (c.length <= firstMonth + 12) continue
      const name = (c[2] ?? "").replace(/"/g, "").trim()
      const state = (c[4] ?? "").trim()
      // Walk back from the end to the latest populated month.
      let li = c.length - 1
      while (li >= firstMonth && !c[li].trim()) li--
      const at = (off: number): number | null => {
        const idx = li - off
        if (idx < firstMonth) return null
        const n = Number(c[idx])
        return Number.isFinite(n) && n > 0 ? n : null
      }
      const last = at(0)
      if (!name || last == null) continue
      const m12 = at(12), m3 = at(3), m36 = at(36)
      const pct = (a: number, b: number | null) => (b ? Math.round(((a / b - 1) * 100) * 10) / 10 : null)
      // Max drawdown over the trailing ~10 years.
      let peak = 0, dd = 0
      for (let k = Math.max(firstMonth, li - 120); k <= li; k++) {
        const v = Number(c[k])
        if (!Number.isFinite(v) || v <= 0) continue
        if (v > peak) peak = v
        else if (peak > 0) dd = Math.max(dd, (peak - v) / peak)
      }
      rows.push({
        name, state, last,
        yoy: pct(last, m12),
        m3Annualized: m3 ? Math.round((Math.pow(last / m3, 4) - 1) * 1000) / 10 : null,
        y3Annual: m36 ? Math.round((Math.pow(last / m36, 1 / 3) - 1) * 1000) / 10 : null,
        drawdown10y: peak > 0 ? Math.round(dd * 1000) / 10 : null,
      })
    }
    if (rows.length) seriesCache.set(key, { at: Date.now(), rows })
    return rows
  } catch {
    return cached?.rows ?? []
  }
}

function matchMetro(rows: MetroSeries[], city: string, state: string): MetroSeries | null {
  const c = city.toLowerCase().trim(), st = state.toUpperCase().trim()
  const inState = rows.filter((r) => r.state === st)
  return (
    inState.find((r) => r.name.toLowerCase() === `${c}, ${st.toLowerCase()}`) ??
    inState.find((r) => r.name.toLowerCase().startsWith(c)) ??
    inState.find((r) => r.name.toLowerCase().includes(c)) ??
    null
  )
}

let pmmsCache: { at: number; rate: number } | null = null
async function mortgageRate30(): Promise<number | null> {
  if (pmmsCache && Date.now() - pmmsCache.at < CACHE_TTL) return pmmsCache.rate
  try {
    const res = await fetch(PMMS_URL, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return pmmsCache?.rate ?? null
    const lines = (await res.text()).trim().split("\n")
    for (let i = lines.length - 1; i > 0; i--) {
      const rate = Number(lines[i].split(",")[1])
      if (Number.isFinite(rate) && rate > 0) { pmmsCache = { at: Date.now(), rate }; return rate }
    }
  } catch { /* fall through */ }
  return pmmsCache?.rate ?? null
}

// ── Curated law tables (approximations — always labeled, verify locally) ─────
interface LandlordLaw { grade: "A" | "B" | "C" | "D" | "F"; evictionDays: number; rentControl: boolean }
const LANDLORD: Record<string, LandlordLaw> = {
  TX: { grade: "A", evictionDays: 30, rentControl: false }, GA: { grade: "A", evictionDays: 35, rentControl: false },
  TN: { grade: "A", evictionDays: 35, rentControl: false }, AL: { grade: "A", evictionDays: 35, rentControl: false },
  AZ: { grade: "A", evictionDays: 30, rentControl: false }, FL: { grade: "A", evictionDays: 40, rentControl: false },
  IN: { grade: "A", evictionDays: 45, rentControl: false }, MO: { grade: "A", evictionDays: 45, rentControl: false },
  OK: { grade: "A", evictionDays: 45, rentControl: false }, UT: { grade: "A", evictionDays: 30, rentControl: false },
  ID: { grade: "A", evictionDays: 30, rentControl: false }, WY: { grade: "A", evictionDays: 30, rentControl: false },
  AR: { grade: "A", evictionDays: 35, rentControl: false }, MS: { grade: "A", evictionDays: 40, rentControl: false },
  NC: { grade: "B", evictionDays: 45, rentControl: false }, SC: { grade: "B", evictionDays: 40, rentControl: false },
  OH: { grade: "B", evictionDays: 45, rentControl: false }, KY: { grade: "B", evictionDays: 45, rentControl: false },
  LA: { grade: "B", evictionDays: 45, rentControl: false }, NV: { grade: "B", evictionDays: 40, rentControl: false },
  KS: { grade: "B", evictionDays: 45, rentControl: false }, IA: { grade: "B", evictionDays: 45, rentControl: false },
  NE: { grade: "B", evictionDays: 45, rentControl: false }, ND: { grade: "B", evictionDays: 45, rentControl: false },
  SD: { grade: "A", evictionDays: 30, rentControl: false }, MT: { grade: "B", evictionDays: 30, rentControl: false },
  WV: { grade: "B", evictionDays: 40, rentControl: false }, MI: { grade: "C", evictionDays: 60, rentControl: false },
  PA: { grade: "C", evictionDays: 60, rentControl: false }, WI: { grade: "C", evictionDays: 60, rentControl: false },
  VA: { grade: "B", evictionDays: 60, rentControl: false }, NM: { grade: "C", evictionDays: 60, rentControl: false },
  NH: { grade: "B", evictionDays: 60, rentControl: false }, AK: { grade: "B", evictionDays: 60, rentControl: false },
  CO: { grade: "C", evictionDays: 60, rentControl: false }, MN: { grade: "C", evictionDays: 60, rentControl: true },
  IL: { grade: "D", evictionDays: 90, rentControl: false }, WA: { grade: "D", evictionDays: 90, rentControl: true },
  OR: { grade: "D", evictionDays: 90, rentControl: true },  MD: { grade: "D", evictionDays: 90, rentControl: true },
  CT: { grade: "D", evictionDays: 120, rentControl: false }, RI: { grade: "C", evictionDays: 90, rentControl: false },
  ME: { grade: "C", evictionDays: 90, rentControl: false }, VT: { grade: "D", evictionDays: 120, rentControl: false },
  DE: { grade: "C", evictionDays: 60, rentControl: false }, HI: { grade: "D", evictionDays: 120, rentControl: false },
  MA: { grade: "F", evictionDays: 120, rentControl: false }, NJ: { grade: "F", evictionDays: 120, rentControl: true },
  NY: { grade: "F", evictionDays: 180, rentControl: true },  CA: { grade: "F", evictionDays: 120, rentControl: true },
  DC: { grade: "F", evictionDays: 180, rentControl: true },
}

type StrStatus = "friendly" | "permit" | "restricted" | "banned"
interface StrRule { status: StrStatus; note: string }
// Curated for our tracked markets. Ordinances change — the UI always says verify.
const STR_RULES: Record<string, StrRule> = {
  "memphis:tn": { status: "permit", note: "Permit required; state law limits city bans" },
  "knoxville:tn": { status: "restricted", note: "Owner-occupied only outside overlay zones" },
  "indianapolis:in": { status: "friendly", note: "State preemption protects STRs; light registration" },
  "phoenix:az": { status: "permit", note: "State-protected; city license + rules" },
  "mesa:az": { status: "permit", note: "State-protected; license required" },
  "glendale:az": { status: "permit", note: "State-protected; license required" },
  "detroit:mi": { status: "permit", note: "Registration required; enforcement light" },
  "cleveland:oh": { status: "permit", note: "Registration required" },
  "columbus:oh": { status: "permit", note: "License required" },
  "cincinnati:oh": { status: "permit", note: "Registration + tax" },
  "kansas city:mo": { status: "restricted", note: "2023 rules: registration, non-owner-occupied capped in residential zones" },
  "st. louis:mo": { status: "permit", note: "Permit system adopted 2023" },
  "houston:tx": { status: "friendly", note: "Registration only (2025); no zoning bans" },
  "san antonio:tx": { status: "permit", note: "Permit + density caps by block" },
  "dallas:tx": { status: "restricted", note: "Banned in single-family zoning (litigation ongoing)" },
  "fort worth:tx": { status: "restricted", note: "Banned in most residential zones" },
  "jacksonville:fl": { status: "permit", note: "State-protected; registration" },
  "tampa:fl": { status: "permit", note: "State-protected; registration" },
  "orlando:fl": { status: "restricted", note: "City: primary-residence rules; nearby Kissimmee/Davenport friendly" },
  "ocala:fl": { status: "permit", note: "State-protected; county registration" },
  "atlanta:ga": { status: "permit", note: "License; non-primary allowed with permit" },
  "birmingham:al": { status: "permit", note: "Registration required" },
  "chicago:il": { status: "restricted", note: "Strict license, prohibited buildings list" },
  "milwaukee:wi": { status: "permit", note: "License; state limits bans" },
  "pittsburgh:pa": { status: "permit", note: "Permit required" },
  "philadelphia:pa": { status: "restricted", note: "Limited-lodging license; owner-occupancy rules" },
  "baltimore:md": { status: "restricted", note: "Non-primary residences capped/licensed" },
  "las vegas:nv": { status: "restricted", note: "Clark County: heavy caps, distance rules, lottery" },
  "buffalo:ny": { status: "permit", note: "Registration; far lighter than NYC" },
  "rochester:ny": { status: "permit", note: "Registration required" },
  "louisville:ky": { status: "permit", note: "Registration; conditional-use in some zones" },
  "greensboro:nc": { status: "friendly", note: "Light rules" },
  "winston-salem:nc": { status: "friendly", note: "Light rules" },
  "columbia:sc": { status: "permit", note: "License required" },
  "montgomery:al": { status: "friendly", note: "Light rules" },
  "oklahoma city:ok": { status: "permit", note: "License required" },
  "tulsa:ok": { status: "friendly", note: "Light registration" },
  "los angeles:ca": { status: "restricted", note: "Primary residence only, 120-day cap without extended permit" },
  "san diego:ca": { status: "restricted", note: "Whole-home licenses capped by lottery" },
  "riverside:ca": { status: "restricted", note: "STRs prohibited in most residential zones" },
  "anaheim:ca": { status: "banned", note: "New STR permits banned" },
  "long beach:ca": { status: "permit", note: "Registration + caps on non-primary" },
}

export interface ChecklistRow { label: string; value: string; ok: "good" | "ok" | "bad"; why: string }
export interface RentalStrategyIntel {
  score: number
  grade: string
  roi: string
  checklist: ChecklistRow[]
  dealbreakers: string[]
  estimated: boolean
}
export interface RentalIntel {
  metro: string | null
  rentYoY: number | null
  rent3yrAnnual: number | null
  zoriRent: number | null
  priceYoY: number | null
  priceMomentum: number | null   // 3-mo annualized
  zhviValue: number | null
  drawdown10y: number | null
  mortgageRate: number | null
  monthlyPayment: number | null  // PITI-ish on the median home, 20% down
  cashflowGap: number | null     // metro rent − payment ($/mo)
  landlord: (LandlordLaw & { state: string }) | null
  strRule: StrRule | null
  ltr: RentalStrategyIntel
  mtr: RentalStrategyIntel
  str: RentalStrategyIntel
  bestRental: string
  verdict: string
}

const grade = (s: number): string => (s >= 80 ? "A" : s >= 65 ? "B" : s >= 50 ? "C" : s >= 35 ? "D" : "F")
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const money = (n: number) => `$${Math.round(n).toLocaleString()}`

export async function buildRentalIntel(city: string, state: string, f: Fundamentals | null): Promise<RentalIntel | null> {
  const [zoriRows, zhviRows, rate] = await Promise.all([
    loadZillow(ZORI_URL, "zori"),
    loadZillow(ZHVI_URL, "zhvi"),
    mortgageRate30(),
  ])
  const zori = matchMetro(zoriRows, city, state)
  const zhvi = matchMetro(zhviRows, city, state)
  if (!zori && !zhvi && !f) return null

  const value = zhvi?.last ?? f?.medianHomeValue ?? null
  const rent = zori?.last ?? f?.medianRent ?? null
  // Payment on the median home at today's rate: 20% down, 30yr P&I + ~1.35%/yr taxes+insurance.
  let monthlyPayment: number | null = null
  if (value && rate) {
    const loan = value * 0.8
    const r = rate / 100 / 12
    const pi = (loan * r) / (1 - Math.pow(1 + r, -360))
    monthlyPayment = Math.round(pi + (value * 0.0135) / 12)
  }
  const cashflowGap = rent != null && monthlyPayment != null ? Math.round(rent - monthlyPayment) : null

  const st = state.toUpperCase().trim()
  const landlord = LANDLORD[st] ? { ...LANDLORD[st], state: st } : null
  const strRule = STR_RULES[`${city.toLowerCase().trim()}:${state.toLowerCase().trim()}`] ?? null

  const row = (label: string, value: string, ok: ChecklistRow["ok"], why: string): ChecklistRow => ({ label, value, ok, why })
  const na = (label: string, why: string): ChecklistRow => ({ label, value: "—", ok: "ok", why })

  // ── LTR — the cash-flow machine ─────────────────────────────────────────────
  const ltrRows: ChecklistRow[] = []
  const ltrBreakers: string[] = []
  let ltr = 50
  if (cashflowGap != null) {
    const ok = cashflowGap >= 0 ? "good" : cashflowGap >= -350 ? "ok" : "bad"
    ltr += cashflowGap >= 0 ? 18 : cashflowGap >= -350 ? 4 : -14
    ltrRows.push(row("Cash flow at TODAY's rate", `${cashflowGap >= 0 ? "+" : ""}${money(cashflowGap)}/mo`, ok,
      `Metro rent ${money(rent!)} vs ~${money(monthlyPayment!)} payment (20% down @ ${rate}%)${cashflowGap >= 0 ? " — the median house pays for itself" : cashflowGap >= -350 ? " — close; discounts/units make it work" : " — deep negative; needs big discounts"}`))
    if (cashflowGap < -600) ltrBreakers.push("Median home is > $600/mo cash-flow negative at today's rate")
  } else ltrRows.push(na("Cash flow at today's rate", "Missing metro value/rent data"))
  if (zori?.yoy != null) {
    const ok = zori.yoy >= 4 ? "good" : zori.yoy >= 1.5 ? "ok" : "bad"
    ltr += zori.yoy >= 4 ? 10 : zori.yoy >= 1.5 ? 4 : -6
    ltrRows.push(row("Rent growth (12mo, Zillow)", `${zori.yoy > 0 ? "+" : ""}${zori.yoy}%`, ok, zori.yoy >= 4 ? "Rents pushing hard — raises baked in" : zori.yoy >= 1.5 ? "Steady rent growth" : "Flat/falling rents"))
  }
  if (f?.rentalVacancyPct != null) {
    const ok = f.rentalVacancyPct <= 5 ? "good" : f.rentalVacancyPct <= 9 ? "ok" : "bad"
    ltr += f.rentalVacancyPct <= 5 ? 8 : f.rentalVacancyPct <= 9 ? 2 : -8
    ltrRows.push(row("Rental vacancy", `${f.rentalVacancyPct}%`, ok, f.rentalVacancyPct <= 5 ? "Units fill fast" : f.rentalVacancyPct <= 9 ? "Balanced" : "Soft — expect gaps"))
  }
  if (f?.grossYield != null) {
    const ok = f.grossYield >= 8 ? "good" : f.grossYield >= 5.5 ? "ok" : "bad"
    ltr += f.grossYield >= 8 ? 8 : f.grossYield >= 5.5 ? 2 : -6
    ltrRows.push(row("Gross yield", `${f.grossYield}%`, ok, "Annual rent ÷ price"))
  }
  if (f?.jobGrowthPct != null) {
    const ok = f.jobGrowthPct >= 1 ? "good" : f.jobGrowthPct > 0 ? "ok" : "bad"
    ltr += f.jobGrowthPct >= 1 ? 6 : f.jobGrowthPct > 0 ? 2 : -5
    ltrRows.push(row("Job growth (state, BLS)", `${f.jobGrowthPct > 0 ? "+" : ""}${f.jobGrowthPct}%`, ok, "Tenants follow paychecks"))
  }
  if (f?.renterSharePct != null) {
    const ok = f.renterSharePct >= 40 ? "good" : "ok"
    ltr += f.renterSharePct >= 40 ? 4 : 0
    ltrRows.push(row("Renter share", `${f.renterSharePct}%`, ok, f.renterSharePct >= 40 ? "Deep tenant pool" : "Owner-heavy — smaller pool"))
  }
  if (landlord) {
    const ok = landlord.grade <= "B" ? "good" : landlord.grade === "C" ? "ok" : "bad"
    ltr += landlord.grade === "A" ? 8 : landlord.grade === "B" ? 5 : landlord.grade === "C" ? 0 : -10
    ltrRows.push(row("Landlord law (state)", `${landlord.grade} · ~${landlord.evictionDays}d eviction${landlord.rentControl ? " · rent control" : ""}`, ok,
      landlord.grade <= "B" ? "Enforceable leases, quick remedies" : "Slow evictions raise real vacancy cost — screen hard"))
    if (landlord.grade === "F") ltrBreakers.push(`Tenant-heavy law in ${landlord.state} (~${landlord.evictionDays}-day evictions${landlord.rentControl ? ", rent control" : ""})`)
  }
  if (zhvi?.drawdown10y != null) {
    const ok = zhvi.drawdown10y <= 5 ? "good" : zhvi.drawdown10y <= 12 ? "ok" : "bad"
    ltr += zhvi.drawdown10y <= 5 ? 3 : zhvi.drawdown10y <= 12 ? 0 : -4
    ltrRows.push(row("Worst 10-yr drawdown", `−${zhvi.drawdown10y}%`, ok, "How hard this metro has fallen from a peak"))
  }
  const ltrScore = clamp(ltr)

  // ── MTR — furnished 1-6mo (travel nurses, corporate, displaced) ─────────────
  const mtrRows: ChecklistRow[] = []
  let mtr = 48
  const hc = f?.healthcareSharePct ?? null
  if (hc != null) {
    const ok = hc >= 14 ? "good" : hc >= 10 ? "ok" : "bad"
    mtr += hc >= 14 ? 14 : hc >= 10 ? 6 : -4
    mtrRows.push(row("Healthcare employment", `${hc}%`, ok, hc >= 14 ? "Hospital hub — steady travel-nurse demand" : hc >= 10 ? "Decent medical base" : "Thin medical demand"))
  } else mtrRows.push(na("Healthcare employment", "Not published for this place"))
  const col = f?.collegeSharePct ?? null
  if (col != null) {
    const ok = col >= 5 ? "good" : col >= 3 ? "ok" : "bad"
    mtr += col >= 5 ? 8 : col >= 3 ? 3 : 0
    mtrRows.push(row("College enrollment", `${col}% of residents`, ok, col >= 5 ? "University town — visiting staff/grad demand" : "Moderate student presence"))
  }
  const mtrBase = f?.rent2br ?? rent
  if (mtrBase && value) {
    const mtrRent = Math.round(mtrBase * 1.4)
    const mtrCap = Math.round(((mtrRent * 12 * 0.6) / value) * 1000) / 10
    const ok = mtrCap >= 7 ? "good" : mtrCap >= 5 ? "ok" : "bad"
    mtr += mtrCap >= 7 ? 12 : mtrCap >= 5 ? 5 : -5
    mtrRows.push(row("Furnished economics", `~${money(mtrRent)}/mo · ${mtrCap}% cap (est)`, ok, `1.4× the ${f?.rent2br ? "2-bed" : "metro"} rent, 60% margin after furnishing/utilities`))
  }
  if (f?.jobGrowthPct != null) {
    const ok = f.jobGrowthPct >= 1 ? "good" : f.jobGrowthPct > 0 ? "ok" : "bad"
    mtr += f.jobGrowthPct >= 1 ? 8 : f.jobGrowthPct > 0 ? 3 : -4
    mtrRows.push(row("Job growth", `${f.jobGrowthPct > 0 ? "+" : ""}${f.jobGrowthPct}%`, ok, "Corporate relocations feed 1-6 month stays"))
  }
  if (f?.inboundMigrationPct != null) {
    const ok = f.inboundMigrationPct >= 2.5 ? "good" : "ok"
    mtr += f.inboundMigrationPct >= 2.5 ? 5 : 0
    mtrRows.push(row("People moving in (1yr)", `${f.inboundMigrationPct}%`, ok, "Movers rent furnished first"))
  }
  const mtrScore = clamp(mtr)

  // ── STR — nightly (Airbnb-style). Regulation first: it's the kill switch. ──
  const strRows: ChecklistRow[] = []
  const strBreakers: string[] = []
  let strS = 45
  if (strRule) {
    const ok = strRule.status === "friendly" ? "good" : strRule.status === "permit" ? "ok" : "bad"
    strS += strRule.status === "friendly" ? 16 : strRule.status === "permit" ? 8 : strRule.status === "restricted" ? -12 : -35
    strRows.push(row("STR legality (city)", strRule.status.toUpperCase(), ok, `${strRule.note} — verify the current ordinance before buying`))
    if (strRule.status === "banned") strBreakers.push("New STR permits banned here")
    if (strRule.status === "restricted") strBreakers.push("STRs restricted — confirm your exact address/zone is eligible")
  } else strRows.push(na("STR legality", "Not in our curated table — check the city ordinance"))
  const seasonal = f?.seasonalSharePct ?? null
  if (seasonal != null) {
    const ok = seasonal >= 3 ? "good" : seasonal >= 1 ? "ok" : "bad"
    strS += seasonal >= 3 ? 12 : seasonal >= 1 ? 4 : -4
    strRows.push(row("Vacation-home share", `${seasonal}%`, ok, seasonal >= 3 ? "Proven getaway market — people already own vacation homes here" : seasonal >= 1 ? "Some leisure demand" : "Not a vacation market — STR demand is business/event-driven"))
  }
  if (rent && value) {
    const strNet = Math.round(rent * 2.4 * 0.55)
    const strCap = Math.round(((strNet * 12 * 0.7) / value) * 1000) / 10
    const ok = strCap >= 8 ? "good" : strCap >= 5.5 ? "ok" : "bad"
    strS += strCap >= 8 ? 10 : strCap >= 5.5 ? 4 : -4
    strRows.push(row("Modeled STR economics", `~${money(strNet)}/mo net · ${strCap}% cap (est)`, ok, "2.4× rent at ~55% occupancy — MODELED; underwrite with real comps (AirDNA) before buying"))
  }
  if (f?.inboundMigrationPct != null) {
    const ok = f.inboundMigrationPct >= 3 ? "good" : f.inboundMigrationPct >= 1.5 ? "ok" : "bad"
    strS += f.inboundMigrationPct >= 3 ? 6 : f.inboundMigrationPct >= 1.5 ? 3 : 0
    strRows.push(row("Visitor/relocation pull", `${f.inboundMigrationPct}% moved in`, ok, "Inbound movement correlates with friends-and-family + scouting stays"))
  }
  if (zhvi?.yoy != null) {
    const ok = zhvi.yoy >= 3 ? "good" : zhvi.yoy >= 0 ? "ok" : "bad"
    strS += zhvi.yoy >= 3 ? 4 : zhvi.yoy >= 0 ? 0 : -4
    strRows.push(row("Price trend (12mo)", `${zhvi.yoy > 0 ? "+" : ""}${zhvi.yoy}%`, ok, "STRs are equity plays too — a falling market compounds a bad season"))
  }
  const strScore = clamp(strS)

  const ranked: Array<[string, number]> = [["Long-term rentals", ltrScore], ["Mid-term rentals", mtrScore], ["Short-term rentals", strScore]]
  ranked.sort((a, b) => b[1] - a[1])
  const best = ranked[0]
  const verdict = `${best[0]} (${grade(best[1])} ${best[1]}) is the strongest rental play here${strBreakers.length && best[0] !== "Short-term rentals" ? " — STR has dealbreakers" : ""}${cashflowGap != null && cashflowGap >= 0 ? "; the median house cash-flows at today's rate, which is rare" : ""}.`

  return {
    metro: zhvi?.name ?? zori?.name ?? null,
    rentYoY: zori?.yoy ?? null,
    rent3yrAnnual: zori?.y3Annual ?? null,
    zoriRent: zori?.last != null ? Math.round(zori.last) : null,
    priceYoY: zhvi?.yoy ?? null,
    priceMomentum: zhvi?.m3Annualized ?? null,
    zhviValue: zhvi?.last != null ? Math.round(zhvi.last) : null,
    drawdown10y: zhvi?.drawdown10y ?? null,
    mortgageRate: rate,
    monthlyPayment,
    cashflowGap,
    landlord,
    strRule,
    ltr: { score: ltrScore, grade: grade(ltrScore), roi: cashflowGap != null ? `${cashflowGap >= 0 ? "+" : ""}${money(cashflowGap)}/mo on the median door` : "—", checklist: ltrRows, dealbreakers: ltrBreakers, estimated: false },
    mtr: { score: mtrScore, grade: grade(mtrScore), roi: mtrBase ? `~${money(Math.round(mtrBase * 1.4))}/mo furnished` : "—", checklist: mtrRows, dealbreakers: [], estimated: true },
    str: { score: strScore, grade: grade(strScore), roi: rent ? `~${money(Math.round(rent * 2.4 * 0.55))}/mo net (modeled)` : "—", checklist: strRows, dealbreakers: strBreakers, estimated: true },
    bestRental: best[0],
    verdict,
  }
}
