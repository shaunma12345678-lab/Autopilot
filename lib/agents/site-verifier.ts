// Render verification — does the generated site ACTUALLY work?
//
// THE GAP THIS CLOSES. lib/agents/website-agent.ts generates WebGL fragment
// shaders, custom GSAP timelines and hand-written JS, then scores the result
// with heuristicScore() — which is `html.includes("ShaderMaterial")` and
// twelve similar string checks. That counts keywords, not quality. A site
// whose JS throws on line 1 and renders a blank white page contains all the
// same strings as one that works, and scores identically.
//
// This is the same failure mode lib/data-health.ts exists to prevent on the
// markets side: silent degradation that still reports success. The fix is
// the same — assert the output is USABLE, not merely present.
//
// WHY IN-BROWSER RATHER THAN HEADLESS ON THE SERVER. Running Chromium in a
// Vercel function means @sparticuz/chromium, a ~50MB layer, and cold starts
// measured in seconds. Meanwhile the admin preview already renders this
// exact HTML in an iframe — a real browser, real GPU, real network, real
// mobile viewport. Verifying where it already runs costs one injected
// script and no new dependency, and tests conditions a headless shim would
// only approximate (WebGL especially — headless Chrome frequently reports no
// GPU and would false-positive every shader site as broken).
//
// WHAT THIS IS NOT. A design-quality judgment. Whether a site looks good is
// not something this measures and not something it claims to; taste is what
// the technique library and the generation prompt are for. This answers a
// narrower, checkable question: does it load, execute, and lay out without
// erroring — and it answers it from observed facts rather than inference.

export type IssueSeverity = "fatal" | "major" | "minor"

export interface RenderIssue {
  severity: IssueSeverity
  code: string
  detail: string
}

/** Raw observations reported by the in-page harness. No judgment applied. */
export interface RenderObservations {
  jsErrors: string[]
  unhandledRejections: string[]
  failedResources: string[]
  webglRequested: boolean
  webglFailed: boolean
  brokenImages: number
  totalImages: number
  imagesMissingAlt: number
  /** Widest horizontal overflow past the viewport at mobile width, in px. */
  mobileOverflowPx: number
  /** Sections present in the DOM that rendered with zero height. */
  emptySections: string[]
  sectionCount: number
  /** CDN globals the generated code depends on (gsap, THREE, ScrollTrigger). */
  missingGlobals: string[]
  bodyTextLength: number
  documentHeight: number
}

export interface VerificationReport {
  observations: RenderObservations
  issues: RenderIssue[]
  /** 0-10, computed from measured failures — not from keyword presence. */
  score: number
  passed: boolean
  summary: string
}

// The harness. Runs inside the generated page, reports back by postMessage.
//
// Split in two: an error trap that must execute BEFORE any of the site's own
// scripts (so a syntax error in the first tag is still caught), and the
// measurement pass that runs after load, when layout has settled.
//
// Deliberately dependency-free and defensive — a harness that throws would
// report a broken site as broken for the wrong reason, which is worse than
// no harness at all. Every block is individually try/caught.

const ERROR_TRAP = `<script>(function(){
  window.__siteVerify = { jsErrors: [], unhandledRejections: [], failedResources: [], webglRequested: false, webglFailed: false };
  window.addEventListener('error', function(e){
    try {
      if (e.target && e.target !== window && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK' || e.target.tagName === 'IMG')) {
        window.__siteVerify.failedResources.push((e.target.tagName || '') + ': ' + (e.target.src || e.target.href || 'unknown'));
      } else {
        window.__siteVerify.jsErrors.push((e.message || 'Error') + (e.lineno ? ' (line ' + e.lineno + ')' : ''));
      }
    } catch (_) {}
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    try { window.__siteVerify.unhandledRejections.push(String((e.reason && e.reason.message) || e.reason || 'unknown')); } catch (_) {}
  });
  // Wrap getContext so a WebGL context that never initialises is observable.
  // Sites that don't request WebGL are unaffected: webglRequested stays false.
  try {
    var _gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type){
      var ctx = null, err = null;
      try { ctx = _gc.apply(this, arguments); } catch (e) { err = e; }
      try {
        if (typeof type === 'string' && type.indexOf('webgl') !== -1) {
          window.__siteVerify.webglRequested = true;
          if (!ctx || err) window.__siteVerify.webglFailed = true;
        }
      } catch (_) {}
      if (err) throw err;
      return ctx;
    };
  } catch (_) {}
})();</script>`

const MEASURE = `<script>(function(){
  function measure(){
    var v = window.__siteVerify || { jsErrors: [], unhandledRejections: [], failedResources: [], webglRequested: false, webglFailed: false };
    var out = {
      jsErrors: v.jsErrors.slice(0, 12),
      unhandledRejections: v.unhandledRejections.slice(0, 8),
      failedResources: v.failedResources.slice(0, 12),
      webglRequested: !!v.webglRequested,
      webglFailed: !!v.webglFailed,
      brokenImages: 0, totalImages: 0, imagesMissingAlt: 0,
      mobileOverflowPx: 0, emptySections: [], sectionCount: 0,
      missingGlobals: [], bodyTextLength: 0, documentHeight: 0
    };
    try {
      var imgs = document.images || [];
      out.totalImages = imgs.length;
      for (var i = 0; i < imgs.length; i++) {
        if (imgs[i].complete && imgs[i].naturalWidth === 0) out.brokenImages++;
        if (!imgs[i].getAttribute('alt')) out.imagesMissingAlt++;
      }
    } catch (_) {}
    try {
      // Horizontal overflow: anything extending past the viewport edge makes
      // a phone scroll sideways. Measured against the real viewport width,
      // which in the verification iframe is set to a mobile width.
      var vw = document.documentElement.clientWidth;
      var worst = 0;
      var all = document.body ? document.body.querySelectorAll('*') : [];
      for (var j = 0; j < all.length; j++) {
        var el = all[j];
        // Fixed/absolute decorative layers routinely sit offscreen by design
        // (marquees, cursor followers) and are not what breaks a phone.
        var pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'absolute') continue;
        var r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        var over = Math.round(r.right - vw);
        if (over > worst) worst = over;
      }
      out.mobileOverflowPx = worst;
    } catch (_) {}
    try {
      var secs = document.querySelectorAll('section, [id]');
      var seen = {};
      for (var k = 0; k < secs.length; k++) {
        var s = secs[k];
        var id = s.id || s.className || s.tagName;
        if (seen[id]) continue;
        seen[id] = 1;
        if (s.tagName !== 'SECTION') continue;
        out.sectionCount++;
        if (s.getBoundingClientRect().height < 4) out.emptySections.push(String(id).slice(0, 40));
      }
    } catch (_) {}
    try {
      var html = document.documentElement.innerHTML || '';
      var needs = [];
      if (html.indexOf('gsap.') !== -1) needs.push('gsap');
      if (html.indexOf('ScrollTrigger') !== -1) needs.push('ScrollTrigger');
      if (html.indexOf('THREE.') !== -1) needs.push('THREE');
      for (var n = 0; n < needs.length; n++) {
        var g = needs[n];
        var present = g === 'ScrollTrigger'
          ? (typeof window.ScrollTrigger !== 'undefined' || (typeof window.gsap !== 'undefined' && !!window.gsap.ScrollTrigger))
          : typeof window[g] !== 'undefined';
        if (!present) out.missingGlobals.push(g);
      }
    } catch (_) {}
    try {
      out.bodyTextLength = (document.body && document.body.innerText ? document.body.innerText.trim().length : 0);
      out.documentHeight = Math.round(document.body ? document.body.scrollHeight : 0);
    } catch (_) {}
    try { parent.postMessage({ __siteVerifyResult: out }, '*'); } catch (_) {}
  }
  // Animations and CDN scripts need a beat past load to settle before layout
  // and global availability mean anything.
  if (document.readyState === 'complete') setTimeout(measure, 1200);
  else window.addEventListener('load', function(){ setTimeout(measure, 1200); });
})();</script>`

/**
 * Injects the verification harness. Preview/verification ONLY — published
 * HTML must never carry this, which is why instrumentation is a separate
 * step rather than something the generator emits.
 */
export function instrumentHtml(html: string): string {
  let out = html
  // The error trap has to precede the site's own scripts to catch anything
  // they throw on first execution.
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, m => `${m}\n${ERROR_TRAP}`)
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/<html[^>]*>/i, m => `${m}\n${ERROR_TRAP}`)
  } else {
    out = `${ERROR_TRAP}\n${out}`
  }

  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${MEASURE}\n</body>`)
  else out = `${out}\n${MEASURE}`

  return out
}

// Overflow under this is a rounding artifact of subpixel layout, not a real
// sideways scroll a user would ever notice.
const OVERFLOW_TOLERANCE_PX = 4
// Below this, a "page" is a blank shell — the generator produced markup that
// renders to nothing, which no keyword check can detect.
const MIN_BODY_TEXT = 400
const MIN_DOC_HEIGHT = 1200

export function evaluateRender(obs: RenderObservations): VerificationReport {
  const issues: RenderIssue[] = []

  for (const err of obs.jsErrors) {
    issues.push({ severity: "fatal", code: "js_error", detail: `JavaScript error: ${err}` })
  }
  for (const rej of obs.unhandledRejections) {
    issues.push({ severity: "major", code: "unhandled_rejection", detail: `Unhandled promise rejection: ${rej}` })
  }
  // A missing global means the CDN never loaded, so every animation depending
  // on it is silently dead — the page looks static rather than broken, which
  // is exactly why this needs measuring rather than eyeballing.
  for (const g of obs.missingGlobals) {
    issues.push({ severity: "fatal", code: "missing_global", detail: `\`${g}\` is used by the page but never loaded — every animation depending on it is dead.` })
  }
  for (const res of obs.failedResources) {
    issues.push({ severity: "major", code: "failed_resource", detail: `Resource failed to load — ${res}` })
  }
  if (obs.webglRequested && obs.webglFailed) {
    issues.push({ severity: "major", code: "webgl_failed", detail: "The page requested a WebGL context and did not get one — the shader hero will not render." })
  }
  if (obs.mobileOverflowPx > OVERFLOW_TOLERANCE_PX) {
    issues.push({ severity: "major", code: "mobile_overflow", detail: `Content extends ${obs.mobileOverflowPx}px past the mobile viewport — the page scrolls sideways on a phone.` })
  }
  if (obs.brokenImages > 0) {
    issues.push({ severity: "major", code: "broken_images", detail: `${obs.brokenImages} of ${obs.totalImages} images failed to load.` })
  }
  if (obs.emptySections.length > 0) {
    issues.push({ severity: "major", code: "empty_sections", detail: `Sections present in the markup but rendering at zero height: ${obs.emptySections.join(", ")}.` })
  }
  if (obs.bodyTextLength < MIN_BODY_TEXT) {
    issues.push({ severity: "fatal", code: "blank_page", detail: `The page renders only ${obs.bodyTextLength} characters of visible text — effectively blank.` })
  }
  if (obs.documentHeight < MIN_DOC_HEIGHT) {
    issues.push({ severity: "fatal", code: "no_content", detail: `Full document height is only ${obs.documentHeight}px — the page did not build out.` })
  }
  if (obs.imagesMissingAlt > 0) {
    issues.push({ severity: "minor", code: "missing_alt", detail: `${obs.imagesMissingAlt} image${obs.imagesMissingAlt === 1 ? "" : "s"} missing alt text — screen readers cannot describe them.` })
  }

  const fatal = issues.filter(i => i.severity === "fatal").length
  const major = issues.filter(i => i.severity === "major").length
  const minor = issues.filter(i => i.severity === "minor").length

  // Starts at a clean 10 and is debited only for OBSERVED failures. Nothing
  // here rewards the presence of a keyword, so the score cannot be inflated
  // by generating code that merely mentions a technique.
  const score = Math.max(0, Math.min(10, 10 - fatal * 4 - major * 1.5 - minor * 0.4))
  const passed = fatal === 0 && obs.mobileOverflowPx <= OVERFLOW_TOLERANCE_PX

  const summary = issues.length === 0
    ? "Rendered clean — no JavaScript errors, all libraries loaded, no mobile overflow, every section laid out."
    : `${fatal} fatal, ${major} major, ${minor} minor issue${issues.length === 1 ? "" : "s"} found by actually rendering the page.`

  return { observations: obs, issues, score: Math.round(score * 10) / 10, passed, summary }
}

/** Narrows an untrusted postMessage payload into RenderObservations. */
export function parseObservations(raw: unknown): RenderObservations | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const strArr = (v: unknown, cap = 12): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, cap) : []
  const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0)

  return {
    jsErrors: strArr(r.jsErrors),
    unhandledRejections: strArr(r.unhandledRejections, 8),
    failedResources: strArr(r.failedResources),
    webglRequested: r.webglRequested === true,
    webglFailed: r.webglFailed === true,
    brokenImages: num(r.brokenImages),
    totalImages: num(r.totalImages),
    imagesMissingAlt: num(r.imagesMissingAlt),
    mobileOverflowPx: num(r.mobileOverflowPx),
    emptySections: strArr(r.emptySections),
    sectionCount: num(r.sectionCount),
    missingGlobals: strArr(r.missingGlobals, 6),
    bodyTextLength: num(r.bodyTextLength),
    documentHeight: num(r.documentHeight),
  }
}

/**
 * The repair brief handed to the model. Only ever describes measured
 * failures — never a taste note — so a repair pass cannot drift into
 * redesigning a page that merely had a broken image.
 */
export function buildRepairBrief(report: VerificationReport): string | null {
  const actionable = report.issues.filter(i => i.severity !== "minor")
  if (actionable.length === 0) return null

  const lines = actionable.map((i, n) => `${n + 1}. [${i.severity.toUpperCase()}] ${i.detail}`)
  return `The generated page was rendered in a real browser at mobile width and these problems were OBSERVED — they are measured facts, not opinions:

${lines.join("\n")}

Fix every one of them. Rules:
- Change only what is required to fix these specific problems. Do not redesign, restyle, or rewrite copy.
- Preserve all existing sections, animations and content that are not implicated above.
- If a library global is missing, verify the CDN <script> tag is present, correct, and loaded before any code that uses it.
- If content overflows on mobile, fix it with responsive CSS (max-width, clamp, overflow-wrap, flex-wrap) rather than by deleting the element.
- Return the COMPLETE corrected HTML document, nothing else.`
}
