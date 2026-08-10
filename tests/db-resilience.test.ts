// The schema-drift resilience layer in lib/db.ts — verified against the
// real PGRST204 error shape (confirmed live against Supabase during
// development: {code:"PGRST204", message:"Could not find the 'x' column of
// 'y' in the schema cache"}), but tested here with a mocked exec so it never
// touches the network. This exists specifically because a code deploy and a
// database migration landing at different times is normal, not a bug, and
// it must never take down the scoring pipeline.
import { describe, it, expect, vi } from "vitest"
import { isMissingColumnError, execDroppingMissingColumns } from "@/lib/db"

function pgrst204(column: string) {
  return { code: "PGRST204", message: `Could not find the '${column}' column of 'Ticker' in the schema cache` }
}

describe("isMissingColumnError", () => {
  it("extracts the column name from a real PGRST204 error", () => {
    expect(isMissingColumnError(pgrst204("falsificationConditions"))).toBe("falsificationConditions")
  })

  it("returns null for an unrelated error code", () => {
    expect(isMissingColumnError({ code: "23505", message: "duplicate key value" })).toBeNull()
  })

  it("returns null for a PGRST204 whose message doesn't match the expected shape", () => {
    expect(isMissingColumnError({ code: "PGRST204", message: "some other schema cache issue" })).toBeNull()
  })

  it("returns null for null/non-object input", () => {
    expect(isMissingColumnError(null)).toBeNull()
    expect(isMissingColumnError(undefined)).toBeNull()
  })
})

describe("execDroppingMissingColumns", () => {
  it("passes through cleanly when nothing is missing", async () => {
    const build = vi.fn().mockResolvedValue({ data: { qualityScore: 70 }, error: null })
    const result = await execDroppingMissingColumns(build, { qualityScore: 70 })
    expect(result.error).toBeNull()
    expect(build).toHaveBeenCalledTimes(1)
  })

  it("strips exactly one missing column and retries, eventually succeeding", async () => {
    let call = 0
    const build = vi.fn().mockImplementation((d: Record<string, unknown>) => {
      call++
      if ("badField" in d) return Promise.resolve({ data: null, error: pgrst204("badField") })
      return Promise.resolve({ data: { qualityScore: d.qualityScore }, error: null })
    })
    const result = await execDroppingMissingColumns<{ qualityScore: number }>(build, { qualityScore: 70, badField: "x" })
    expect(result.error).toBeNull()
    expect(result.data?.qualityScore).toBe(70)
    expect(call).toBe(2) // one failed attempt, one successful retry
  })

  it("strips multiple missing columns across successive retries", async () => {
    const build = vi.fn().mockImplementation((d: Record<string, unknown>) => {
      if ("badOne" in d) return Promise.resolve({ data: null, error: pgrst204("badOne") })
      if ("badTwo" in d) return Promise.resolve({ data: null, error: pgrst204("badTwo") })
      return Promise.resolve({ data: { ok: true }, error: null })
    })
    const result = await execDroppingMissingColumns(build, { real: 1, badOne: "x", badTwo: "y" })
    expect(result.error).toBeNull()
    expect(build).toHaveBeenCalledTimes(3)
  })

  it("does not loop forever or strip fields for a non-schema error", async () => {
    const build = vi.fn().mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } })
    const result = await execDroppingMissingColumns(build, { qualityScore: 70 })
    expect(result.error).toEqual({ code: "23505", message: "duplicate key" })
    expect(build).toHaveBeenCalledTimes(1) // no retry for a non-column error
  })

  it("gives up cleanly if the missing column reported isn't actually in the payload", async () => {
    const build = vi.fn().mockResolvedValue({ data: null, error: pgrst204("someUnrelatedField") })
    const result = await execDroppingMissingColumns(build, { qualityScore: 70 })
    expect(result.error).not.toBeNull()
    expect(build).toHaveBeenCalledTimes(1)
  })
})
