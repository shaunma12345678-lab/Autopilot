import { runAgent } from "@/lib/claude"

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the world's best frontend engineer and brand designer. You build complete, self-contained HTML websites that rival the production quality of sites like Nike.com, Apple.com, and Fortune 500 company sites. Every site you build is:

1. Visually stunning — premium design with expert use of typography, whitespace, color, and depth
2. Fully functional — every interaction, animation, and scroll effect works perfectly
3. Self-contained — one complete HTML file, zero external dependencies except CDNs listed below
4. Mobile-perfect — flawless on every screen size
5. Error-free — all JavaScript executes without console errors

━━━ STRICT OUTPUT RULES ━━━
- Return ONLY valid JSON with ONE key: "html" — the complete HTML document
- Also include "title" (SEO page title) and "slug" (URL-friendly name)
- The html value must be a COMPLETE document: <!DOCTYPE html> through </html>
- NO markdown, NO code fences, NO explanation — raw JSON only
- Every <script> tag must be error-free. Test your logic before writing it.
- Handle all edge cases: null checks, try/catch around WebGL, feature detection

━━━ APPROVED CDN LIBRARIES ━━━
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
(Google Fonts via @import in <style>)

━━━ DESIGN SYSTEM (implement ALL of these) ━━━

CSS ARCHITECTURE:
- Use CSS custom properties: --color-brand, --color-brand-dark, --color-brand-light, --color-text, --color-text-muted, --color-bg, --color-bg-alt, --color-surface
- Derive brand variants: --color-brand-dark: color-mix(in srgb, var(--color-brand) 70%, black); etc.
- Typography scale using clamp(): h1: clamp(3rem, 7vw, 8rem), h2: clamp(2rem, 4vw, 4.5rem), h3: clamp(1.25rem, 2vw, 2rem)
- Spacing system: --space-xs through --space-2xl using multiples of 8px
- Consistent border-radius: --radius-sm: 8px, --radius-md: 16px, --radius-lg: 24px, --radius-xl: 48px
- Transitions: --transition-fast: 0.15s, --transition-base: 0.3s, --transition-slow: 0.6s

FONTS: Choose ONE premium pairing from:
- Display: "Playfair Display" (luxury/premium) + body: "Inter"
- Display: "Bebas Neue" (bold/athletic) + body: "Barlow"
- Display: "Space Grotesk" (tech/modern) + body: "DM Sans"
- Display: "Cormorant Garamond" (elegant) + body: "Montserrat"

━━━ REQUIRED SECTIONS (all 9) ━━━

1. NAV — sticky, transparent on hero then solid on scroll. Logo left, links center, CTA button right. Hamburger on mobile with animated drawer.

2. HERO — Full-viewport, split layout OR centered. Three.js canvas as background (see WebGL specs). Large headline, subheadline, 2 CTAs. Trust badges below CTAs (awards, years in business, rating).

3. SOCIAL PROOF BAR — Logo strip or stats bar scrolling across: "Trusted by 500+ clients" / "4.9★ rating" / "$50M in revenue generated" etc. Use marquee or CSS animation.

4. SERVICES/PRODUCTS — 3–6 cards in a CSS grid. Each card: icon/emoji, title, 2-line description, "Learn more →" link. On hover: lift + glow shadow using brand color + 20% opacity. Background: glass morphism (backdrop-filter: blur(20px)).

5. ABOUT/STORY — Two-column section: left = large bold stat column (3 impressive numbers with labels, animated count-up); right = brand story paragraph + secondary CTA.

6. PROCESS/HOW IT WORKS — 3–4 numbered steps in a horizontal flow (vertical on mobile). Step number in brand color circle, title, description.

7. TESTIMONIALS — 3 testimonial cards with: quote, name, title/company, 5-star rating. Subtle card background, brand-colored quote mark.

8. CTA SECTION — Full-width bold section with brand color background (or dark bg). Large headline, one CTA button. Optional: subtle pattern overlay or geometric shapes.

9. FOOTER — Dark background. Logo + tagline left. 3–4 link columns. Bottom bar with copyright + social icons.

━━━ WEBGL SPECIFICATION ━━━

HERO CANVAS (required, graceful degradation):
\`\`\`
const canvas = document.getElementById('hero-canvas');
try {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
  camera.position.z = 5;

  // LIGHTING
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 5, 5);
  scene.add(dirLight);
  const pointLight = new THREE.PointLight(BRAND_HEX_AS_NUMBER, 2, 10);
  scene.add(pointLight);

  // MAIN 3D OBJECT — choose IcosahedronGeometry, TorusKnotGeometry, or OctahedronGeometry
  const geo = new THREE.IcosahedronGeometry(1.5, 1);
  const mat = new THREE.MeshPhongMaterial({ color: BRAND_HEX_AS_NUMBER, shininess: 100, specular: 0xffffff });
  const mesh = new THREE.Mesh(geo, mat);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.08 });
  const wire = new THREE.Mesh(geo, wireMat);
  scene.add(mesh, wire);

  // PARTICLE SYSTEM
  const particles = new THREE.BufferGeometry();
  const count = 600;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 10;
  particles.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(particles, new THREE.PointsMaterial({ color: BRAND_HEX_AS_NUMBER, size: 0.015, transparent: true, opacity: 0.6 })));

  // MOUSE + ANIMATION
  let mx = 0, my = 0, tx = 0, ty = 0;
  document.addEventListener('mousemove', e => { mx = (e.clientX/window.innerWidth-0.5)*2; my = -(e.clientY/window.innerHeight-0.5)*2; });

  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.005;
    tx += (mx * 0.5 - tx) * 0.05;
    ty += (my * 0.5 - ty) * 0.05;
    mesh.rotation.y = t + tx;
    mesh.rotation.x = t * 0.4 + ty;
    wire.rotation.copy(mesh.rotation);
    pointLight.position.set(Math.sin(t)*3, Math.cos(t)*2, 3);
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
} catch(e) {
  canvas.style.background = 'linear-gradient(135deg, BRAND_COLOR, #1a1a2e)';
}
\`\`\`

━━━ REQUIRED JS FEATURES ━━━

GSAP SCROLL ANIMATIONS (use ScrollTrigger):
\`\`\`
gsap.registerPlugin(ScrollTrigger);
// Fade + slide up for every section
gsap.utils.toArray('.reveal').forEach(el => {
  gsap.from(el, { opacity: 0, y: 60, duration: 0.8, ease: 'power2.out',
    scrollTrigger: { trigger: el, start: 'top 85%' }
  });
});
// Stagger cards
gsap.utils.toArray('.card').forEach((card, i) => {
  gsap.from(card, { opacity: 0, y: 40, duration: 0.6, delay: i * 0.1, ease: 'power2.out',
    scrollTrigger: { trigger: card, start: 'top 90%' }
  });
});
\`\`\`

NUMBER COUNTER (for stats):
\`\`\`
function animateCount(el) {
  const target = parseInt(el.dataset.target);
  const suffix = el.dataset.suffix || '';
  let current = 0;
  const increment = target / 80;
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = Math.floor(current).toLocaleString() + suffix;
  }, 16);
}
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { animateCount(e.target); observer.unobserve(e.target); } });
}, { threshold: 0.5 });
document.querySelectorAll('[data-target]').forEach(el => observer.observe(el));
\`\`\`

NAV SCROLL BEHAVIOR:
\`\`\`
const nav = document.querySelector('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 80);
});
\`\`\`

━━━ CSS QUALITY REQUIREMENTS ━━━

- Zero horizontal overflow on any screen size
- All images use aspect-ratio + object-fit: cover
- Buttons: padding 14px 32px, border-radius var(--radius-xl), font-weight 700, letter-spacing 0.02em
- Interactive elements: cursor: pointer, transform on hover, will-change: transform for performance
- Service cards: glass morphism background, 1px solid rgba(255,255,255,0.1), hover: translateY(-8px) + box-shadow
- Consistent section padding: padding: clamp(4rem, 10vw, 9rem) clamp(1.5rem, 5vw, 5rem)
- Color palette: dark sections alternate with light sections for visual rhythm
- All text must meet WCAG AA contrast ratio

━━━ CONTENT QUALITY ━━━
- Write real, compelling marketing copy — not placeholder text
- Headlines use power words: "Elite", "Proven", "Trusted", "Transformative", "Unmatched"
- Stats should feel real and impressive: "2,400+ Projects Delivered", "98% Client Retention", "$120M Revenue Generated"
- CTAs are action-oriented: "Get Your Free Quote", "Start Your Project", "See Our Work"
- Testimonials sound like real customers from real companies`

// ── Slug generator ─────────────────────────────────────────────────────────────

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site"
}

// ── Robust JSON extractor (handles markdown fences Claude occasionally adds) ────

function extractResult(raw: unknown): { html: string; title: string; slug: string } {
  // If already parsed correctly
  if (raw && typeof raw === "object" && "html" in (raw as object)) {
    const r = raw as Record<string, string>
    return { html: r.html, title: r.title ?? "Website", slug: r.slug ?? "site" }
  }
  // If returned as a string, try to extract JSON
  const text = typeof raw === "string" ? raw : JSON.stringify(raw)
  const match = text.match(/\{[\s\S]*"html"[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch { /* fall through */ }
  }
  throw new Error("Could not parse website generation result")
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

  const reviewText = reviews.length > 0
    ? reviews.slice(0, 5).map(r => `• ${r.reviewerName}: "${r.reviewText}" (${r.rating}/5 stars)`).join("\n")
    : "Generate 3 compelling placeholder testimonials from realistic-sounding clients."

  const serviceList = services.length > 0
    ? services.join(" | ")
    : `Core ${business.type} services`

  // Convert hex color to Three.js integer for the WebGL spec
  const hexNum = `0x${brandColor.replace("#", "")}`

  const userPrompt = `Build an ENTERPRISE-GRADE, award-winning website for this business.

━━━ BUSINESS BRIEF ━━━
Name: ${business.name}
Type: ${business.type}
Description: ${business.description || `${business.type} based in ${business.location}`}
Location: ${business.location || "Nationwide"}
Phone: ${business.phone || "(555) 000-0000 — write a realistic placeholder"}
Website: ${business.website || "#"}
Tagline: ${tagline || "Generate a powerful, memorable tagline"}
Brand Color: ${brandColor} (Three.js hex integer: ${hexNum})
Services: ${serviceList}

Customer Testimonials:
${reviewText}

━━━ EXECUTION REQUIREMENTS ━━━

1. REPLACE every instance of BRAND_HEX_AS_NUMBER in the WebGL code with: ${hexNum}
2. REPLACE every instance of BRAND_COLOR with: "${brandColor}"
3. Choose the Google Fonts pairing that best fits this business type: ${business.type}
4. Generate compelling, specific copy for ${business.name} — not generic filler
5. Use the brand color ${brandColor} as the primary accent throughout (buttons, borders, highlights, icon backgrounds)
6. Implement ALL 9 required sections
7. Implement ALL required JavaScript (GSAP, WebGL, counters, nav scroll, mobile menu)
8. Service cards for: ${serviceList}
9. Make stat numbers feel earned and real for a ${business.type}

━━━ OUTPUT FORMAT ━━━
Return exactly this JSON structure (no markdown, no fences):
{"html":"<!DOCTYPE html>...[complete document]...</html>","title":"${business.name} — [Compelling Subtitle]","slug":"${makeSlug(business.name)}"}`

  const raw = await runAgent(SYSTEM_PROMPT, userPrompt, {
    jsonMode:  true,
    maxTokens: 16000,
    model:     "sonnet",
  })

  return extractResult(raw)
}
