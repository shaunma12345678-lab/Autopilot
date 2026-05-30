import { runAgent } from "@/lib/claude"
import { scoreGeneratedSite } from "@/lib/agents/site-researcher"

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site"
}

// ── Quality baseline ──────────────────────────────────────────────────────────

let _qualityBaseline = 8.0
let _totalGenerated  = 0

export function getQualityBaseline(): number { return _qualityBaseline }
export function getGenerationCount(): number  { return _totalGenerated }

export function raiseQualityBaseline(score: number): void {
  _totalGenerated++
  if (score > _qualityBaseline) {
    _qualityBaseline = Math.min(9.9, _qualityBaseline + 0.15)
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SiteDirectives {
  darkMode:            boolean | null
  animationsEnabled:   boolean | null
  fontStyle:           "serif" | "sans" | "mono" | "display" | null
  layout:              "centered" | "wide" | "asymmetric" | "split" | null
  sections:            string[]
  colorScheme:         { primary: string | null; bg: string | null; text: string | null }
  tone:                "luxury" | "corporate" | "playful" | "minimal" | "bold" | "professional" | null
  heroType:            "video" | "3d" | "image" | "text-only" | "split" | null
  mustInclude:         string[]
  mustExclude:         string[]
  scrollBehavior:      "smooth" | "scrub" | "snap" | null
  animationDirectives: string[]
  shaderEffect:        string | null
  targetAudience:      string | null
}

export interface CROIssue {
  severity: "critical" | "high" | "medium"
  issue:    string
  fix:      string
}

export interface CROResult {
  issues:   CROIssue[]
  fixedHtml: string
  score:    number
}

// ── #1 — 15-field command parser ──────────────────────────────────────────────

export async function parseUserCommand(userMessage: string): Promise<SiteDirectives> {
  const defaults: SiteDirectives = {
    darkMode: null, animationsEnabled: null, fontStyle: null, layout: null,
    sections: [], colorScheme: { primary: null, bg: null, text: null },
    tone: null, heroType: null, mustInclude: [], mustExclude: [],
    scrollBehavior: null, animationDirectives: [], shaderEffect: null, targetAudience: null,
  }

  if (!userMessage?.trim()) return defaults

  try {
    const raw = await runAgent(
      `You extract structured website design directives from user messages.
Return ONLY valid JSON matching the schema exactly — no explanation, no markdown fences.
If a field is not mentioned, return null or [].`,
      `User message: "${userMessage}"

Return this exact JSON:
{
  "darkMode": true/false/null,
  "animationsEnabled": true/false/null,
  "fontStyle": "serif"|"sans"|"mono"|"display"|null,
  "layout": "centered"|"wide"|"asymmetric"|"split"|null,
  "sections": ["hero","pricing","faq","testimonials","contact",...],
  "colorScheme": { "primary": "#hex or null", "bg": "#hex or null", "text": "#hex or null" },
  "tone": "luxury"|"corporate"|"playful"|"minimal"|"bold"|"professional"|null,
  "heroType": "video"|"3d"|"image"|"text-only"|"split"|null,
  "mustInclude": ["things user explicitly said must be included"],
  "mustExclude": ["things user said NOT to include, e.g. no cursor effects"],
  "scrollBehavior": "smooth"|"scrub"|"snap"|null,
  "animationDirectives": ["specific animation descriptions like hero text slides up on load"],
  "shaderEffect": "aurora"|"water"|"plasma"|"galaxy"|"smoke"|"fire"|"crystal"|null,
  "targetAudience": "string or null"
}

Mapping examples:
- "make it dark" → darkMode: true
- "light theme, white background" → darkMode: false
- "no animations" → animationsEnabled: false
- "serif fonts, Playfair Display" → fontStyle: "serif"
- "I want pricing, faq, and contact sections" → sections: ["hero","pricing","faq","contact"]
- "no cursor effects" → mustExclude: ["cursor effects"]
- "water shader" → shaderEffect: "water"
- "hero slides in" → animationDirectives: ["hero content slides up 0.8s power4.out on load"]
- "luxury brand" → tone: "luxury"
- "target: restaurant owners" → targetAudience: "restaurant owners"`,
      { model: "haiku", maxTokens: 600, jsonMode: true }
    ) as Record<string, unknown>

    const cs = (raw.colorScheme ?? {}) as Record<string, unknown>
    return {
      darkMode:          raw.darkMode === true ? true : raw.darkMode === false ? false : null,
      animationsEnabled: raw.animationsEnabled === true ? true : raw.animationsEnabled === false ? false : null,
      fontStyle:         (["serif","sans","mono","display"] as const).includes(raw.fontStyle as "serif") ? raw.fontStyle as SiteDirectives["fontStyle"] : null,
      layout:            (["centered","wide","asymmetric","split"] as const).includes(raw.layout as "centered") ? raw.layout as SiteDirectives["layout"] : null,
      sections:          Array.isArray(raw.sections) ? (raw.sections as unknown[]).filter((s): s is string => typeof s === "string") : [],
      colorScheme: {
        primary: typeof cs.primary === "string" ? cs.primary : null,
        bg:      typeof cs.bg      === "string" ? cs.bg      : null,
        text:    typeof cs.text    === "string" ? cs.text    : null,
      },
      tone:              (["luxury","corporate","playful","minimal","bold","professional"] as const).includes(raw.tone as "luxury") ? raw.tone as SiteDirectives["tone"] : null,
      heroType:          (["video","3d","image","text-only","split"] as const).includes(raw.heroType as "video") ? raw.heroType as SiteDirectives["heroType"] : null,
      mustInclude:       Array.isArray(raw.mustInclude) ? (raw.mustInclude as unknown[]).filter((s): s is string => typeof s === "string") : [],
      mustExclude:       Array.isArray(raw.mustExclude) ? (raw.mustExclude as unknown[]).filter((s): s is string => typeof s === "string") : [],
      scrollBehavior:    (["smooth","scrub","snap"] as const).includes(raw.scrollBehavior as "smooth") ? raw.scrollBehavior as SiteDirectives["scrollBehavior"] : null,
      animationDirectives: Array.isArray(raw.animationDirectives) ? (raw.animationDirectives as unknown[]).filter((s): s is string => typeof s === "string") : [],
      shaderEffect:      typeof raw.shaderEffect === "string" ? raw.shaderEffect : null,
      targetAudience:    typeof raw.targetAudience === "string" ? raw.targetAudience : null,
    }
  } catch {
    return defaults
  }
}

// ── #3 — Constraint block: injects directives as top-priority system rules ────

function buildConstraintBlock(d: SiteDirectives, shaderGlsl?: string): string {
  const rules: string[] = []

  if (d.darkMode === true)  rules.push("Background MUST be dark (#070710 or similar) — NO light sections anywhere")
  if (d.darkMode === false) rules.push("LIGHT THEME: white/near-white background (#fafafa or #ffffff), dark text (#0f172a). Override ALL dark CSS defaults.")
  if (d.animationsEnabled === false) rules.push("NO JavaScript animations — static HTML/CSS only. Remove all GSAP, Three.js, WebGL, cursor JS.")
  if (d.fontStyle === "serif")   rules.push("Font: premium serif Google Font (Playfair Display, DM Serif Display, or Lora). Apply to all headings.")
  if (d.fontStyle === "sans")    rules.push("Font: clean sans-serif (Inter, Plus Jakarta Sans, or Geist) for all text.")
  if (d.fontStyle === "mono")    rules.push("Font: monospace (JetBrains Mono or Fira Code) for headings — technical/developer aesthetic.")
  if (d.fontStyle === "display") rules.push("Font: bold display/decorative (Space Grotesk, Syne, or Bebas Neue) for headings.")
  if (d.layout === "wide")       rules.push("Layout: full-bleed, edge-to-edge. No max-width constraint on sections.")
  if (d.layout === "centered")   rules.push("Layout: centered content, max-width 960px, generous whitespace.")
  if (d.layout === "asymmetric") rules.push("Layout: asymmetric grid — alternate content alignment per section, overlapping elements.")
  if (d.layout === "split")      rules.push("Layout: two-column split for hero and key sections (text left, visual right).")
  if (d.sections.length > 0)    rules.push(`SECTIONS: Include EXACTLY these in this order — no others: ${d.sections.join(", ")}`)
  if (d.colorScheme.primary)    rules.push(`Override --brand CSS variable with: ${d.colorScheme.primary}`)
  if (d.colorScheme.bg)         rules.push(`Override --bg CSS variable with: ${d.colorScheme.bg}`)
  if (d.colorScheme.text)       rules.push(`Override --text CSS variable with: ${d.colorScheme.text}`)
  if (d.tone === "luxury")      rules.push("Tone: ultra-luxury. Generous whitespace, refined copy (no exclamation marks), subtle gold accent touches.")
  if (d.tone === "playful")     rules.push("Tone: playful and energetic. Rounded shapes, bright accent pops, friendly copy.")
  if (d.tone === "minimal")     rules.push("Tone: radical minimalism. Maximum whitespace, single accent color, sparse copy, no decoration.")
  if (d.tone === "corporate")   rules.push("Tone: professional corporate. Structured layout, trust signals prominent, conservative vocabulary.")
  if (d.tone === "bold")        rules.push("Tone: bold and impactful. Large type, high contrast, strong CTAs, confident copy.")
  if (d.heroType === "text-only") rules.push("Hero: typography-only. No WebGL canvas. Large kinetic text with GSAP animation only.")
  if (d.heroType === "split")   rules.push("Hero: two-column split. Text + CTA on left, 3D canvas or large visual on right.")
  if (d.heroType === "image")   rules.push("Hero: image-based. Full-bleed CSS gradient background (no WebGL). Overlay text.")
  if (d.mustInclude.length > 0) rules.push(`MUST INCLUDE: ${d.mustInclude.join("; ")}`)
  if (d.mustExclude.length > 0) rules.push(`MUST NOT INCLUDE: ${d.mustExclude.join("; ")}`)
  if (d.scrollBehavior === "scrub") rules.push("ALL GSAP ScrollTrigger animations MUST use scrub:1 — scroll-position-driven, not time-based.")
  if (d.targetAudience)         rules.push(`Target audience: ${d.targetAudience}. All copy speaks directly to them.`)
  if (d.animationDirectives.length > 0) {
    rules.push(`ANIMATION DIRECTIVES — execute exactly:\n${d.animationDirectives.map((a, i) => `   ${i + 1}. ${a}`).join("\n")}`)
  }
  if (d.shaderEffect && shaderGlsl) {
    rules.push(`CUSTOM SHADER: Replace the default rings fragment shader with this GLSL:\n\`\`\`glsl\n${shaderGlsl}\n\`\`\``)
  } else if (d.shaderEffect) {
    rules.push(`CUSTOM SHADER EFFECT: Generate a unique GLSL fragment shader for the "${d.shaderEffect}" visual effect. Replace the default rings shader. Be technically impressive.`)
  }

  if (rules.length === 0) return ""
  return `━━━ MANDATORY USER REQUIREMENTS — OVERRIDE ALL DEFAULTS ━━━
Honor every rule below exactly — these take absolute priority:
${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`
}

// ── System prompt (all 15 techniques) ────────────────────────────────────────

function buildSystemPrompt(
  qualityBaseline: number,
  generationCount: number,
  directives?: SiteDirectives,
  shaderGlsl?: string
): string {
  const mandate = generationCount === 0
    ? "Build the highest-quality website you are capable of. Target: 9+/10."
    : `QUALITY MANDATE: Previous sites averaged ${qualityBaseline.toFixed(1)}/10. You MUST score above ${(qualityBaseline + 0.2).toFixed(1)}/10. Every generation raises the bar — there is NO ceiling.`

  const constraintBlock = directives ? buildConstraintBlock(directives, shaderGlsl) : ""

  return `You are the world's #1 frontend engineer. You build complete, award-winning single-file HTML websites.

${mandate}

${constraintBlock}━━━ OUTPUT FORMAT ━━━
Output EXACTLY this — no JSON, no markdown fences, no explanation before or after:

SITE_TITLE: [compelling SEO title]
SITE_SLUG: [url-friendly-slug]
SITE_HTML:
<!DOCTYPE html>
[complete website]
</html>

━━━ CDN LIBRARIES (only these) ━━━
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
Google Fonts via CSS @import only — never <link> tags

━━━ CSS FOUNDATION ━━━
:root {
  --brand: BRAND_COLOR_PLACEHOLDER;
  --brand-dark: color-mix(in srgb, var(--brand) 62%, black);
  --brand-glow: color-mix(in srgb, var(--brand) 22%, transparent);
  --text: #f1f5f9; --text-muted: #94a3b8;
  --bg: #070710; --bg-alt: #0d0d1a;
  --surface: rgba(255,255,255,0.04); --border: rgba(255,255,255,0.07);
  --radius: 14px; --radius-lg: 28px; --radius-pill: 999px;
  --shadow-brand: 0 0 50px var(--brand-glow);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); overflow-x: hidden; }
section { padding: clamp(5rem, 11vw, 10rem) clamp(1.5rem, 6vw, 7rem); }
h1 { font-size: clamp(3.2rem, 7.5vw, 8rem); line-height: 1.02; }
h2 { font-size: clamp(2.2rem, 4.5vw, 4.5rem); line-height: 1.08; }
a { color: inherit; text-decoration: none; }
img { max-width: 100%; }

━━━ TECHNIQUE 1 — SCROLL TRACKING ━━━
<div id="scroll-bar" style="position:fixed;top:0;left:0;height:3px;background:var(--brand);z-index:1000;width:0;transition:width 0.08s linear;pointer-events:none;will-change:width"></div>

let _sy = 0;
window.addEventListener('scroll', () => {
  _sy = window.scrollY;
  const _sp = _sy / Math.max(document.body.scrollHeight - innerHeight, 1);
  const bar = document.getElementById('scroll-bar');
  if (bar) bar.style.width = (_sp * 100) + '%';
  const heroContent = document.querySelector('.hero-content');
  if (heroContent && _sy < innerHeight) {
    heroContent.style.transform = 'translateY(' + (_sy * 0.22) + 'px)';
    heroContent.style.opacity   = String(Math.max(0, 1 - _sy / (innerHeight * 0.65)));
  }
  document.querySelector('.site-nav')?.classList.toggle('scrolled', _sy > 60);
}, { passive: true });

━━━ TECHNIQUE 2 — VIEWPORT DETECTION ━━━
[data-reveal] { opacity:0; transform:translateY(48px); transition:opacity 0.75s cubic-bezier(.25,.46,.45,.94), transform 0.75s cubic-bezier(.25,.46,.45,.94); }
[data-reveal].in-view { opacity:1; transform:none; }
[data-reveal][data-delay="1"] { transition-delay:.12s; }
[data-reveal][data-delay="2"] { transition-delay:.24s; }
[data-reveal][data-delay="3"] { transition-delay:.36s; }
[data-reveal][data-delay="4"] { transition-delay:.48s; }
[data-reveal][data-delay="5"] { transition-delay:.60s; }

const _io = new IntersectionObserver(es => {
  es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); _io.unobserve(e.target); } });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('[data-reveal]').forEach(el => _io.observe(el));

━━━ TECHNIQUE 3 — STICKY NAV ━━━
<nav class="site-nav">
  <div class="nav-logo">LOGO</div>
  <ul class="nav-links"><li><a>...</a></li></ul>
  <a class="nav-cta btn-primary magnetic">CTA</a>
  <button class="hamburger" onclick="document.querySelector('.mobile-nav').classList.toggle('open');this.classList.toggle('open')">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="mobile-nav">...</div>

.site-nav { position:sticky; top:0; z-index:100; display:flex; align-items:center; justify-content:space-between; padding:1.2rem clamp(1.5rem,5vw,5rem); transition:background .4s,backdrop-filter .4s,box-shadow .4s; }
.site-nav.scrolled { background:rgba(7,7,16,.94); backdrop-filter:blur(24px); box-shadow:0 1px 0 var(--border); }
.hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:4px; }
.hamburger span { width:24px; height:2px; background:var(--text); transition:.3s; display:block; }
.hamburger.open span:first-child { transform:rotate(45deg) translate(5px,5px); }
.hamburger.open span:nth-child(2) { opacity:0; width:0; }
.hamburger.open span:last-child { transform:rotate(-45deg) translate(5px,-5px); }
.mobile-nav { position:fixed; inset:0; background:rgba(7,7,16,.98); z-index:90; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2rem; font-size:1.5rem; transform:translateX(100%); transition:transform .45s cubic-bezier(.77,0,.18,1); }
.mobile-nav.open { transform:none; }
@media (max-width:768px) { .nav-links,.nav-cta { display:none; } .hamburger { display:flex; } }

━━━ TECHNIQUE 4 — GSAP SECTION ENTRANCES ━━━
gsap.registerPlugin(ScrollTrigger);

gsap.utils.toArray('.gsap-section').forEach(section => {
  const items = section.querySelectorAll('.gsap-item');
  if (!items.length) return;
  gsap.fromTo(items,
    { opacity:0, y:55, scale:0.97 },
    { opacity:1, y:0, scale:1, duration:0.85, stagger:0.11, ease:'power3.out',
      scrollTrigger:{ trigger:section, start:'top 78%', once:true } }
  );
});

gsap.from('.hero-eyebrow', { opacity:0, y:16, duration:0.7, ease:'expo.out', delay:0.15 });
gsap.from('.hero-sub',     { opacity:0, y:24, duration:0.85, ease:'power3.out', delay:0.9 });
gsap.from('.hero-cta',     { opacity:0, y:28, duration:0.85, ease:'back.out(1.7)', delay:1.1, stagger:0.14 });
gsap.from('.hero-badges',  { opacity:0, y:20, duration:0.7, ease:'power2.out', delay:1.4 });

━━━ TECHNIQUE 5 — TEXT SPLITTING ━━━
function splitAndAnimate(selector, opts={}) {
  document.querySelectorAll(selector).forEach(el => {
    const words = el.textContent.split(' ');
    el.style.perspective = '800px';
    el.innerHTML = words.map(w =>
      '<span style="display:inline-block;overflow:hidden;vertical-align:top;margin-right:.22em">' +
      [...w].map(c => '<span class="char" style="display:inline-block;will-change:transform">' + (c||'') + '</span>').join('') +
      '</span>'
    ).join('');
    const chars = el.querySelectorAll('.char');
    gsap.from(chars, {
      opacity:0, y:'105%', rotationX:-85,
      duration:opts.dur||0.65, stagger:opts.stag||0.026,
      ease:opts.ease||'power4.out', delay:opts.delay||0,
      scrollTrigger:opts.scroll ? { trigger:el, start:'top 88%', once:true } : undefined
    });
  });
}
splitAndAnimate('.hero-headline', { delay:0.3 });
splitAndAnimate('.section-headline', { scroll:true, dur:0.6, stag:0.022 });

━━━ TECHNIQUE 6 — MAP RANGE ━━━
const mapRange = (v,a,b,c,d) => c + ((Math.min(Math.max(v,a),b)-a)/(b-a))*(d-c);

━━━ TECHNIQUE 7 — LERP + CONTEXT-AWARE CURSOR ━━━
const lerp = (a,b,t) => a + (b-a)*t;
let _mx=innerWidth/2, _my=innerHeight/2, _cx=_mx, _cy=_my;
const _cur = document.querySelector('.cursor');
const _dot = document.querySelector('.cursor-dot');
document.addEventListener('mousemove', e => { _mx=e.clientX; _my=e.clientY; }, { passive:true });
(function _animCursor() {
  requestAnimationFrame(_animCursor);
  _cx = lerp(_cx, _mx, 0.1);
  _cy = lerp(_cy, _my, 0.1);
  if (_cur) _cur.style.transform = 'translate('+_cx+'px,'+_cy+'px)';
  if (_dot) _dot.style.transform = 'translate('+_mx+'px,'+_my+'px)';
})();
// Context-aware: cursor morphs per section (luxury-site pattern)
document.querySelectorAll('[data-cursor]').forEach(el => {
  el.addEventListener('mouseenter', () => { if(_cur){ _cur.dataset.type = el.dataset.cursor||''; _cur.classList.add('hover'); } });
  el.addEventListener('mouseleave', () => { if(_cur){ _cur.dataset.type = ''; _cur.classList.remove('hover'); } });
});
document.querySelectorAll('a,button').forEach(el => {
  el.addEventListener('mouseenter', () => _cur?.classList.add('hover'));
  el.addEventListener('mouseleave', () => _cur?.classList.remove('hover'));
});

HTML: <div class="cursor"></div><div class="cursor-dot"></div>
CSS:
.cursor { position:fixed;width:44px;height:44px;border:1.5px solid var(--brand);border-radius:50%;pointer-events:none;z-index:9999;margin:-22px 0 0 -22px;transition:border-color .3s,width .3s,height .3s,margin .3s,opacity .3s,background .3s;will-change:transform; }
.cursor-dot { position:fixed;width:6px;height:6px;background:var(--brand);border-radius:50%;pointer-events:none;z-index:10000;margin:-3px 0 0 -3px;will-change:transform; }
.cursor.hover { width:68px;height:68px;margin:-34px 0 0 -34px;border-color:rgba(255,255,255,.6);opacity:.7; }
.cursor[data-type="image"] { background:var(--brand-glow);border-width:0;width:80px;height:80px;margin:-40px 0 0 -40px; }
@media (hover:none),(pointer:coarse) { .cursor,.cursor-dot { display:none; } }

━━━ TECHNIQUE 8 — GLSL SHADER ━━━
const _vShader = \`
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x*2.8+uTime*0.85)*0.16 + cos(p.y*2.1+uTime*0.65)*0.11;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
  }
\`;
const _fShader = \`
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  void main() {
    float d = length(vUv - 0.5);
    float ring = sin(d*20.0 - uTime*2.0)*0.5+0.5;
    float pulse = sin(uTime*0.5)*0.12+0.88;
    float glow = (1.0-smoothstep(0.0,0.52,d))*pulse;
    float noise = sin(vUv.x*38.0+uTime)*sin(vUv.y*38.0+uTime*0.9)*0.04;
    gl_FragColor = vec4(mix(vec3(0.0),uColor,(ring*glow+noise)*0.85), glow*ring*0.65+noise*0.2);
  }
\`;
const _sUniforms = { uTime:{ value:0.0 }, uColor:{ value:new THREE.Color(BRAND_INT_PLACEHOLDER) } };
const _sMat = new THREE.ShaderMaterial({
  vertexShader:_vShader, fragmentShader:_fShader,
  uniforms:_sUniforms, transparent:true, depthWrite:false, side:THREE.DoubleSide
});

━━━ WEBGL FULL HERO ━━━
const _canvas = document.getElementById('hero-canvas');
let _r3d;
try {
  _r3d = new THREE.WebGLRenderer({ canvas:_canvas, antialias:true, alpha:true });
  _r3d.setPixelRatio(Math.min(devicePixelRatio,2));
  _r3d.setSize(innerWidth,innerHeight);
  const _sc = new THREE.Scene();
  const _cam = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 100);
  _cam.position.z = 5;
  _sc.add(new THREE.AmbientLight(0xffffff,0.2));
  const _pl = new THREE.PointLight(BRAND_INT_PLACEHOLDER, 4, 18);
  _sc.add(_pl);
  const _plane = new THREE.Mesh(new THREE.PlaneGeometry(16,11,36,36), _sMat);
  _plane.position.z = -3;
  _sc.add(_plane);
  const _iGeo = new THREE.IcosahedronGeometry(1.55,1);
  const _iMesh = new THREE.Mesh(_iGeo, new THREE.MeshPhongMaterial({ color:BRAND_INT_PLACEHOLDER, shininess:130, specular:0xffffff }));
  const _wMesh = new THREE.Mesh(_iGeo, new THREE.MeshBasicMaterial({ color:0xffffff, wireframe:true, transparent:true, opacity:0.055 }));
  _sc.add(_iMesh,_wMesh);
  const _pArr = new Float32Array(2700);
  for(let i=0;i<2700;i++) _pArr[i]=(Math.random()-.5)*12;
  const _pGeo = new THREE.BufferGeometry();
  _pGeo.setAttribute('position', new THREE.BufferAttribute(_pArr,3));
  _sc.add(new THREE.Points(_pGeo, new THREE.PointsMaterial({ color:BRAND_INT_PLACEHOLDER, size:0.013, transparent:true, opacity:0.5 })));
  let _wt=0, _wmx=0, _wmy=0, _wtx=0, _wty=0;
  document.addEventListener('mousemove', e=>{ _wmx=(e.clientX/innerWidth-.5)*2; _wmy=-(e.clientY/innerHeight-.5)*2; },{ passive:true });
  (function _loopGL(){
    requestAnimationFrame(_loopGL);
    _wt += 0.007;
    _wtx = lerp(_wtx, _wmx*0.5, 0.04);
    _wty = lerp(_wty, _wmy*0.5, 0.04);
    _iMesh.rotation.y = _wt*0.3+_wtx;
    _iMesh.rotation.x = _wt*0.15+_wty;
    _wMesh.rotation.copy(_iMesh.rotation);
    _pl.position.set(Math.sin(_wt)*4, Math.cos(_wt*.7)*3, 3);
    _sUniforms.uTime.value = _wt;
    _r3d.render(_sc,_cam);
  })();
  window.addEventListener('resize',()=>{ _cam.aspect=innerWidth/innerHeight; _cam.updateProjectionMatrix(); _r3d.setSize(innerWidth,innerHeight); });
} catch(e) {
  if(_canvas) _canvas.style.background='radial-gradient(ellipse at 50% 55%, BRAND_COLOR_PLACEHOLDER 0%, #070710 68%)';
}

Hero HTML:
<section class="hero" data-cursor="image">
  <canvas id="hero-canvas" style="position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none"></canvas>
  <div class="hero-content" style="position:relative;z-index:1;will-change:transform,opacity">
    <div class="hero-eyebrow">...</div>
    <h1 class="hero-headline">...</h1>
    <p class="hero-sub">...</p>
    <div class="hero-cta-group hero-cta">
      <a class="btn-primary magnetic btn-arrow">Get Started <span class="arr">→</span></a>
      <a class="btn-ghost">See Our Work</a>
    </div>
    <div class="hero-badges">...</div>
  </div>
</section>

━━━ BUTTON STYLES ━━━
.btn-primary { display:inline-flex;align-items:center;gap:.5rem;padding:.875rem 2.2rem;background:var(--brand);color:#fff;font-weight:700;font-size:.95rem;letter-spacing:.02em;border-radius:var(--radius-pill);border:none;cursor:pointer;transition:transform .25s,box-shadow .25s,filter .25s;will-change:transform; }
.btn-primary:hover { transform:translateY(-2px) scale(1.02);box-shadow:var(--shadow-brand);filter:brightness(1.1); }
.btn-ghost { display:inline-flex;align-items:center;gap:.5rem;padding:.875rem 2.2rem;background:transparent;color:var(--text);font-weight:600;font-size:.95rem;border:1.5px solid var(--border);border-radius:var(--radius-pill);cursor:pointer;transition:border-color .25s,background .25s; }
.btn-ghost:hover { border-color:var(--brand);background:var(--brand-glow); }
.btn-arrow .arr { display:inline-block;transition:transform .3s ease; }
.btn-arrow:hover .arr { transform:translateX(5px); }

━━━ GLASSMORPHISM CARDS ━━━
.card { background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:2.5rem 2rem;backdrop-filter:blur(14px);transition:transform .35s cubic-bezier(.25,.46,.45,.94),box-shadow .35s,border-color .35s;will-change:transform; }
.card:hover { transform:translateY(-10px);box-shadow:0 28px 70px var(--brand-glow),0 0 0 1px var(--brand);border-color:var(--brand); }

━━━ MARQUEE ━━━
.marquee { overflow:hidden;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:1.2rem 0; }
.marquee-inner { display:flex;gap:3rem;width:max-content;animation:marquee 30s linear infinite;align-items:center; }
@keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
.marquee:hover .marquee-inner { animation-play-state:paused; }

━━━ NUMBER COUNTER ━━━
function _animCount(el) {
  const t=+el.dataset.target, s=el.dataset.suffix||'', p=el.dataset.prefix||'';
  let c=0; const inc=t/75;
  const id=setInterval(()=>{c=Math.min(c+inc,t);el.textContent=p+Math.floor(c).toLocaleString()+s;if(c>=t)clearInterval(id);},14);
}
const _cio = new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){_animCount(e.target);_cio.unobserve(e.target);}});},{threshold:.55});
document.querySelectorAll('[data-target]').forEach(el=>_cio.observe(el));

━━━ TECHNIQUE 9 — PAGE LOAD SEQUENCE ━━━
Add as FIRST child of <body>:
<div id="page-loader" style="position:fixed;inset:0;background:var(--bg);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem">
  <div id="loader-num" style="font-size:clamp(3rem,8vw,6rem);font-weight:800;color:var(--brand);letter-spacing:-.02em;font-variant-numeric:tabular-nums">0</div>
  <div style="width:220px;height:2px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden">
    <div id="loader-bar" style="height:100%;width:0%;background:var(--brand);transition:width .08s linear"></div>
  </div>
  <div style="font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--text-muted)">Loading Experience</div>
</div>

Before </body>:
(function(){
  document.documentElement.style.overflow='hidden';
  let p=0;
  const num=document.getElementById('loader-num'),bar=document.getElementById('loader-bar'),loader=document.getElementById('page-loader');
  const iv=setInterval(()=>{
    p+=Math.random()*14+5; if(p>100)p=100;
    if(num)num.textContent=Math.floor(p)+'%';
    if(bar)bar.style.width=p+'%';
    if(p>=100){clearInterval(iv);setTimeout(()=>{
      if(typeof gsap!=='undefined'){
        gsap.to(loader,{yPercent:-100,duration:1.1,ease:'power4.inOut',onComplete:()=>{loader.remove();document.documentElement.style.overflow='';}});
      } else { loader.remove(); document.documentElement.style.overflow=''; }
    },350);}
  },55);
})();

━━━ TECHNIQUE 10 — MAGNETIC BUTTONS ━━━
document.querySelectorAll('.magnetic').forEach(btn=>{
  btn.addEventListener('mousemove',e=>{
    const r=btn.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
    btn.style.transition='transform 0.08s ease';
    btn.style.transform='translate('+(x*.3)+'px,'+(y*.3)+'px)';
  });
  btn.addEventListener('mouseleave',()=>{
    btn.style.transition='transform 0.55s cubic-bezier(.25,.46,.45,.94)';
    btn.style.transform='translate(0,0)';
  });
});

━━━ TECHNIQUE 11 — 3D CARD TILT ━━━
document.querySelectorAll('.tilt-card').forEach(card=>{
  card.style.transformStyle='preserve-3d';
  card.addEventListener('mousemove',e=>{
    const r=card.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
    card.style.transition='transform 0.08s ease,box-shadow 0.08s';
    card.style.transform='perspective(700px) rotateY('+(x*16)+'deg) rotateX('+(-y*16)+'deg) scale(1.04)';
    card.style.boxShadow='0 30px 70px var(--brand-glow),0 0 0 1px var(--brand)';
    card.style.borderColor='var(--brand)';
  });
  card.addEventListener('mouseleave',()=>{
    card.style.transition='transform 0.6s cubic-bezier(.25,.46,.45,.94),box-shadow 0.4s,border-color 0.4s';
    card.style.transform='perspective(700px) rotateY(0) rotateX(0) scale(1)';
    card.style.boxShadow=''; card.style.borderColor='';
  });
});

━━━ TECHNIQUE 12 — HORIZONTAL SCROLL ━━━
<section class="h-section gsap-section">
  <div style="padding:3rem clamp(1.5rem,5vw,5rem)"><h2 class="section-headline split-text">Our Services</h2></div>
  <div class="h-track" style="display:flex;gap:2rem;padding:0 clamp(1.5rem,5vw,5rem) 4rem;width:max-content">
    <div class="h-card tilt-card card">...</div>
  </div>
</section>
.h-section { overflow:hidden; padding:0; }
.h-card { width:360px; flex-shrink:0; }
const htrack=document.querySelector('.h-track');
if(htrack){
  gsap.to(htrack,{
    x:()=>-(htrack.scrollWidth-innerWidth+120), ease:'none',
    scrollTrigger:{ trigger:'.h-section', start:'top top', end:()=>'+='+(htrack.scrollWidth-innerWidth+120), scrub:1.2, pin:true, anticipatePin:1 }
  });
}

━━━ TECHNIQUE 13 — CLIP-PATH WIPE REVEALS ━━━
.wipe-reveal { clip-path:inset(0 100% 0 0); transition:clip-path 1s cubic-bezier(.77,0,.18,1); }
.wipe-reveal.in-view { clip-path:inset(0 0% 0 0); }
.section-headline { position:relative; display:inline-block; }
.section-headline::after { content:''; position:absolute; bottom:-8px; left:0; width:0; height:3px; background:var(--brand); border-radius:2px; transition:width 1.1s cubic-bezier(.77,0,.18,1) 0.3s; }
.section-headline.in-view::after { width:55%; }

━━━ TECHNIQUE 14 — MICRO-ANIMATIONS ━━━
.nav-links a { position:relative; padding-bottom:3px; }
.nav-links a::after { content:''; position:absolute; bottom:0; left:0; width:0; height:1.5px; background:var(--brand); transition:width .3s ease; }
.nav-links a:hover::after { width:100%; }
.chip { display:inline-block; padding:.3rem 1rem; border:1px solid var(--brand); border-radius:var(--radius-pill); font-size:.68rem; letter-spacing:.14em; text-transform:uppercase; color:var(--brand); margin-bottom:.9rem; background:var(--brand-glow); }
.footer-links a { display:inline-block; transition:color .2s, transform .2s; }
.footer-links a:hover { color:var(--brand); transform:translateX(5px); }

━━━ TECHNIQUE 15 — SCROLL SCRUBBING (Awwwards-level) ━━━
Animation progress driven by scroll position — user controls the pace.
Add alongside all existing ScrollTrigger calls:

// Hero cinematic parallax exit (scrub driven)
gsap.to('.hero-content', {
  y:-80, opacity:0, scale:0.96, ease:'none',
  scrollTrigger:{ trigger:'.hero', start:'center center', end:'bottom top', scrub:1.5 }
});

// Section headings scrub in from below
gsap.utils.toArray('.section-headline').forEach(el => {
  gsap.fromTo(el, { y:50, opacity:0 }, { y:0, opacity:1, ease:'none',
    scrollTrigger:{ trigger:el, start:'top 90%', end:'top 40%', scrub:1 }
  });
});

// Cards scrub in with stagger
gsap.utils.toArray('.gsap-section').forEach(section => {
  const cards = section.querySelectorAll('.card,.gsap-item');
  if (!cards.length) return;
  gsap.fromTo(cards, { y:60, opacity:0 }, {
    y:0, opacity:1, stagger:0.08, ease:'none',
    scrollTrigger:{ trigger:section, start:'top 85%', end:'top 30%', scrub:1 }
  });
});

// Parallax background layers: add data-parallax="0.3" to bg elements
gsap.utils.toArray('[data-parallax]').forEach(el => {
  const speed = parseFloat(el.getAttribute('data-parallax') || '0.3');
  const parent = el.closest('section') || el.parentElement;
  gsap.to(el, {
    y:()=>-(parent?.offsetHeight||400)*speed, ease:'none',
    scrollTrigger:{ trigger:parent, start:'top bottom', end:'bottom top', scrub:true }
  });
});

━━━ ANIMATION DIRECTIVE EXECUTION ━━━
When ANIMATION_DIRECTIVES listed in MANDATORY REQUIREMENTS, execute each one:
Format: "[target] [effect] [duration]s [easing] [delay]s on:[load|scroll]"
- "hero-headline slides-up 0.8s power4.out 0.3s on:load"
  → gsap.from('.hero-headline', {y:60,opacity:0,duration:0.8,ease:'power4.out',delay:0.3})
- "service-cards stagger-fade 0.6s expo.out 0.1s on:scroll"
  → stagger ScrollTrigger fromTo on .card elements
Always implement the closest GSAP equivalent.

━━━ ALL 9 SECTIONS (required unless MANDATORY REQUIREMENTS override) ━━━
1. NAV — sticky + .scrolled, logo, nav-links, magnetic nav-cta, hamburger
2. HERO — page-loader first, cursor, scroll-bar, WebGL+shader canvas, split-text headline, magnetic CTAs, badges
3. SOCIAL PROOF BAR — marquee trust signals ("4.9★" / "500+ Projects" / "$50M Generated")
4. SERVICES — horizontal scroll h-section with 4 tilt-card cards
5. ABOUT/STATS — 3 count-up stats | wipe-reveal story + CTA
6. PROCESS — chip label, wipe-reveal h2, 3-4 numbered steps
7. TESTIMONIALS — 3 tilt-card cards, ★★★★★, blockquote, name, company
8. CTA SECTION — full-width brand bg, split-text headline, magnetic btn-primary
9. FOOTER — logo+tagline, 3-4 link columns (footer-links), social icons, copyright

━━━ SEO (required on every site) ━━━
Include in <head>: <title>, <meta name="description">, <meta property="og:title">, <meta property="og:description">
Include before </body>: JSON-LD schema (LocalBusiness or Organization)

━━━ CONTENT STANDARDS ━━━
- Real compelling marketing copy — no generic filler
- Specific believable stats ("1,400+ Roofs Installed" not "Many projects")
- Real-sounding testimonials from the business's city/industry
- Action-driven CTAs ("Get Your Free Estimate", "Talk to an Expert")`
}

// ── Output extractor ──────────────────────────────────────────────────────────

function extractResult(raw: unknown): { html: string; title: string; slug: string } {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw)

  const titleMatch = text.match(/SITE_TITLE:\s*(.+)/i)
  const slugMatch  = text.match(/SITE_SLUG:\s*([a-z0-9-]+)/i)

  const htmlMatch = text.match(/SITE_HTML:\s*\r?\n?(<!DOCTYPE[\s\S]+)/i)
  if (htmlMatch?.[1]) {
    return {
      html:  htmlMatch[1].trim(),
      title: titleMatch?.[1]?.trim() ?? "Business Website",
      slug:  slugMatch?.[1]?.trim()  ?? "website",
    }
  }

  const bareHtml = text.match(/(<!DOCTYPE[\s\S]+<\/html>)/i)
  if (bareHtml?.[1]) {
    return {
      html:  bareHtml[1].trim(),
      title: titleMatch?.[1]?.trim() ?? "Business Website",
      slug:  slugMatch?.[1]?.trim()  ?? "website",
    }
  }

  if (raw && typeof raw === "object" && "html" in (raw as object)) {
    const r = raw as Record<string, string>
    return { html: r.html, title: r.title ?? "Website", slug: r.slug ?? "site" }
  }

  throw new Error("Website generation produced no HTML. The model may have hit its output limit — try again.")
}

// ── Post-processing ───────────────────────────────────────────────────────────

function postProcess(html: string, brandColor: string, brandInt: string): string {
  return html
    .replace(/BRAND_COLOR_PLACEHOLDER/g, brandColor)
    .replace(/BRAND_INT_PLACEHOLDER/g,   brandInt)
    .replace(/BRAND_COLOR/g, brandColor)
    .replace(/BRAND_INT/g,   brandInt)
}

// ── #17 — Custom GLSL shader generator ───────────────────────────────────────

export async function generateCustomShader(effectName: string): Promise<string> {
  try {
    const glsl = await runAgent(
      `You are an expert GLSL shader programmer for Three.js ShaderMaterial.
Output ONLY valid GLSL fragment shader code — no explanation, no markdown, no js wrapper.
Requirements:
- Declare at top: varying vec2 vUv; uniform float uTime; uniform vec3 uColor;
- Output: gl_FragColor = vec4(rgb, alpha)
- Animate using uTime, incorporate uColor for brand tinting
- No texture samplers, no external uniforms beyond uTime and uColor
- Max 5 loop iterations for GPU performance
- Be visually impressive`,
      `Effect: "${effectName}" — for a business website hero background on dark background. Output only GLSL.`,
      { model: "haiku", maxTokens: 700, jsonMode: false }
    ) as string

    return glsl.replace(/^```(?:glsl|c|cpp)?\n?/i, "").replace(/\n?```$/i, "").trim()
  } catch {
    return ""
  }
}

// ── #2 — Compliance verifier ──────────────────────────────────────────────────

export async function verifyCompliance(html: string, directives: SiteDirectives): Promise<string[]> {
  const violations: string[] = []

  if (directives.darkMode === false && /(--bg:\s*#0[0-2]|background:\s*#0[0-2])/i.test(html)) {
    violations.push("DARK_BG: Light theme was requested but dark background CSS detected")
  }
  if (directives.darkMode === true && /(background:\s*(#fff|white)|--bg:\s*(#fff|white))/i.test(html)) {
    violations.push("LIGHT_BG: Dark mode was requested but light background CSS detected")
  }
  if (directives.animationsEnabled === false && /gsap\.|ScrollTrigger|WebGLRenderer/i.test(html)) {
    violations.push("ANIMATIONS_FOUND: Animations were disabled but GSAP/WebGL code exists in HTML")
  }
  for (const section of directives.sections) {
    const kw = section.toLowerCase().replace(/[-_\s]/g, "")
    if (!html.toLowerCase().replace(/[-_\s]/g, "").includes(kw)) {
      violations.push(`SECTION_MISSING: Required section "${section}" not found in HTML`)
    }
  }
  for (const item of directives.mustInclude) {
    const kw = item.toLowerCase().split(/\s+/)[0]
    if (!html.toLowerCase().includes(kw)) {
      violations.push(`MUST_INCLUDE_MISSING: "${item}" was required but not found`)
    }
  }
  for (const item of directives.mustExclude) {
    const kw = item.toLowerCase().split(/\s+/)[0]
    if (kw.length > 3 && html.toLowerCase().includes(kw)) {
      violations.push(`MUST_EXCLUDE_PRESENT: "${item}" was excluded but appears in HTML`)
    }
  }

  return violations
}

// ── #4 — Diff-mode section editor ────────────────────────────────────────────

const SECTION_MAP: Record<string, string[]> = {
  nav:          ["nav", "navigation", "header", "menu", "top bar"],
  hero:         ["hero", "banner", "above the fold", "headline", "main section", "top section"],
  proof:        ["social proof", "marquee", "trust bar", "logos", "trust"],
  services:     ["service", "offering", "what we do", "solution", "horizontal scroll"],
  about:        ["about", "stats", "numbers", "our story", "company", "count up"],
  process:      ["process", "how it works", "steps", "workflow", "our approach"],
  testimonials: ["testimonial", "review", "what clients", "what customers"],
  cta:          ["cta", "call to action", "get started", "final cta", "bottom cta"],
  footer:       ["footer", "bottom", "links"],
}

function detectSection(editRequest: string): string {
  const lower = editRequest.toLowerCase()
  for (const [section, keywords] of Object.entries(SECTION_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) return section
  }
  return "hero"
}

function extractSection(html: string, sectionName: string): { content: string; start: number; end: number } | null {
  if (sectionName === "nav") {
    const m = html.match(/<nav[\s\S]*?<\/nav>/i)
    if (!m || m.index === undefined) return null
    return { content: m[0], start: m.index, end: m.index + m[0].length }
  }
  if (sectionName === "footer") {
    const m = html.match(/<footer[\s\S]*?<\/footer>/i)
    if (!m || m.index === undefined) return null
    return { content: m[0], start: m.index, end: m.index + m[0].length }
  }

  const allSections = [...html.matchAll(/<section[\s\S]*?<\/section>/gi)]
  const orderMap: Record<string, number> = {
    hero: 0, proof: 1, services: 2, about: 3, process: 4, testimonials: 5, cta: 6
  }
  const idx = orderMap[sectionName] ?? 0
  const target = allSections[idx]
  if (!target || target.index === undefined) return null
  return { content: target[0], start: target.index, end: target.index + target[0].length }
}

export async function editSiteSection(
  currentHtml: string,
  editRequest: string,
  context: { business: { name: string; type: string }; brandColor: string; directives?: SiteDirectives }
): Promise<string> {
  const sectionName = detectSection(editRequest)
  const extracted   = extractSection(currentHtml, sectionName)
  if (!extracted) return currentHtml

  const brandInt         = `0x${context.brandColor.replace("#", "")}`
  const constraintBlock  = context.directives ? buildConstraintBlock(context.directives) : ""

  const raw = await runAgent(
    `You are an expert frontend engineer making a targeted edit to a single HTML section.
Output ONLY the replacement section HTML — no explanation, no markdown fences, no surrounding page code.
${constraintBlock}
Preserve all CSS class naming conventions and design system from the original.
Replace BRAND_COLOR_PLACEHOLDER → ${context.brandColor} and BRAND_INT_PLACEHOLDER → ${brandInt}.`,
    `Business: ${context.business.name} (${context.business.type})
Edit request: "${editRequest}"
Target: ${sectionName} section

Current section HTML:
${extracted.content.slice(0, 6000)}

Rewrite this section to fulfill the edit request exactly.
Output ONLY the replacement section HTML — starting with <${sectionName === "nav" ? "nav" : sectionName === "footer" ? "footer" : "section"}.`,
    { model: "sonnet", maxTokens: 6000, jsonMode: false }
  ) as string

  const cleaned   = raw.replace(/^```(?:html)?\n?/i, "").replace(/\n?```$/i, "").trim()
  if (!cleaned || cleaned.length < 100) return currentHtml

  const processed = cleaned
    .replace(/BRAND_COLOR_PLACEHOLDER/g, context.brandColor)
    .replace(/BRAND_INT_PLACEHOLDER/g, brandInt)

  return currentHtml.slice(0, extracted.start) + processed + currentHtml.slice(extracted.end)
}

// ── #40 — CRO analysis + auto-fix ────────────────────────────────────────────

export async function runCROAnalysis(html: string, businessName: string): Promise<CROResult> {
  const issues: CROIssue[] = []

  // Heuristic checks (fast, no AI)
  if (!/<h1[\s\S]{0,400}(get|save|grow|free|start|discover|transform|your)/i.test(html)) {
    issues.push({ severity: "high", issue: "Hero headline doesn't lead with a benefit", fix: "Rewrite H1 to open with the primary customer benefit in the first 5 words" })
  }
  if (!/<a[\s\S]{0,60}btn-primary/.test(html.slice(0, 4000))) {
    issues.push({ severity: "critical", issue: "No primary CTA above the fold", fix: "Add a btn-primary CTA link inside the hero section" })
  }
  if (!/(4\.\d|5\.0|\d{2,}★|\d{3,}\+\s*(client|customer|review|project))/i.test(html.slice(0, 6000))) {
    issues.push({ severity: "high", issue: "No social proof visible early in page", fix: "Add star rating and client count to hero badges or just below hero" })
  }
  if (!/(tel:|phone|\(\d{3}\)|\d{3}[-.\s]\d{3})/i.test(html)) {
    issues.push({ severity: "medium", issue: "No phone number found", fix: "Add a phone number to the nav CTA and footer" })
  }
  if (!/<meta name="description"/i.test(html)) {
    issues.push({ severity: "medium", issue: "Missing meta description (SEO)", fix: "Add a meta description tag to the <head> element" })
  }

  if (issues.length === 0) return { issues: [], fixedHtml: html, score: 9.2 }

  try {
    const fixedRaw = await runAgent(
      "You are a CRO expert. Apply the listed fixes to this website HTML. Output ONLY the complete corrected HTML document.",
      `Business: ${businessName}
Fixes to apply:
${issues.map((iss, i) => `${i + 1}. [${iss.severity.toUpperCase()}] ${iss.fix}`).join("\n")}

Current HTML:
${html.slice(0, 9000)}
${html.length > 9000 ? "\n[HTML truncated — apply fixes to the sections above and reconstruct the full document]" : ""}

Output the complete fixed HTML.`,
      { model: "sonnet", maxTokens: 10000, jsonMode: false }
    ) as string

    const match    = fixedRaw.match(/(<!DOCTYPE[\s\S]+<\/html>)/i)
    const fixedHtml = match?.[1]?.trim() ?? html

    return { issues, fixedHtml, score: 8.5 }
  } catch {
    return { issues, fixedHtml: html, score: 7.5 }
  }
}

// ── #39 — Competitor analysis ─────────────────────────────────────────────────

export async function analyzeCompetitor(
  competitorUrl: string,
  business: { name: string; type: string }
): Promise<string> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 9000)

    const res = await fetch(competitorUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AutopilotSiteBuilder/1.0)", Accept: "text/html" },
      signal: controller.signal,
    })
    if (!res.ok) return ""

    const rawHtml = await res.text()
    const text = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000)

    const analysis = await runAgent(
      "You analyze competitor websites and return strategic intelligence to help a rival site outperform them.",
      `Competitor URL: ${competitorUrl}
Our business: ${business.name} (${business.type})

Competitor page text:
${text}

Extract:
1. Their main headline/value proposition
2. Sections they include
3. CTAs they use (exact wording if possible)
4. Weaknesses: what's generic, missing, or poorly written?
5. Three specific ways our site should outperform them (stronger copy, missing sections, better trust signals, clearer CTA)

Format as bullet points under each category.`,
      { model: "haiku", maxTokens: 900 }
    ) as string

    return `━━━ COMPETITOR INTELLIGENCE (${competitorUrl}) ━━━
${analysis}

DIRECTIVE: Your generated site MUST outperform this competitor on all five dimensions above.
Write stronger copy, include sections they're missing, and use more compelling CTAs.`
  } catch {
    return ""
  }
}

// ── Improvement pass ──────────────────────────────────────────────────────────

async function improveWebsite(
  html: string,
  score: number,
  business: { name: string; type: string },
  brandColor: string,
  brandInt: string,
  maxTokens: number,
  directives?: SiteDirectives
): Promise<string> {
  if (directives?.animationsEnabled === false) return html

  const checks = [
    !html.includes("ShaderMaterial")                                          && "Add ShaderMaterial GLSL shader to Three.js hero plane",
    !(html.includes("splitAndAnimate") || html.includes(".char"))             && "Add splitAndAnimate() letter-by-letter animation to hero headline and section headings",
    !html.includes("lerp(")                                                   && "Add lerp() smooth custom cursor",
    !html.includes("mapRange(")                                               && "Add mapRange() driving hero opacity from scroll position",
    !html.includes("IntersectionObserver")                                    && "Add IntersectionObserver [data-reveal] on all section headings and cards",
    !html.includes("ScrollTrigger")                                           && "Add GSAP ScrollTrigger stagger animations on every section",
    !(html.includes("WebGLRenderer") || html.includes("IcosahedronGeometry")) && "Add Three.js WebGL hero canvas with icosahedron",
    !(html.includes("page-loader") || html.includes("loader-bar"))           && "Add luxury page load sequence with animated percentage counter",
    !html.includes("magnetic")                                                && "Add magnetic button effect to all CTA buttons",
    !(html.includes("tilt-card") || html.includes("rotateY("))               && "Add 3D card tilt to service and testimonial cards",
    !(html.includes("h-track") || html.includes("h-scroll"))                 && "Add GSAP horizontal scroll section for services",
    !(html.includes("wipe-reveal") || html.includes("clip-path"))            && "Add clip-path wipe reveal to section headings",
    !html.includes("chip")                                                    && "Add chip label above every section heading",
    !html.includes("marquee")                                                 && "Add CSS marquee social proof bar",
    !html.includes("hamburger")                                               && "Add hamburger mobile menu",
    !html.includes("scrub")                                                   && "Add scrub:1 to GSAP ScrollTrigger for scroll-position-driven animation",
    html.length < 45000                                                       && "HTML too short — expand all sections with substantially more content",
  ].filter(Boolean) as string[]

  if (checks.length === 0) return html

  const improved = await runAgent(
    buildSystemPrompt(_qualityBaseline, _totalGenerated, directives),
    `Website for ${business.name} (${business.type}) scored ${score.toFixed(1)}/10.
Baseline: ${_qualityBaseline.toFixed(1)}/10 — must beat it.

ISSUES TO FIX:
${checks.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Current HTML (first 8000 chars — rewrite the complete document with all fixes):
${html.slice(0, 8000)}

SITE_TITLE: ${business.name} — [Subtitle]
SITE_SLUG: [slug]
SITE_HTML:
<!DOCTYPE html>
...complete improved document...
</html>`,
    { jsonMode: false, maxTokens, model: "sonnet" }
  )

  const result = extractResult(improved)
  return postProcess(result.html, brandColor, brandInt)
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GenerateWebsiteParams {
  business: {
    name:        string
    type:        string
    description: string
    location:    string
    phone?:      string | null
    website?:    string | null
  }
  brandVoice:         Record<string, unknown>
  brandColor:         string
  services:           string[]
  tagline?:           string
  reviews?:           Array<{ reviewerName: string; rating: number; reviewText: string }>
  researchContext?:   string
  // #1 #3 — command-driven
  directives?:        SiteDirectives
  // #17 — pre-generated shader
  shaderGlsl?:        string
  // #10 — style cloned from reference URL
  styleCloneContext?: string
  // #30 — vision analysis of reference image
  imageContext?:      string
  // #39 — competitor intelligence
  competitorContext?: string
  // #4 — diff editing
  currentHtml?:       string
  editSection?:       string
  // #40 — CRO pass
  runCRO?:            boolean
  // #36 — live business data
  businessLiveData?:  {
    leadCount:     number
    reviewCount:   number
    avgRating:     number
    recentContent: string[]
    totalRevenue?: string
  }
}

export interface GenerateWebsiteResult {
  html:                 string
  title:                string
  slug:                 string
  qualityScore:         number
  iterations:           number
  researchUsed:         boolean
  directives:           SiteDirectives | null
  complianceViolations: string[]
  croResult:            CROResult | null
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateWebsite(params: GenerateWebsiteParams): Promise<GenerateWebsiteResult> {
  const {
    business, brandColor, services, tagline, reviews = [],
    researchContext, directives, shaderGlsl, styleCloneContext,
    imageContext, competitorContext, currentHtml, editSection,
    runCRO, businessLiveData,
  } = params

  const brandInt = `0x${brandColor.replace("#", "")}`

  // #4 — Diff editing: skip full generation and edit only the target section
  if (editSection && currentHtml) {
    const editedHtml = await editSiteSection(currentHtml, editSection, {
      business: { name: business.name, type: business.type },
      brandColor,
      directives,
    })
    const violations = directives ? await verifyCompliance(editedHtml, directives) : []
    return {
      html: editedHtml, title: business.name, slug: makeSlug(business.name),
      qualityScore: 8.5, iterations: 1, researchUsed: false,
      directives: directives ?? null, complianceViolations: violations, croResult: null,
    }
  }

  const reviewText = reviews.length > 0
    ? reviews.slice(0, 4).map(r => `• ${r.reviewerName}: "${r.reviewText}" (${r.rating}/5)`).join("\n")
    : "(Generate 3 realistic testimonials from real-sounding clients in the business's city)"

  const serviceList = services.length > 0
    ? services.slice(0, 6).join(" | ")
    : `Core ${business.type} services`

  const contextParts: string[] = []

  if (researchContext) {
    contextParts.push(`━━━ RESEARCH & REAL BUSINESS DATA ━━━\nUse this real information — prefer it over generic content:\n${researchContext}`)
  }
  if (styleCloneContext) contextParts.push(styleCloneContext)
  if (imageContext)      contextParts.push(`━━━ REFERENCE IMAGE DESIGN INTENT ━━━\n${imageContext}`)
  if (competitorContext) contextParts.push(competitorContext)

  // #36 — Live business data
  if (businessLiveData) {
    const lines = ["━━━ LIVE BUSINESS DATA (embed in social proof and stats) ━━━"]
    if (businessLiveData.leadCount > 0)    lines.push(`• ${businessLiveData.leadCount} active leads in CRM`)
    if (businessLiveData.reviewCount > 0)  lines.push(`• ${businessLiveData.reviewCount} reviews, avg ${businessLiveData.avgRating.toFixed(1)}/5`)
    if (businessLiveData.totalRevenue)     lines.push(`• Revenue milestone: ${businessLiveData.totalRevenue}`)
    if (businessLiveData.recentContent.length > 0) {
      lines.push(`• Recent content topics: ${businessLiveData.recentContent.slice(0, 3).join(", ")}`)
    }
    lines.push("Use these real numbers in stat counters, hero badges, and social proof sections.")
    contextParts.push(lines.join("\n"))
  }

  // #38 — Agent-fed blog section
  if (businessLiveData?.recentContent && businessLiveData.recentContent.length >= 2) {
    contextParts.push(`━━━ BLOG SECTION (Content Factory output) ━━━
Add a blog preview section with these recent posts as cards (title, excerpt, Read More CTA):
${businessLiveData.recentContent.slice(0, 3).map((c, i) => `${i + 1}. ${c}`).join("\n")}`)
  }

  const combinedContext = contextParts.join("\n\n")

  const userPrompt = `Build a complete, award-winning website for this business using ALL 15 techniques from the system prompt.

BUSINESS:
Name: ${business.name}
Type: ${business.type}
Location: ${business.location || "Nationwide"}
Phone: ${business.phone || "(realistic local placeholder)"}
Tagline: ${tagline || "(generate a powerful specific tagline)"}
Brand Color: ${brandColor} → Three.js int: ${brandInt}
Services: ${serviceList}
${business.description ? `About: ${business.description}` : ""}

${combinedContext ? combinedContext + "\n" : ""}TESTIMONIALS:
${reviewText}

SUBSTITUTIONS:
  BRAND_COLOR_PLACEHOLDER → ${brandColor}
  BRAND_INT_PLACEHOLDER   → ${brandInt}
  DISPLAY_FONT            → best Google Font for "${business.type}"
  BODY_FONT               → matching body font

QUALITY: Must beat ${(_qualityBaseline + 0.2).toFixed(1)}/10. Include all 15 techniques, 9 sections (unless overridden), real copy, SEO meta tags + JSON-LD.

SITE_TITLE: ${business.name} — [Compelling Subtitle]
SITE_SLUG: ${makeSlug(business.name)}
SITE_HTML:
<!DOCTYPE html>
...complete website...
</html>`

  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY)
  const maxTokens    = hasAnthropic ? 12000 : 4000

  const raw   = await runAgent(
    buildSystemPrompt(_qualityBaseline, _totalGenerated, directives, shaderGlsl),
    userPrompt,
    { jsonMode: false, maxTokens, model: "sonnet" }
  )
  const pass1 = extractResult(raw)
  let   html  = postProcess(pass1.html, brandColor, brandInt)
  let   iterations = 1

  let qualityScore = await scoreGeneratedSite(html, business.name, business.type)

  if (qualityScore < _qualityBaseline && hasAnthropic) {
    const improved = await improveWebsite(
      html, qualityScore, business, brandColor, brandInt,
      Math.min(maxTokens, 10000), directives
    )
    if (improved.length > html.length * 0.6) {
      html = improved
      qualityScore = await scoreGeneratedSite(html, business.name, business.type)
      iterations = 2
    }
  }

  // #2 — Compliance check + patch
  const complianceViolations = directives ? await verifyCompliance(html, directives) : []

  if (complianceViolations.length > 0 && hasAnthropic) {
    try {
      const patchedRaw = await runAgent(
        buildSystemPrompt(_qualityBaseline, _totalGenerated, directives, shaderGlsl),
        `Fix these compliance violations in the generated site:
${complianceViolations.map((v, i) => `${i + 1}. ${v}`).join("\n")}

Current HTML (fix violations and output complete corrected site):
${html.slice(0, 8000)}

SITE_TITLE: ${pass1.title}
SITE_SLUG: ${pass1.slug}
SITE_HTML:
<!DOCTYPE html>...`,
        { jsonMode: false, maxTokens: Math.min(maxTokens, 10000), model: "sonnet" }
      )
      const patchResult = extractResult(patchedRaw)
      if (patchResult.html.length > html.length * 0.5) {
        html = postProcess(patchResult.html, brandColor, brandInt)
      }
    } catch {
      // Non-blocking
    }
  }

  raiseQualityBaseline(qualityScore)

  // #40 — CRO pass (optional)
  let croResult: CROResult | null = null
  if (runCRO) {
    try {
      croResult = await runCROAnalysis(html, business.name)
      if (croResult.fixedHtml && croResult.fixedHtml.length > html.length * 0.5) {
        html = croResult.fixedHtml
      }
    } catch {
      // Non-blocking
    }
  }

  return {
    html,
    title:        pass1.title,
    slug:         pass1.slug,
    qualityScore,
    iterations,
    researchUsed: !!(researchContext || styleCloneContext || imageContext || competitorContext),
    directives:   directives ?? null,
    complianceViolations,
    croResult,
  }
}

// ── Multi-page site generation ────────────────────────────────────────────────

export interface MultiPageSite {
  pages: Array<{ slug: string; title: string; html: string }>
  sharedDesignSystem: string
}

export async function generateMultiPageSite(params: GenerateWebsiteParams): Promise<MultiPageSite> {
  const home = await generateWebsite(params)

  const rootMatch = home.html.match(/:root\s*\{[\s\S]*?\}/)
  const sharedDesignSystem = rootMatch ? rootMatch[0] : ""

  const navMatch    = home.html.match(/<nav[\s\S]*?<\/nav>/i)
  const footerMatch = home.html.match(/<footer[\s\S]*?<\/footer>/i)
  const sharedNav    = navMatch    ? navMatch[0]    : ""
  const sharedFooter = footerMatch ? footerMatch[0] : ""

  const pageConfigs = [
    { slug: `${home.slug}-about`,    title: `${params.business.name} — About Us`,  focus: "about page: company story, team, values, mission.", section: "About" },
    { slug: `${home.slug}-services`, title: `${params.business.name} — Services`,  focus: "services page: detailed descriptions, pricing tiers, process, FAQs.", section: "Services" },
    { slug: `${home.slug}-contact`,  title: `${params.business.name} — Contact`,   focus: "contact page: form, phone, email, address, hours, map placeholder.", section: "Contact" },
  ]

  const pageResults = await Promise.allSettled(
    pageConfigs.map(async ({ slug, title, focus, section }) => {
      const raw = await runAgent(
        `You are an expert frontend engineer. Build a complete inner page matching the home page's design system.
Output EXACTLY:
PAGE_HTML:
<!DOCTYPE html>
[complete page]
</html>`,
        `Business: ${params.business.name} (${params.business.type})
Page: ${section} — ${focus}

SHARED CSS: ${sharedDesignSystem}
SHARED NAV: ${sharedNav.slice(0, 3000)}
SHARED FOOTER: ${sharedFooter.slice(0, 2000)}
RESEARCH: ${params.researchContext ?? "(none)"}

Build a complete, polished ${section} page. Same fonts, colors, CSS vars as home.
Link to home: <a href="index.html">Home</a>
Slug: ${slug}
Title: ${title}`,
        { model: "sonnet", maxTokens: 10000, jsonMode: false }
      ) as string

      const htmlStart = raw.indexOf("PAGE_HTML:")
      let pageHtml = htmlStart >= 0 ? raw.slice(htmlStart + 10).trim() : raw.trim()
      pageHtml = pageHtml.replace(/^```(?:html)?\n?/i, "").replace(/\n?```$/i, "").trim()
      return { slug, title, html: pageHtml }
    })
  )

  const pages: Array<{ slug: string; title: string; html: string }> = [
    { slug: home.slug, title: home.title, html: home.html },
  ]
  for (const result of pageResults) {
    if (result.status === "fulfilled") pages.push(result.value)
  }
  return { pages, sharedDesignSystem }
}
