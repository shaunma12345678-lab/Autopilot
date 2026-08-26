// Bounded concurrency for section generation.
//
// Order is load-bearing: lib/agents/website-agent.ts assembles the page by
// joining results in array order, so a helper that returned completions in
// finish-order rather than input-order would produce a site with its footer
// above its hero. These tests pin that down.
import { describe, it, expect } from "vitest"
import { withConcurrency } from "@/lib/agents/website-agent"

const tick = (ms: number) => new Promise(r => setTimeout(r, ms))

describe("withConcurrency", () => {
  it("returns results in INPUT order, not completion order", async () => {
    const items = ["nav", "hero", "services", "footer"]
    // Deliberately inverted timing: the last item finishes first.
    const delays: Record<string, number> = { nav: 40, hero: 30, services: 20, footer: 1 }
    const out = await withConcurrency(items, 4, async (item) => {
      await tick(delays[item])
      return item.toUpperCase()
    })
    expect(out).toEqual(["NAV", "HERO", "SERVICES", "FOOTER"])
  })

  it("passes the correct index alongside each item", async () => {
    const seen: Array<[string, number]> = []
    await withConcurrency(["a", "b", "c"], 2, async (item, i) => {
      seen.push([item, i])
      return item
    })
    expect(seen.sort((x, y) => x[1] - y[1])).toEqual([["a", 0], ["b", 1], ["c", 2]])
  })

  it("never exceeds the concurrency limit", async () => {
    let active = 0
    let peak = 0
    await withConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      active++
      peak = Math.max(peak, active)
      await tick(5)
      active--
      return null
    })
    expect(peak).toBeLessThanOrEqual(4)
  })

  it("actually runs in parallel rather than serially", async () => {
    const started = Date.now()
    await withConcurrency(Array.from({ length: 8 }, (_, i) => i), 4, async () => {
      await tick(25)
      return null
    })
    // Serial would be ~200ms; two batches of four is ~50ms. The generous
    // ceiling keeps this from flaking on a loaded CI machine.
    expect(Date.now() - started).toBeLessThan(150)
  })

  it("handles an empty list without hanging", async () => {
    expect(await withConcurrency([], 4, async () => "x")).toEqual([])
  })

  it("handles a list shorter than the concurrency limit", async () => {
    expect(await withConcurrency(["only"], 8, async (i) => i)).toEqual(["only"])
  })

  it("propagates a rejection so the caller can fall back", async () => {
    // generateWebsite relies on this: a thrown error triggers the single-call
    // fallback rather than silently assembling a broken page.
    await expect(
      withConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("section failed")
        return n
      })
    ).rejects.toThrow("section failed")
  })
})
