// User-defined screens over the full analysis dataset.
//
// WHY THIS IS SOMETHING THE COMPETITION STRUCTURALLY CANNOT OFFER. Tools like
// Composer let users compose rules over PRICE data, because price is all they
// hold. Every filterable field below comes from a filing, a regulator or a
// chain: Piotroski F-Score, Altman zone, Beneish flag, Benford conformity,
// going-concern hits, restatements, short-interest trend, federal contract
// value, valuation percentile against a company's own history. A screen over
// those asks a different class of question than any moving-average rule can.
//
// SAFETY: the field list is an ALLOWLIST, not a passthrough. A user-supplied
// field name is never interpolated into a query — it is looked up in FIELDS and
// rejected if absent. Same for operators. This is a filter language, not a query
// language, and it cannot be made to read a column that is not listed here.
//
// EVALUATION IS IN MEMORY, ON PURPOSE. The dataset is a few thousand rows and
// the shim speaks PostgREST, whose filter syntax cannot express several of the
// comparisons that matter. Reading the rows once and filtering in TypeScript is
// both simpler and more honest than half-translating a filter language into a
// REST query and silently dropping the parts that do not fit.
import { prisma } from "@/lib/prisma"

export type FieldType = "number" | "boolean" | "string"

export interface FieldDef {
  type: FieldType
  label: string
  /** What it means, shown in the UI so a user is never filtering blind. */
  help: string
  /** For numbers, whether higher is generally better. Drives sort defaults. */
  higherIsBetter?: boolean
}

export const FIELDS: Record<string, FieldDef> = {
  // ── Valuation — the axis with measured forward-return signal ─────────────
  valuationScore: { type: "number", label: "Valuation score", help: "0-100, higher means cheaper versus the company's OWN history. The only axis this system has measured real forward-return signal in.", higherIsBetter: true },
  valuationPercentile: { type: "number", label: "Cheapness percentile", help: "Share of its own trading history it has been more expensive than.", higherIsBetter: true },
  fcfYieldPct: { type: "number", label: "FCF yield %", help: "Free cash flow as a percentage of market value. Harder to manage than earnings.", higherIsBetter: true },

  // ── Quality and validated composites ─────────────────────────────────────
  qualityScore: { type: "number", label: "Quality score", help: "0-100 fundamental strength. Sound for gating, but measured NO forward-return edge on its own.", higherIsBetter: true },
  riskScore: { type: "number", label: "Risk score", help: "0-100, higher means more risk. Scored separately from quality and never blended into it.", higherIsBetter: false },
  piotroskiScore: { type: "number", label: "Piotroski F-Score", help: "0-9 across nine financial-health tests. Published, peer-reviewed, independently replicated.", higherIsBetter: true },
  altmanZone: { type: "string", label: "Altman zone", help: "safe | grey | distress — bankruptcy distance. Not meaningful for banks and insurers.", },
  beneishFlag: { type: "boolean", label: "Beneish manipulation flag", help: "True when the M-Score exceeds -1.78, a statistically elevated likelihood of earnings manipulation." },
  benfordConformity: { type: "string", label: "Benford conformity", help: "close | acceptable | marginal | nonconforming. Deviation is a prompt to read carefully, never evidence of fraud." },

  // ── Hard facts ───────────────────────────────────────────────────────────
  goingConcernHits: { type: "number", label: "Going-concern mentions", help: "Auditor doubt about the ability to continue operating. The most serious warning a filing carries.", higherIsBetter: false },
  hasRestatement: { type: "boolean", label: "Has restatement", help: "Filed an 8-K item 4.02 — previously issued financials can no longer be relied upon." },
  newRiskCount: { type: "number", label: "Newly disclosed risks", help: "Risk-factor passages present this year and absent last year.", higherIsBetter: false },

  // ── Independent, non-company sources ─────────────────────────────────────
  shortTrend: { type: "string", label: "Short interest trend", help: "building | covering | stable, from FINRA. What informed money is betting against." },
  shortDaysToCover: { type: "number", label: "Days to cover", help: "Days of average volume for shorts to exit. High means a crowded exit, not a direction.", higherIsBetter: false },
  federalContractValueUsd: { type: "number", label: "Federal contract value", help: "Lifetime value of active federal contracts, recorded by the paying agency. Contract scale, NOT annual revenue.", higherIsBetter: true },

  // ── Size, sector, confidence ─────────────────────────────────────────────
  revenueTtm: { type: "number", label: "Revenue (TTM)", help: "Trailing twelve-month revenue.", higherIsBetter: true },
  sector: { type: "string", label: "Sector", help: "Industry classification from SEC submissions." },
  exchange: { type: "string", label: "Exchange", help: "Nasdaq, NYSE or CBOE. OTC is excluded from the tracked universe." },
  dataConfidence: { type: "string", label: "Data confidence", help: "insufficient | low | medium | high. Below medium a company is never ranked." },
}

export type Operator = "gte" | "lte" | "gt" | "lt" | "eq" | "neq" | "in" | "notIn"

const NUMERIC_OPS: Operator[] = ["gte", "lte", "gt", "lt", "eq", "neq"]
const STRING_OPS: Operator[] = ["eq", "neq", "in", "notIn"]
const BOOLEAN_OPS: Operator[] = ["eq", "neq"]

export interface Filter {
  field: string
  op: Operator
  value: number | string | boolean | Array<string | number>
}

export interface ScreenSpec {
  filters: Filter[]
  sortBy?: string
  sortDir?: "asc" | "desc"
  limit?: number
}

export interface ValidationError { filter: number; message: string }

export function validateSpec(spec: ScreenSpec): ValidationError[] {
  const errors: ValidationError[] = []
  if (!Array.isArray(spec.filters)) return [{ filter: -1, message: "filters must be an array" }]

  spec.filters.forEach((f, i) => {
    const def = FIELDS[f.field]
    if (!def) {
      errors.push({ filter: i, message: `Unknown field "${f.field}". Screens can only filter on published fields.` })
      return
    }
    const allowed = def.type === "number" ? NUMERIC_OPS : def.type === "boolean" ? BOOLEAN_OPS : STRING_OPS
    if (!allowed.includes(f.op)) {
      errors.push({ filter: i, message: `Operator "${f.op}" is not valid for ${def.type} field "${f.field}".` })
      return
    }
    if ((f.op === "in" || f.op === "notIn") && !Array.isArray(f.value)) {
      errors.push({ filter: i, message: `Operator "${f.op}" requires an array value.` })
    }
    if (def.type === "number" && NUMERIC_OPS.includes(f.op) && typeof f.value !== "number") {
      errors.push({ filter: i, message: `Field "${f.field}" is numeric — value must be a number.` })
    }
  })

  if (spec.sortBy && !FIELDS[spec.sortBy]) {
    errors.push({ filter: -1, message: `Cannot sort by unknown field "${spec.sortBy}".` })
  }
  return errors
}

type Row = Record<string, unknown>

function matches(row: Row, f: Filter): boolean {
  const v = row[f.field]
  // A null is not a zero and not a false. A company that has not been analysed
  // for a field must never satisfy a threshold on it by accident — that is how
  // a screen quietly fills up with unanalysed companies.
  if (v === null || v === undefined) return false

  switch (f.op) {
    case "gte": return typeof v === "number" && v >= (f.value as number)
    case "lte": return typeof v === "number" && v <= (f.value as number)
    case "gt":  return typeof v === "number" && v > (f.value as number)
    case "lt":  return typeof v === "number" && v < (f.value as number)
    case "eq":  return v === f.value
    case "neq": return v !== f.value
    case "in":  return Array.isArray(f.value) && (f.value as Array<unknown>).includes(v)
    case "notIn": return Array.isArray(f.value) && !(f.value as Array<unknown>).includes(v)
    default: return false
  }
}

export interface ScreenResult {
  rows: Array<Record<string, unknown>>
  matched: number
  scanned: number
  /** Which filter removed how many — so an empty result explains itself. */
  eliminatedBy: Record<string, number>
}

export async function runScreen(spec: ScreenSpec): Promise<ScreenResult> {
  const limit = Math.min(spec.limit ?? 50, 200)

  // Paginated: PostgREST silently caps unbounded selects at 1,000 rows, which
  // would screen a fraction of the universe and report the result as complete.
  const all: Row[] = []
  const PAGE = 1000
  for (let skip = 0; skip < 20000; skip += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (prisma.ticker as any).findMany({ take: PAGE, skip }) as Row[]
    all.push(...page)
    if (page.length < PAGE) break
  }

  const eliminatedBy: Record<string, number> = {}
  const survivors = all.filter(row => {
    for (const f of spec.filters) {
      if (!matches(row, f)) {
        const key = `${f.field} ${f.op} ${JSON.stringify(f.value)}`
        eliminatedBy[key] = (eliminatedBy[key] ?? 0) + 1
        return false
      }
    }
    return true
  })

  const sortBy = spec.sortBy ?? "valuationScore"
  const dir = spec.sortDir ?? (FIELDS[sortBy]?.higherIsBetter === false ? "asc" : "desc")
  survivors.sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy]
    if (typeof av !== "number" || typeof bv !== "number") return 0
    return dir === "desc" ? bv - av : av - bv
  })

  return { rows: survivors.slice(0, limit), matched: survivors.length, scanned: all.length, eliminatedBy }
}
