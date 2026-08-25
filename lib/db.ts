// Supabase REST-based database client — works on Vercel (IPv4 port 443).
// Direct PostgreSQL is IPv6-only on free Supabase tier and unreachable from Vercel serverless.

import { getAdminClient } from "@/lib/supabase/admin"

// Internal helper — uses any to avoid Supabase SDK's overly strict never[] types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sb(): any { return getAdminClient() }

type W = Record<string, unknown>

// Prisma callers pass Date objects; supabase-js can't serialize them (the
// request fails with an empty-message error) — always convert to ISO strings.
const ser = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v)

function applyFilters(q: unknown, where: W): unknown {
  let r: unknown = q
  for (const [key, value] of Object.entries(where)) {
    if (value === null || value === undefined) {
      r = (r as { is: (k: string, v: null) => unknown }).is(key, null)
    } else if (Array.isArray(value)) {
      r = (r as { in: (k: string, v: unknown[]) => unknown }).in(key, value.map(ser))
    } else if (typeof value === "object" && !(value instanceof Date) && value !== null) {
      const sub = value as W
      // `{ not: null }` means IS NOT NULL. PostgREST's neq.null matches
      // NOTHING — SQL comparisons against NULL are never true — so routing it
      // through neq silently emptied every "field is not null" query
      // (top-picks, every screen, the markets list). Must use not.is.null.
      if ("not" in sub) {
        r = sub.not === null
          ? (r as { not: (k: string, op: string, v: unknown) => unknown }).not(key, "is", null)
          : (r as { neq: (k: string, v: unknown) => unknown }).neq(key, ser(sub.not))
      }
      else if ("in" in sub) r = (r as { in: (k: string, v: unknown[]) => unknown }).in(key, (sub.in as unknown[]).map(ser))
      else if ("gt" in sub) r = (r as { gt: (k: string, v: unknown) => unknown }).gt(key, ser(sub.gt))
      else if ("lt" in sub) r = (r as { lt: (k: string, v: unknown) => unknown }).lt(key, ser(sub.lt))
      else if ("gte" in sub) r = (r as { gte: (k: string, v: unknown) => unknown }).gte(key, ser(sub.gte))
      else if ("lte" in sub) r = (r as { lte: (k: string, v: unknown) => unknown }).lte(key, ser(sub.lte))
      else if ("contains" in sub) r = (r as { ilike: (k: string, v: string) => unknown }).ilike(key, `%${sub.contains}%`)
    } else {
      r = (r as { eq: (k: string, v: unknown) => unknown }).eq(key, ser(value))
    }
  }
  return r
}

async function exec<T>(q: unknown): Promise<{ data: T; error: unknown }> {
  return q as Promise<{ data: T; error: unknown }>
}

// PostgREST caches the schema and refuses any write containing a column it
// doesn't recognize (PGRST204) — errors the whole row rather than dropping
// the one unknown field. That's correct for a typo, but it means an app
// deploy and a database migration can never land in the same instant: code
// referencing a new column and a database that doesn't have it yet is a
// normal, transient state during every schema change, not a bug — and today
// it hard-fails every write until the two happen to line up.
//
// This makes that transient state survivable: on a "column not found" error,
// strip exactly that field and retry. The row still saves with everything
// the schema currently supports; the new field starts persisting on its own
// the moment the column exists, with no redeploy required.
const MISSING_COLUMN = /Could not find the '([^']+)' column/

// Exported for unit testing without a live Supabase connection.
export function isMissingColumnError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null
  const e = error as { code?: string; message?: string }
  if (e.code !== "PGRST204") return null
  const m = typeof e.message === "string" ? e.message.match(MISSING_COLUMN) : null
  return m ? m[1] : null
}

export async function execDroppingMissingColumns<T>(
  build: (data: W) => unknown,
  data: W
): Promise<{ data: T; error: unknown }> {
  const payload = { ...data }
  // Bounded by the field count: each failed attempt removes exactly one key,
  // so this can never loop more than the payload has fields to strip.
  for (let i = 0; i <= Object.keys(payload).length; i++) {
    const result = await exec<T>(build(payload))
    const missing = isMissingColumnError(result.error)
    if (!missing || !(missing in payload)) return result
    delete payload[missing]
  }
  return exec<T>(build(payload))
}

function model(tableName: string) {
  return {
    async findFirst(args: { where?: W; orderBy?: W | W[]; select?: W; include?: W } = {}) {
      let q = sb().from(tableName).select("*")
      if (args.where) q = applyFilters(q, args.where)
      q = q.limit(1)
      const { data, error } = await exec<unknown[]>(q)
      if (error) throw error
      return (data ?? [])[0] ?? null
    },

    async findUnique(args: { where: W; select?: W; include?: W }) {
      return this.findFirst(args)
    },

    async findMany(args: { where?: W; orderBy?: W | W[]; take?: number; skip?: number; select?: W; include?: W } = {}) {
      let q = sb().from(tableName).select("*")
      if (args.where) q = applyFilters(q, args.where)
      if (args.take) q = q.limit(args.take)
      if (args.skip && args.take) q = q.range(args.skip, args.skip + args.take - 1)
      if (args.orderBy) {
        const ob = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy
        const [[col, dir]] = Object.entries(ob ?? {})
        if (col) q = q.order(col, { ascending: dir === "asc" })
      }
      const { data, error } = await exec<unknown[]>(q)
      if (error) throw error
      return data ?? []
    },

    async count(args: { where?: W } = {}) {
      let q = sb().from(tableName).select("*", { count: "exact", head: true })
      if (args.where) q = applyFilters(q, args.where)
      const { count, error } = await exec<never>(q) as unknown as { count: number; error: unknown }
      if (error) throw error
      return count ?? 0
    },

    async create(args: { data: W; select?: W }) {
      const { data, error } = await execDroppingMissingColumns<unknown>(
        d => sb().from(tableName).insert(d).select().single(),
        args.data
      )
      if (error) throw error
      return data
    },

    async createMany(args: { data: W[] }) {
      const { error } = await exec<unknown>(sb().from(tableName).insert(args.data))
      if (error) throw error
      return { count: args.data.length }
    },

    async update(args: { where: W; data: W; select?: W }) {
      const { data, error } = await execDroppingMissingColumns<unknown[]>(
        d => {
          let q = sb().from(tableName).update(d)
          q = applyFilters(q, args.where)
          return q.select()
        },
        args.data
      )
      if (error) throw error
      return (data ?? [])[0] ?? null
    },

    async updateMany(args: { where?: W; data: W }) {
      let q = sb().from(tableName).update(args.data)
      if (args.where) q = applyFilters(q, args.where)
      q = q.select("id")
      const { data, error } = await exec<unknown[]>(q)
      if (error) throw error
      return { count: (data ?? []).length }
    },

    async upsert(args: { where: W; create: W; update: W }) {
      const existing = await this.findFirst({ where: args.where })
      if (existing) return this.update({ where: args.where, data: { ...args.update, updatedAt: new Date().toISOString() } })
      return this.create({ data: { ...args.create, createdAt: new Date().toISOString() } })
    },

    async delete(args: { where: W }) {
      let q = sb().from(tableName).delete()
      q = applyFilters(q, args.where)
      const { error } = await exec<unknown>(q)
      if (error) throw error
      return {}
    },

    async deleteMany(args: { where?: W } = {}) {
      let q = sb().from(tableName).delete()
      if (args.where) q = applyFilters(q, args.where)
      q = q.select("id")
      const { data, error } = await exec<unknown[]>(q)
      if (error) throw error
      return { count: (data ?? []).length }
    },

    async groupBy(args: { by: string[]; _count: boolean; where?: W }) {
      let q = sb().from(tableName).select(args.by.join(","))
      if (args.where) q = applyFilters(q, args.where)
      const { data, error } = await exec<W[]>(q)
      if (error) throw error
      const groups: Record<string, number> = {}
      for (const row of (data ?? [])) {
        const key = args.by.map(k => String(row[k])).join("|")
        groups[key] = (groups[key] ?? 0) + 1
      }
      return Object.entries(groups).map(([key, _count]) => {
        const vals = key.split("|")
        const result: W = { _count }
        args.by.forEach((k, i) => { result[k] = vals[i] })
        return result
      })
    },
  }
}

export const db = {
  user:             model("User"),
  business:         model("Business"),
  connectedAccount: model("ConnectedAccount"),
  agentRun:         model("AgentRun"),
  site:             model("Site"),
  content:          model("Content"),
  review:           model("Review"),
  lead:             model("Lead"),
  report:           model("Report"),
  conversation:     model("Conversation"),
  message:          model("Message"),
  agentMemory:      model("AgentMemory"),
  fewShotExample:   model("FewShotExample"),
  customTool:       model("CustomTool"),
  scheduledRun:     model("ScheduledRun"),
  rawSignal:        model("RawSignal"),
  source:           model("Source"),
  propertyIndex:    model("PropertyIndex"),
  brandProfile:     model("BrandProfile"),
  contentExemplar:  model("ContentExemplar"),
  contentIdea:      model("ContentIdea"),
  contentExpansion: model("ContentExpansion"),
  trendSignal:      model("TrendSignal"),
  contentOutcome:   model("ContentOutcome"),
  scoreCalibration: model("ScoreCalibration"),
  financeAccount:   model("FinanceAccount"),
  financeTxn:       model("FinanceTxn"),
  financeRule:      model("FinanceRule"),
  ticker:           model("Ticker"),
  tickerSignal:     model("TickerSignal"),
  cryptoAsset:      model("CryptoAsset"),
  cryptoSignal:     model("CryptoSignal"),
  discoveryEvent:   model("DiscoveryEvent"),
  scoreSnapshot:    model("ScoreSnapshot"),
  exchangeRequest:  model("ExchangeRequest"),
  entity:           model("Entity"),
  entityAlias:      model("EntityAlias"),
  entityProperty:   model("EntityProperty"),
  underwriteCall:   model("UnderwriteCall"),
  siteBuild:        model("SiteBuild"),

  // Prisma transaction compatibility — runs promises sequentially
  $transaction: async (fns: unknown[]) => {
    const results = []
    for (const fn of fns) results.push(await fn)
    return results
  },
}
