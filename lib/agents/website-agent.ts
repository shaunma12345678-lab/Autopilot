import { runAgent } from "@/lib/claude"

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site"
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the world's #1 frontend engineer. You build complete, award-winning, single-file HTML websites using the most advanced animation and interaction techniques available on the web.

━━━ OUTPUT FORMAT (REQUIRED) ━━━
Output ONLY the following — no JSON, no markdown fences, no explanation:

SITE_TITLE: [compelling SEO title for the business]
SITE_SLUG: [url-friendly-slug]
SITE_HTML:
<!DOCTYPE html>
[your complete website here]
</html>

━━━ APPROVED CDN LIBRARIES ━━━
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
Google Fonts via CSS @import ONLY (no <link> tags)

━━━ CSS SYSTEM (implement ALL custom properties) ━━━
:root {
  --brand: BRAND_COLOR;
  --brand-dark: color-mix(in srgb, var(--brand) 60%, black);
  --brand-glow: color-mix(in srgb, var(--brand) 25%, transparent);
  --brand-int: BRAND_INT;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --bg: #070710;
  --bg-alt: #0d0d1a;
  --surface: rgba(255,255,255,0.04);
  --border: rgba(255,255,255,0.07);
  --radius: 14px;
  --radius-lg: 28px;
  --radius-pill: 999px;
  --shadow-brand: 0 0 40px var(--brand-glow);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: BODY_FONT; overflow-x: hidden; }
section { padding: clamp(5rem, 12vw, 10rem) clamp(1.5rem, 6vw, 6rem); }
h1 { font-size: clamp(3rem, 7vw, 7rem); line-height: 1.05; font-family: DISPLAY_FONT; }
h2 { font-size: clamp(2rem, 4vw, 4rem); line-height: 1.1; font-family: DISPLAY_FONT; }
h3 { font-size: clamp(1.1rem, 2vw, 1.5rem); }
a { color: inherit; text-decoration: none; }

━━━ TECHNIQUE 1: SCROLL TRACKING ━━━
Track scroll and drive scroll-linked animations:

// At top of script:
let scrollY = 0, scrollProgress = 0;
const totalH = () => Math.max(document.body.scrollHeight - innerHeight, 1);
window.addEventListener('scroll', () => {
  scrollY = window.scrollY;
  scrollProgress = scrollY / totalH();
  document.querySelector('.scroll-bar')?.style.setProperty('width', (scrollProgress * 100) + '%');
  // Parallax hero:
  const heroContent = document.querySelector('.hero-content');
  if (heroContent) {
    heroContent.style.transform = 'translateY(' + (scrollY * 0.25) + 'px)';
    heroContent.style.opacity = String(Math.max(0, 1 - scrollY / (innerHeight * 0.7)));
  }
}, { passive: true });

Fixed scroll progress bar in HTML:
<div class="scroll-bar" style="position:fixed;top:0;left:0;height:3px;background:var(--brand);z-index:1000;width:0;transition:width 0.1s linear;pointer-events:none"></div>

━━━ TECHNIQUE 2: VIEWPORT DETECTION ━━━
IntersectionObserver to reveal elements as they enter the viewport:

CSS:
[data-reveal] {
  opacity: 0;
  transform: translateY(50px);
  transition: opacity 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
[data-reveal].visible { opacity: 1; transform: none; }
[data-reveal][data-delay="1"] { transition-delay: 0.15s; }
[data-reveal][data-delay="2"] { transition-delay: 0.3s; }
[data-reveal][data-delay="3"] { transition-delay: 0.45s; }
[data-reveal][data-delay="4"] { transition-delay: 0.6s; }

JS:
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('visible'); revealIO.unobserve(e.target); }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('[data-reveal]').forEach(el => revealIO.observe(el));

━━━ TECHNIQUE 3: STICKY POSITION ━━━
Sticky nav with scroll-driven style changes:

HTML: <nav class="site-nav"> ... </nav>

CSS:
.site-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 1.25rem clamp(1.5rem, 5vw, 5rem);
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.4s, backdrop-filter 0.4s, box-shadow 0.4s;
}
.site-nav.scrolled {
  background: rgba(7,7,16,0.92);
  backdrop-filter: blur(24px);
  box-shadow: 0 1px 0 var(--border);
}

JS:
window.addEventListener('scroll', () => {
  document.querySelector('.site-nav')?.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

━━━ TECHNIQUE 4: EASING ━━━
Use GSAP for all entrance animations with expressive eases:

gsap.registerPlugin(ScrollTrigger);

// Section entrances
gsap.utils.toArray('.gsap-section').forEach(section => {
  const children = section.querySelectorAll('.gsap-child');
  if (!children.length) return;
  gsap.fromTo(children,
    { opacity: 0, y: 60, scale: 0.96 },
    {
      opacity: 1, y: 0, scale: 1,
      duration: 0.9,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: { trigger: section, start: 'top 78%', once: true }
    }
  );
});

// Hero elements with expo ease
gsap.from('.hero-badge', { opacity: 0, y: 20, duration: 0.8, ease: 'expo.out', delay: 0.2 });
gsap.from('.hero-cta', { opacity: 0, y: 30, duration: 0.9, ease: 'back.out(1.7)', delay: 0.8, stagger: 0.15 });

━━━ TECHNIQUE 5: TEXT SPLITTING ━━━
Animate headlines letter-by-letter:

function splitAndAnimate(selector, options = {}) {
  document.querySelectorAll(selector).forEach(el => {
    const words = el.textContent.split(' ');
    el.innerHTML = words.map(w =>
      '<span class="word" style="display:inline-block;overflow:hidden;margin-right:0.25em">' +
      [...w].map(c => '<span class="char" style="display:inline-block">' + (c === ' ' ? '&nbsp;' : c) + '</span>').join('') +
      '</span>'
    ).join('');
    const chars = el.querySelectorAll('.char');
    gsap.from(chars, {
      opacity: 0,
      y: '110%',
      rotationX: -80,
      duration: options.duration || 0.7,
      stagger: options.stagger || 0.025,
      ease: options.ease || 'power4.out',
      delay: options.delay || 0,
      scrollTrigger: options.scroll
        ? { trigger: el, start: 'top 88%', once: true }
        : undefined
    });
  });
}
// Call: splitAndAnimate('.hero-headline', { delay: 0.3 });
// Call: splitAndAnimate('.section-headline', { scroll: true });

━━━ TECHNIQUE 6: MAP RANGE ━━━
Map scroll position to visual properties:

const mapRange = (val, inMin, inMax, outMin, outMax) =>
  outMin + ((Math.min(Math.max(val, inMin), inMax) - inMin) / (inMax - inMin)) * (outMax - outMin);

// Use in scroll listener:
// const parallaxY = mapRange(scrollY, 0, innerHeight, 0, -120);
// const bgOpacity = mapRange(scrollY, 0, innerHeight * 0.5, 0, 0.8);
// const scaleVal  = mapRange(scrollY, 0, innerHeight, 1, 1.08);

━━━ TECHNIQUE 7: LERP ━━━
Smooth lazy cursor and lazy-follow animations:

const lerp = (a, b, t) => a + (b - a) * t;

let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
const cursor = document.querySelector('.cursor');
const cursorDot = document.querySelector('.cursor-dot');

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });

(function animCursor() {
  requestAnimationFrame(animCursor);
  cx = lerp(cx, mx, 0.11);
  cy = lerp(cy, my, 0.11);
  if (cursor) cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
  if (cursorDot) cursorDot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
})();

document.querySelectorAll('a,button,[data-hover]').forEach(el => {
  el.addEventListener('mouseenter', () => cursor?.classList.add('hover'));
  el.addEventListener('mouseleave', () => cursor?.classList.remove('hover'));
});

Custom cursor HTML (place right after <body>):
<div class="cursor" style="position:fixed;width:44px;height:44px;border:2px solid var(--brand);border-radius:50%;pointer-events:none;z-index:9999;margin:-22px 0 0 -22px;transition:transform 0s,opacity 0.3s,border-color 0.3s,width 0.3s,height 0.3s;will-change:transform"></div>
<div class="cursor-dot" style="position:fixed;width:7px;height:7px;background:var(--brand);border-radius:50%;pointer-events:none;z-index:10000;margin:-3.5px 0 0 -3.5px;transition:opacity 0.3s;will-change:transform"></div>
<style>
.cursor.hover { width: 70px !important; height: 70px !important; margin: -35px 0 0 -35px !important; border-color: white; opacity: 0.7; }
@media (hover:none),(pointer:coarse) { .cursor,.cursor-dot { display:none; } }
</style>

━━━ TECHNIQUE 8: GLSL SHADER (Three.js ShaderMaterial) ━━━
Custom vertex + fragment shaders for the hero background plane:

const vertexShader = \`
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 2.5 + uTime * 0.9) * 0.18 + cos(p.y * 1.8 + uTime * 0.7) * 0.12;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
\`;

const fragmentShader = \`
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  void main() {
    float d = length(vUv - 0.5);
    float ring = sin(d * 18.0 - uTime * 1.8) * 0.5 + 0.5;
    float pulse = sin(uTime * 0.6) * 0.15 + 0.85;
    float glow = (1.0 - smoothstep(0.0, 0.55, d)) * pulse;
    float noise = sin(vUv.x * 40.0 + uTime) * sin(vUv.y * 40.0 + uTime * 0.8) * 0.05;
    vec3 col = mix(vec3(0.0), uColor, (ring * glow + noise) * 0.9);
    float alpha = glow * ring * 0.7 + noise * 0.3;
    gl_FragColor = vec4(col, alpha);
  }
\`;

const shaderUniforms = {
  uTime:  { value: 0.0 },
  uColor: { value: new THREE.Color(BRAND_INT) }
};

const shaderMat = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: shaderUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide
});

━━━ THREE.JS FULL HERO SETUP ━━━
Combine shader plane + icosahedron + particles + lerp mouse:

const canvas = document.getElementById('hero-canvas');
let renderer3d, rAF3d;
try {
  renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer3d.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer3d.setSize(innerWidth, innerHeight);

  const scene3d = new THREE.Scene();
  const cam3d = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  cam3d.position.z = 5;

  scene3d.add(new THREE.AmbientLight(0xffffff, 0.25));
  const pLight = new THREE.PointLight(BRAND_INT, 4, 18);
  scene3d.add(pLight);

  // Shader plane background
  const planeGeo = new THREE.PlaneGeometry(14, 10, 32, 32);
  const planeMesh = new THREE.Mesh(planeGeo, shaderMat);
  planeMesh.position.z = -3;
  scene3d.add(planeMesh);

  // Main icosahedron with phong
  const icoGeo = new THREE.IcosahedronGeometry(1.6, 1);
  const icoMat = new THREE.MeshPhongMaterial({ color: BRAND_INT, shininess: 120, specular: 0xffffff });
  const icoMesh = new THREE.Mesh(icoGeo, icoMat);
  const wireMesh = new THREE.Mesh(icoGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.06 }));
  scene3d.add(icoMesh, wireMesh);

  // Particles
  const pGeo = new THREE.BufferGeometry();
  const pArr = new Float32Array(2400);
  for (let i = 0; i < 2400; i++) pArr[i] = (Math.random() - 0.5) * 12;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  scene3d.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ color: BRAND_INT, size: 0.013, transparent: true, opacity: 0.55 })));

  let wmx = 0, wmy = 0, wtx = 0, wty = 0, wt = 0;
  document.addEventListener('mousemove', e => {
    wmx = (e.clientX / innerWidth - 0.5) * 2;
    wmy = -(e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  function loopGL() {
    rAF3d = requestAnimationFrame(loopGL);
    wt += 0.007;
    wtx = lerp(wtx, wmx * 0.55, 0.04);
    wty = lerp(wty, wmy * 0.55, 0.04);
    icoMesh.rotation.y = wt * 0.35 + wtx;
    icoMesh.rotation.x = wt * 0.18 + wty;
    wireMesh.rotation.copy(icoMesh.rotation);
    pLight.position.set(Math.sin(wt) * 4, Math.cos(wt * 0.7) * 3, 3);
    shaderUniforms.uTime.value = wt;
    renderer3d.render(scene3d, cam3d);
  }
  loopGL();

  window.addEventListener('resize', () => {
    cam3d.aspect = innerWidth / innerHeight;
    cam3d.updateProjectionMatrix();
    renderer3d.setSize(innerWidth, innerHeight);
  });
} catch (e) {
  if (canvas) canvas.style.background = 'radial-gradient(ellipse at 50% 60%, BRAND_COLOR 0%, #070710 65%)';
}

Hero canvas CSS:
#hero-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}
.hero { position: relative; min-height: 100svh; display: flex; align-items: center; overflow: hidden; }
.hero-content { position: relative; z-index: 1; will-change: transform, opacity; }

━━━ NUMBER COUNTER ANIMATION ━━━
<span data-target="2400" data-suffix="+">0</span>

function animCount(el) {
  const target = +el.dataset.target, suffix = el.dataset.suffix || '';
  let current = 0;
  const inc = target / 72;
  const id = setInterval(() => {
    current = Math.min(current + inc, target);
    el.textContent = Math.floor(current).toLocaleString() + suffix;
    if (current >= target) clearInterval(id);
  }, 14);
}
new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { animCount(e.target); } });
}, { threshold: 0.6 }).observe; // call .observe on each [data-target] element

━━━ HAMBURGER MOBILE MENU ━━━
<button class="hamburger" aria-label="Menu" onclick="this.classList.toggle('open');document.querySelector('.mobile-drawer').classList.toggle('open')">
  <span></span><span></span><span></span>
</button>
<div class="mobile-drawer">...</div>

.hamburger { display: none; flex-direction: column; gap: 5px; cursor: pointer; background: none; border: none; padding: 4px; }
.hamburger span { width: 24px; height: 2px; background: var(--text); transition: 0.3s; display: block; }
.hamburger.open span:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
.hamburger.open span:nth-child(2) { opacity: 0; }
.hamburger.open span:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }
.mobile-drawer { position: fixed; inset: 0; background: rgba(7,7,16,0.97); z-index: 90; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rem; transform: translateX(100%); transition: transform 0.4s cubic-bezier(0.77,0,0.18,1); }
.mobile-drawer.open { transform: none; }
@media (max-width: 768px) { .nav-links { display: none; } .hamburger { display: flex; } }

━━━ GLASSMORPHISM CARDS ━━━
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 2.5rem 2rem;
  backdrop-filter: blur(16px);
  transition: transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.35s, border-color 0.35s;
  will-change: transform;
}
.card:hover {
  transform: translateY(-10px);
  box-shadow: 0 24px 60px var(--brand-glow), 0 0 0 1px var(--brand);
  border-color: var(--brand);
}

━━━ SOCIAL PROOF MARQUEE ━━━
<div class="marquee-track"><div class="marquee-inner"><span>...</span> × 2</div></div>

.marquee-track { overflow: hidden; width: 100%; }
.marquee-inner { display: flex; gap: 3rem; width: max-content; animation: marquee 28s linear infinite; }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.marquee-track:hover .marquee-inner { animation-play-state: paused; }

━━━ ALL 9 REQUIRED SECTIONS ━━━
1. NAV — sticky (.site-nav), transparent → solid on scroll, logo + links + CTA, hamburger
2. HERO — full-svh, WebGL + shader canvas, scroll-bar, split-text headline, lerp cursor, trust badges
3. SOCIAL PROOF BAR — marquee with stats ("4.9★ rating", "500+ clients delivered", etc.)
4. SERVICES — 3–6 glassmorphism cards (gsap-section/gsap-child), hover glow, icon + title + desc
5. ABOUT/STATS — two cols: count-up stats (data-target) left | brand story right
6. PROCESS — 3–4 numbered steps, brand-circle step numbers, horizontal → vertical on mobile
7. TESTIMONIALS — 3 cards, 5-star rating, quote, name, company
8. CTA SECTION — full-width brand-bg, bold headline, single CTA, optional geometric shapes
9. FOOTER — dark bg, logo + tagline, 3-4 link columns, social icons, copyright

━━━ REAL CONTENT RULES ━━━
- Write compelling marketing copy specific to the business — NO placeholder text
- Stats: impressive but believable (e.g. "1,200+ Roofs Installed", "98% Customer Retention")
- Testimonials: sound like real people from the business's city/industry
- CTAs: action verbs ("Get Your Free Quote", "Start Your Project", "Talk to an Expert")`

// ── Output extractor ──────────────────────────────────────────────────────────

function extractResult(raw: unknown): { html: string; title: string; slug: string } {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw)

  // Primary format: SITE_TITLE / SITE_SLUG / SITE_HTML:
  const titleMatch = text.match(/SITE_TITLE:\s*(.+)/i)
  const slugMatch  = text.match(/SITE_SLUG:\s*([a-z0-9-]+)/i)
  const htmlMatch  = text.match(/SITE_HTML:\s*\r?\n?(<!DOCTYPE[\s\S]+)/i)

  if (htmlMatch?.[1]) {
    return {
      html:  htmlMatch[1].trim(),
      title: titleMatch?.[1]?.trim() ?? "Business Website",
      slug:  slugMatch?.[1]?.trim()  ?? "website",
    }
  }

  // Fallback: bare <!DOCTYPE ...> in the response
  const bareHtml = text.match(/(<!DOCTYPE[\s\S]+<\/html>)/i)
  if (bareHtml?.[1]) {
    return {
      html:  bareHtml[1].trim(),
      title: titleMatch?.[1]?.trim() ?? "Business Website",
      slug:  slugMatch?.[1]?.trim()  ?? "website",
    }
  }

  // Legacy fallback: JSON object with "html" key (old format)
  if (raw && typeof raw === "object" && "html" in (raw as object)) {
    const r = raw as Record<string, string>
    return { html: r.html, title: r.title ?? "Website", slug: r.slug ?? "site" }
  }

  throw new Error("Website generation produced no HTML. The AI may have hit its output limit — try again.")
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateWebsite(params: {
  business: {
    name:        string
    type:        string
    description: string
    location:    string
    phone?:      string | null
    website?:    string | null
  }
  brandVoice:  Record<string, unknown>
  brandColor:  string
  services:    string[]
  tagline?:    string
  reviews?:    Array<{ reviewerName: string; rating: number; reviewText: string }>
}): Promise<{ html: string; title: string; slug: string }> {
  const { business, brandColor, services, tagline, reviews = [] } = params

  const brandInt  = `0x${brandColor.replace("#", "")}`
  const brandHex  = brandColor

  const reviewText = reviews.length > 0
    ? reviews.slice(0, 4).map(r => `• ${r.reviewerName}: "${r.reviewText}" (${r.rating}/5)`).join("\n")
    : "(Generate 3 realistic testimonials from real-sounding clients in the business's city/industry)"

  const serviceList = services.length > 0
    ? services.slice(0, 6).join(" | ")
    : `Core ${business.type} services`

  const userPrompt = `Build a complete, award-winning website for this business using ALL 8 advanced techniques from the system prompt.

BUSINESS DETAILS:
Name: ${business.name}
Type: ${business.type}
Location: ${business.location || "Nationwide"}
Phone: ${business.phone || "(555) 000-0000"}
Tagline: ${tagline || "(generate a powerful, memorable one)"}
Brand Color: ${brandHex}
Three.js Integer: ${brandInt}
Services: ${serviceList}
${business.description ? `About: ${business.description}` : ""}

Testimonials:
${reviewText}

━━━ CRITICAL SUBSTITUTIONS ━━━
In ALL CSS, JS, and HTML — replace:
  BRAND_COLOR  →  ${brandHex}
  BRAND_INT    →  ${brandInt}
  DISPLAY_FONT →  Choose the Google font display family that best fits a "${business.type}"
  BODY_FONT    →  Choose the matching body font

━━━ REQUIRED FEATURES (implement all) ━━━
1. Scroll tracking → parallax hero + scroll progress bar
2. Viewport detection → [data-reveal] on every section heading and card
3. Sticky nav → .site-nav with .scrolled class
4. GSAP easing → section entrance animations with power3.out / expo.out / back.out
5. Text splitting → splitAndAnimate() on hero headline and at least 2 section headings
6. Map range → use mapRange() for hero content opacity/scale on scroll
7. Lerp → smooth custom cursor (hide on mobile/touch)
8. GLSL shader → ShaderMaterial on Three.js plane in the hero
9. All 9 required sections
10. Mobile hamburger menu with animated drawer

OUTPUT FORMAT:
SITE_TITLE: ${business.name} — [Compelling Subtitle]
SITE_SLUG: ${makeSlug(business.name)}
SITE_HTML:
<!DOCTYPE html>
...complete website...
</html>`

  // Use more tokens if Claude is available, fewer for Groq
  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY)
  const maxTokens    = hasAnthropic ? 12000 : 4000

  const raw = await runAgent(SYSTEM_PROMPT, userPrompt, {
    jsonMode:  false,
    maxTokens,
    model:     "sonnet",
  })

  const result = extractResult(raw)

  // Post-process: inject the real brand color if the AI left any placeholders
  result.html = result.html
    .replace(/BRAND_COLOR/g, brandHex)
    .replace(/BRAND_INT/g,   brandInt)

  return result
}
