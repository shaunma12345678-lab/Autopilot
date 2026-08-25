// Render verification — the scoring and instrumentation contract.
//
// These are pure-function tests: no browser, no network. The harness itself
// runs in the preview iframe, but everything that DECIDES anything from its
// output lives here and is directly testable.
import { describe, it, expect } from "vitest"
import {
  instrumentHtml, evaluateRender, parseObservations, buildRepairBrief,
  type RenderObservations,
} from "@/lib/agents/site-verifier"

// A page that rendered cleanly. Individual tests override one field to
// isolate the effect of exactly one failure.
function cleanObservations(overrides: Partial<RenderObservations> = {}): RenderObservations {
  return {
    jsErrors: [], unhandledRejections: [], failedResources: [],
    webglRequested: true, webglFailed: false,
    brokenImages: 0, totalImages: 4, imagesMissingAlt: 0,
    mobileOverflowPx: 0, emptySections: [], sectionCount: 9,
    missingGlobals: [], bodyTextLength: 3200, documentHeight: 7400,
    ...overrides,
  }
}

describe("instrumentHtml", () => {
  it("puts the error trap before the page's own scripts", () => {
    const html = `<!DOCTYPE html><html><head><script src="https://cdn/gsap.js"></script></head><body><h1>Hi</h1></body></html>`
    const out = instrumentHtml(html)
    expect(out.indexOf("__siteVerify")).toBeLessThan(out.indexOf("cdn/gsap.js"))
  })

  it("injects the measurement pass before </body>", () => {
    const html = `<!DOCTYPE html><html><head></head><body><h1>Hi</h1></body></html>`
    const out = instrumentHtml(html)
    expect(out).toContain("__siteVerifyResult")
    expect(out.indexOf("__siteVerifyResult")).toBeLessThan(out.indexOf("</body>"))
  })

  it("still instruments a fragment with no head or body tags", () => {
    const out = instrumentHtml(`<div>bare fragment</div>`)
    expect(out).toContain("__siteVerify")
    expect(out).toContain("__siteVerifyResult")
  })

  it("leaves the original markup intact", () => {
    const html = `<!DOCTYPE html><html><head></head><body><h1 class="hero-headline">Acme Roofing</h1></body></html>`
    expect(instrumentHtml(html)).toContain(`<h1 class="hero-headline">Acme Roofing</h1>`)
  })
})

describe("evaluateRender — a clean page", () => {
  it("scores 10 and passes when nothing failed", () => {
    const r = evaluateRender(cleanObservations())
    expect(r.issues).toHaveLength(0)
    expect(r.score).toBe(10)
    expect(r.passed).toBe(true)
  })
})

describe("evaluateRender — fatal failures", () => {
  it("catches a JS error, which keyword scoring cannot see at all", () => {
    const r = evaluateRender(cleanObservations({ jsErrors: ["Unexpected token '}' (line 412)"] }))
    expect(r.issues.some(i => i.code === "js_error" && i.severity === "fatal")).toBe(true)
    expect(r.passed).toBe(false)
    expect(r.score).toBeLessThan(10)
  })

  it("catches a CDN library that never loaded — the page looks static, not broken", () => {
    const r = evaluateRender(cleanObservations({ missingGlobals: ["gsap", "ScrollTrigger"] }))
    expect(r.issues.filter(i => i.code === "missing_global")).toHaveLength(2)
    expect(r.passed).toBe(false)
  })

  it("catches a page that renders effectively blank", () => {
    const r = evaluateRender(cleanObservations({ bodyTextLength: 20, documentHeight: 300 }))
    expect(r.issues.some(i => i.code === "blank_page")).toBe(true)
    expect(r.issues.some(i => i.code === "no_content")).toBe(true)
    // Two fatal issues → 10 - (2 × 4). The exact floor is covered separately;
    // what matters here is that a blank page lands far below any passing site.
    expect(r.score).toBeLessThanOrEqual(2)
    expect(r.passed).toBe(false)
  })
})

describe("evaluateRender — major failures", () => {
  it("flags mobile horizontal overflow", () => {
    const r = evaluateRender(cleanObservations({ mobileOverflowPx: 140 }))
    expect(r.issues.some(i => i.code === "mobile_overflow")).toBe(true)
    expect(r.passed).toBe(false) // sideways scroll on a phone is a real failure
  })

  it("ignores sub-pixel overflow as a layout rounding artifact", () => {
    const r = evaluateRender(cleanObservations({ mobileOverflowPx: 3 }))
    expect(r.issues.some(i => i.code === "mobile_overflow")).toBe(false)
    expect(r.passed).toBe(true)
  })

  it("flags a failed WebGL context only when the page actually asked for one", () => {
    const asked = evaluateRender(cleanObservations({ webglRequested: true, webglFailed: true }))
    expect(asked.issues.some(i => i.code === "webgl_failed")).toBe(true)

    const neverAsked = evaluateRender(cleanObservations({ webglRequested: false, webglFailed: false }))
    expect(neverAsked.issues.some(i => i.code === "webgl_failed")).toBe(false)
  })

  it("flags sections that exist in markup but rendered at zero height", () => {
    const r = evaluateRender(cleanObservations({ emptySections: ["testimonials", "pricing"] }))
    expect(r.issues.some(i => i.code === "empty_sections")).toBe(true)
  })
})

describe("evaluateRender — minor issues don't fail a build", () => {
  it("reports missing alt text but still passes", () => {
    const r = evaluateRender(cleanObservations({ imagesMissingAlt: 3 }))
    expect(r.issues.some(i => i.code === "missing_alt" && i.severity === "minor")).toBe(true)
    expect(r.passed).toBe(true)
    expect(r.score).toBeLessThan(10)
    expect(r.score).toBeGreaterThan(8)
  })
})

describe("evaluateRender — severity is weighted, not counted", () => {
  it("scores a fatal failure well below a minor one", () => {
    const fatal = evaluateRender(cleanObservations({ jsErrors: ["boom"] }))
    const minor = evaluateRender(cleanObservations({ imagesMissingAlt: 1 }))
    expect(fatal.score).toBeLessThan(minor.score - 2)
  })

  it("never returns a negative score", () => {
    const r = evaluateRender(cleanObservations({
      jsErrors: ["a", "b", "c", "d"], missingGlobals: ["gsap", "THREE"],
      bodyTextLength: 0, documentHeight: 0, mobileOverflowPx: 900,
    }))
    expect(r.score).toBe(0)
  })
})

describe("buildRepairBrief", () => {
  it("returns null when only minor issues exist — not worth regenerating a page", () => {
    const r = evaluateRender(cleanObservations({ imagesMissingAlt: 2 }))
    expect(buildRepairBrief(r)).toBeNull()
  })

  it("returns null for a clean page", () => {
    expect(buildRepairBrief(evaluateRender(cleanObservations()))).toBeNull()
  })

  it("describes the observed failures and forbids redesigning", () => {
    const r = evaluateRender(cleanObservations({ jsErrors: ["ReferenceError: gsap is not defined"] }))
    const brief = buildRepairBrief(r)
    expect(brief).toContain("ReferenceError: gsap is not defined")
    expect(brief).toContain("Do not redesign")
  })
})

describe("parseObservations — untrusted postMessage payloads", () => {
  it("returns null for non-object input", () => {
    expect(parseObservations(null)).toBeNull()
    expect(parseObservations("string")).toBeNull()
  })

  it("coerces a partial payload to safe defaults rather than throwing", () => {
    const obs = parseObservations({ jsErrors: ["one"], bodyTextLength: 900 })
    expect(obs).not.toBeNull()
    expect(obs!.jsErrors).toEqual(["one"])
    expect(obs!.bodyTextLength).toBe(900)
    expect(obs!.mobileOverflowPx).toBe(0)
    expect(obs!.missingGlobals).toEqual([])
  })

  it("strips non-string entries out of string arrays", () => {
    const obs = parseObservations({ jsErrors: ["real", 42, null, { x: 1 }] })
    expect(obs!.jsErrors).toEqual(["real"])
  })

  it("rejects non-finite numbers rather than propagating NaN into the score", () => {
    const obs = parseObservations({ mobileOverflowPx: NaN, documentHeight: Infinity })
    expect(obs!.mobileOverflowPx).toBe(0)
    expect(obs!.documentHeight).toBe(0)
  })
})
