import { runAgent } from "@/lib/claude"
import { scoreGeneratedSite } from "@/lib/agents/site-researcher"
import {
  T, selectTechniques, planSections, buildTechniqueBlock,
  type SectionType, type TechniqueKey,
} from "@/lib/agents/technique-library"

// silence unused import warning — T is referenced via buildTechniqueBlock
void T

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site"
}

// ── Quality baseline ──────────────────────────────────────────────────────────

let _qualityBaseline = 8.0
let _totalGenerated  = 0

export function getQualityBaseline(): number { return _qualityBaseline }
export function getGenerationCount():  number { return _totalGenerated }

export function raiseQualityBaseline(score: number): void {
  _totalGenerated++
  if (score > _qualityBaseline) _qualityBaseline = Math.min(9.9, _qualityBaseline + 0.15)
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

export interface CROIssue { severity: "critical" | "high" | "medium"; issue: string; fix: string }
export interface CROResult { issues: CROIssue[]; fixedHtml: string; score: number }

// ── #1 Command parser ─────────────────────────────────────────────────────────

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
      `Extract website design directives from user messages. Return ONLY valid JSON.`,
      `User: "${userMessage}"
Return: {"darkMode":bool/null,"animationsEnabled":bool/null,"fontStyle":"serif"|"sans"|"mono"|"display"|null,"layout":"centered"|"wide"|"asymmetric"|"split"|null,"sections":[],"colorScheme":{"primary":null,"bg":null,"text":null},"tone":"luxury"|"corporate"|"playful"|"minimal"|"bold"|"professional"|null,"heroType":"video"|"3d"|"image"|"text-only"|"split"|null,"mustInclude":[],"mustExclude":[],"scrollBehavior":"smooth"|"scrub"|"snap"|null,"animationDirectives":[],"shaderEffect":"aurora"|"water"|"plasma"|"galaxy"|"fire"|null,"targetAudience":null}`,
      { model: "haiku", maxTokens: 500, jsonMode: true }
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
  } catch { return defaults }
}

// ── #3 Constraint block ───────────────────────────────────────────────────────

function buildConstraintBlock(d: SiteDirectives, shaderGlsl?: string): string {
  const rules: string[] = []
  if (d.darkMode === true)  rules.push("Background MUST be dark (#070710) — NO light sections")
  if (d.darkMode === false) rules.push("LIGHT THEME: white background, dark text. Override all dark defaults.")
  if (d.animationsEnabled === false) rules.push("NO JS animations — static HTML/CSS only. Remove GSAP, WebGL, cursor JS.")
  if (d.fontStyle === "serif")   rules.push("Use Cormorant Garamond or Playfair Display for headings.")
  if (d.fontStyle === "sans")    rules.push("Use Inter or Plus Jakarta Sans for all text.")
  if (d.fontStyle === "mono")    rules.push("Use JetBrains Mono for headings — technical aesthetic.")
  if (d.fontStyle === "display") rules.push("Use Bebas Neue or Syne for headings.")
  if (d.sections.length > 0)    rules.push(`SECTIONS: exactly these in order — ${d.sections.join(", ")}`)
  if (d.colorScheme.primary)    rules.push(`Override --brand with: ${d.colorScheme.primary}`)
  if (d.tone === "luxury")      rules.push("Tone: ultra-luxury. Generous whitespace, refined copy, no exclamation marks.")
  if (d.tone === "playful")     rules.push("Tone: playful. Rounded shapes, bright pops, friendly copy.")
  if (d.tone === "minimal")     rules.push("Tone: radical minimalism. Max whitespace, single accent, sparse copy.")
  if (d.tone === "corporate")   rules.push("Tone: professional. Trust signals prominent, conservative vocabulary.")
  if (d.heroType === "text-only") rules.push("Hero: typography only — no WebGL canvas.")
  if (d.mustInclude.length > 0) rules.push(`MUST INCLUDE: ${d.mustInclude.join("; ")}`)
  if (d.mustExclude.length > 0) rules.push(`MUST NOT INCLUDE: ${d.mustExclude.join("; ")}`)
  if (d.targetAudience)         rules.push(`Target audience: ${d.targetAudience}`)
  if (d.animationDirectives.length > 0) {
    rules.push(`ANIMATION DIRECTIVES:\n${d.animationDirectives.map((a,i)=>`  ${i+1}. ${a}`).join("\n")}`)
  }
  if (d.shaderEffect && shaderGlsl) {
    rules.push(`CUSTOM SHADER: replace default rings fragment shader with:\n\`\`\`glsl\n${shaderGlsl}\n\`\`\``)
  } else if (d.shaderEffect) {
    rules.push(`CUSTOM SHADER: generate GLSL for "${d.shaderEffect}" effect — aurora/water/plasma/galaxy/fire.`)
  }
  if (rules.length === 0) return ""
  return `━━━ MANDATORY USER REQUIREMENTS ━━━\n${rules.map((r,i)=>`${i+1}. ${r}`).join("\n")}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
}

// ── Font pair lookup ──────────────────────────────────────────────────────────

function getFontPair(businessType: string): { import: string; display: string; body: string } {
  const t = businessType.toLowerCase()
  if (/luxury|real estate|interior|jewelry|fashion|boutique|couture/i.test(t))
    return { import: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Jost:wght@300;400;500&display=swap", display: "Cormorant Garamond", body: "Jost" }
  if (/construction|roofing|hvac|plumbing|electric|auto|security|contractor/i.test(t))
    return { import: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap", display: "Bebas Neue", body: "Plus Jakarta Sans" }
  if (/saas|software|tech|ai|startup|app|platform|dev/i.test(t))
    return { import: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500&display=swap", display: "Space Grotesk", body: "Inter" }
  if (/agency|design|creative|studio|media|film|branding/i.test(t))
    return { import: "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&display=swap", display: "Syne", body: "DM Sans" }
  if (/law|legal|finance|consulting|insurance|accounting/i.test(t))
    return { import: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Source+Sans+3:wght@400;600&display=swap", display: "Playfair Display", body: "Source Sans 3" }
  if (/restaurant|cafe|food|dining|bakery|wellness|spa|yoga|fitness/i.test(t))
    return { import: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap", display: "DM Serif Display", body: "DM Sans" }
  return { import: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;0,9..144,900&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap", display: "Fraunces", body: "Plus Jakarta Sans" }
}

// ── Section system prompt (lean — uses technique library references) ──────────

function buildSectionSystemPrompt(
  techniques: TechniqueKey[],
  directives: SiteDirectives | undefined,
  shaderGlsl: string | undefined,
  brandColor: string,
  font: { display: string; body: string },
): string {
  const constraints = directives ? buildConstraintBlock(directives, shaderGlsl) : ""
  const techBlock   = buildTechniqueBlock(techniques)

  return `You are the world's best frontend engineer — you build single sections of award-winning websites.

Sites to match in quality: Linear (linear.app), Framer (framer.com), Vercel (vercel.com), Igloo Inc (Awwwards SOTY 2024), Active Theory, Stripe.

${constraints}━━━ CSS VARIABLES IN USE ━━━
--brand: ${brandColor}; --brand-dark: color-mix(in srgb,var(--brand) 62%,black); --brand-glow: color-mix(in srgb,var(--brand) 22%,transparent); --brand-subtle: color-mix(in srgb,var(--brand) 8%,transparent);
--text: #f1f5f9; --text-muted: #8892a4; --bg: #070710; --bg-alt: #0c0c1a; --surface: rgba(255,255,255,.035); --border: rgba(255,255,255,.06);
--radius: 12px; --radius-lg: 24px; --radius-pill: 999px; --shadow-brand: 0 0 60px var(--brand-glow);
--font-display: '${font.display}', serif; --font-body: '${font.body}', sans-serif;

━━━ TYPOGRAPHY STANDARDS ━━━
h1: font-family:var(--font-display); font-size:clamp(4.5rem,11vw,13rem); line-height:.92; letter-spacing:-.04em; font-weight:700
h2: font-family:var(--font-display); font-size:clamp(3rem,6.5vw,8rem); line-height:.95; letter-spacing:-.03em; font-weight:700
h3: font-family:var(--font-display); font-size:clamp(1.5rem,2.8vw,2.5rem); line-height:1.1; letter-spacing:-.02em
p: font-family:var(--font-body); font-size:clamp(.975rem,1.1vw,1.05rem); line-height:1.75; color:var(--text-muted)
.text-gradient: background:linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand) 55%,#fff)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text
.text-outline: -webkit-text-stroke:1.5px currentColor; color:transparent; opacity:.35
.overline: font-family:var(--font-body); font-size:.6rem; letter-spacing:.3em; text-transform:uppercase; font-weight:600; color:var(--brand); display:inline-block; margin-bottom:1.2rem
.chip: same as overline but with border:1px solid var(--brand) and background:var(--brand-subtle) and padding:.3rem 1rem

Hero headline MUST use two-line split: line 1 = <span class="text-outline">, line 2 = <span class="text-gradient">
All section headings use class="section-headline wipe-reveal"
Body text uses class="reveal-blur" on paragraphs
Generous section padding: clamp(7rem,14vw,14rem) top/bottom

━━━ BUTTON STYLES ━━━
.btn-primary: background:var(--brand); color:#fff; padding:.875rem 2.2rem; border-radius:var(--radius-pill); font-family:var(--font-body); font-weight:700; font-size:.95rem; letter-spacing:.02em; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:.5rem; transition:transform .25s,box-shadow .25s,filter .25s; will-change:transform
.btn-primary:hover: transform:translateY(-2px) scale(1.02); box-shadow:var(--shadow-brand); filter:brightness(1.1)
.btn-ghost: transparent; border:1.5px solid var(--border); hover: border-color:var(--brand); background:var(--brand-glow)
.card: background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:2.5rem 2rem; backdrop-filter:blur(14px); transition:transform .35s,box-shadow .35s,border-color .35s
.card:hover: transform:translateY(-10px); box-shadow:0 28px 70px var(--brand-glow),0 0 0 1px var(--brand); border-color:var(--brand)

━━━ TECHNIQUE REFERENCE ━━━
${techBlock}

━━━ OUTPUT RULES ━━━
- Output ONLY the HTML for the requested section — no <html>, <head>, <body>, <style>, or <script> wrappers
- Use all CSS vars listed above — never hardcode hex colors
- Add class="gsap-section" to every section, class="gsap-item" to every card/item within
- Add [data-reveal] and [data-delay="1/2/3"] to headings and paragraphs
- Add .wipe-reveal to section headings
- Write CONCISE production code — no comments, no blank lines between CSS rules in inline styles
- Real, specific copy — no filler. Real numbers. No "world-class" or "passionate about"
- ★★★★★ means five actual star characters, not the word "stars"
- Section output must be complete and fully realized — every element described in the plan`
}

// ── Design system generator (CSS + JS — one focused call) ─────────────────────

async function generateDesignCss(params: {
  business: { name: string; type: string; location: string }
  brandColor: string
  tagline: string | undefined
  font: { import: string; display: string; body: string }
  techniques: TechniqueKey[]
  directives: SiteDirectives | undefined
}): Promise<string> {
  const { business, brandColor, font, techniques, directives } = params
  const brandInt = `0x${brandColor.replace("#","")}`

  const raw = await runAgent(
    `You generate the complete CSS and JavaScript design system for a premium website.
Output ONLY a raw <style> block followed by CDN <script> tags — no HTML sections, no explanation.
The CSS and JS you output will be placed in the <head> and at the end of <body> respectively.`,
    `Business: ${business.name} (${business.type})
Brand color: ${brandColor} (Three.js int: ${brandInt})
Display font: '${font.display}' | Body font: '${font.body}'
Font import: @import url('${font.import}');

Generate:
1. <style> block containing:
   - @import for both Google Fonts
   - :root { all CSS variables }
   - Base reset: *, html, body, section, h1, h2, h3, p, a, img
   - h1: clamp(4.5rem,11vw,13rem) / line-height:.92 / letter-spacing:-.04em / font-family:var(--font-display) / font-weight:700
   - h2: clamp(3rem,6.5vw,8rem) / line-height:.95 / letter-spacing:-.03em / same font
   - h3: clamp(1.5rem,2.8vw,2.5rem) / line-height:1.1 / letter-spacing:-.02em
   - p: clamp(.975rem,1.1vw,1.05rem) / line-height:1.75 / color:var(--text-muted) / font-family:var(--font-body)
   - section padding: clamp(7rem,14vw,14rem) clamp(1.5rem,6vw,7rem)
   - .text-gradient (brand→white clip-text), .text-outline (-webkit-text-stroke:1.5px), .overline, .chip
   - .btn-primary, .btn-ghost, .btn-arrow .arr, .btn-arrow:hover .arr
   - .card, .card:hover, .tilt-card
   - .site-nav, .site-nav.scrolled, .nav-links, .nav-links a::after, .hamburger, .mobile-nav
   - .marquee, .marquee-inner, @keyframes marquee
   - [data-reveal], [data-reveal].in-view, [data-reveal][data-delay="1/2/3/4"]
   - .wipe-reveal, .wipe-reveal.in-view, .section-headline::after, .section-headline.in-view::after
   - .cursor, .cursor-dot, .cursor-label, .cursor.hover, .cursor.has-label
   - .h-section, .h-track, .h-card
   - .asym-grid, .asym-section:nth-child(odd/even) rules
   - .pricing-grid, .pricing-card, .pricing-card.popular, .pricing-card.popular::before, .plan-price, .plan-features
   - .timeline, .timeline-svg, .tl-line, .tl-step, .tl-num, .tl-line.drawn
   - body::after grain texture (SVG noise, opacity:.22, mix-blend-mode:overlay, z-index:9997, pointer-events:none)
   - Mobile: @media(max-width:768px) responsive overrides for grid, nav, pricing, h_scroll
   - @media(max-width:900px) for asym-grid

2. Three <script> tags: Three.js, GSAP, ScrollTrigger CDN
   <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>

Directives override: ${directives ? JSON.stringify({darkMode:directives.darkMode,tone:directives.tone,colorScheme:directives.colorScheme}) : "none"}
${directives?.darkMode === false ? "LIGHT THEME: use #fafafa for --bg, #0f172a for --text, adjust surface/border for light mode" : ""}`,
    { model: "sonnet", maxTokens: 6000, jsonMode: false }
  ) as string

  return raw.trim()
}

// ── Per-section HTML generator ────────────────────────────────────────────────

const SECTION_INSTRUCTIONS: Record<SectionType, string> = {
  nav: `Generate the STICKY NAV section. Use the NAV technique. Include: logo (business name in display font), nav-links (3-4 real links), .btn-primary.magnetic.nav-cta, hamburger, mobile-nav overlay. The nav must use class="site-nav" and respond to .scrolled class with backdrop-filter.`,

  hero: `Generate the HERO section — the most important section. Requirements:
- min-height:100svh, display:flex, align-items:center
- <canvas id="hero-canvas"> as position:absolute background
- .hero-content with position:relative z-index:1
- .overline text (real credibility signal, not generic)
- <h1 class="hero-headline">: TWO LINES — line 1 as <span class="text-outline">, line 2 as <span class="text-gradient">. Make the headline bold, specific, 3-5 words per line.
- <p class="hero-sub reveal-blur">: ONE sentence. Specific differentiator. No filler.
- .hero-cta-row with .btn-primary.magnetic.btn-arrow and .btn-ghost
- .hero-badges: 3 real specific stats using display font at 2.2rem (e.g. "3,200+" "4.9★" "18yrs")
- Add data-cursor-text="EXPLORE" to the hero section
- Include the WebGL canvas setup using SHADER technique with BRAND_INT placeholder`,

  proof: `Generate the SOCIAL PROOF BAR using the MARQUEE technique. Items: star rating, project count, revenue/impact number, awards or recognition. Duplicate items for seamless loop. Position between hero and next section.`,

  services: `Generate the SERVICES section using H_SCROLL technique (horizontal pinned scroll). 4-5 service cards, each a .h-card.tilt-card.card with: icon (SVG or emoji), service name as h3, 2-line description, specific outcome/benefit, and "Learn More →" link. Use business-specific real services. Add data-cursor-text="DRAG" to .h-track.`,

  features: `Generate the FEATURES section using ASYMMETRIC technique. 3-4 features alternating left/right. Each feature: icon, h3, p describing the specific capability, stat or proof point. Use .asym-section structure. Add .reveal-blur to paragraphs.`,

  about: `Generate the ABOUT section. Split layout: left side has .overline + h2.section-headline.wipe-reveal + 2 paragraphs.reveal-blur + .btn-ghost. Right side: styled card with a compelling stat or quote in large display font. Make the copy specific — mention the city, years in business, specific credentials. No "passionate about" clichés.`,

  stats: `Generate the STATS section. Full-width dark band with 3-4 count-up stats using [data-target][data-suffix][data-prefix] pattern. Each stat: large number in display font, descriptor label in overline style. Stats should be specific and impressive but believable for the business.`,

  process: `Generate the PROCESS section using SVG_TIMELINE technique (for service/trade businesses) OR numbered asymmetric steps. 4 steps max. Each step: two-digit number in display font at large size (opacity:.2), step title as h3, specific one-sentence description. The process should describe the real customer journey, not generic steps.`,

  testimonials: `Generate the TESTIMONIALS section. 3 testimonial cards (.tilt-card.card). Each: ★★★★★ (five real stars), blockquote with specific outcome ("Saved us $4,200 on our energy bill"), person name + last initial, city + business type (e.g. "Mike T. · Phoenix homeowner"), and optionally a company/context label. Make testimonials sound specific and human, not AI-generated.`,

  pricing: `Generate the PRICING section using the PRICING technique. 3 tiers appropriate for the business. Center card gets .popular class. Include monthly/annual toggle. Prices must be realistic for the industry. Feature lists must be specific and differentiated between tiers.`,

  gallery: `Generate the GALLERY section. CSS grid of 6-8 image placeholders (div with gradient backgrounds using brand color variations, aspect-ratio:4/3 or 1/1). Add data-cursor-text="VIEW" to each. Caption each with a specific project/product name. Section headline uses wipe-reveal.`,

  team: `Generate the TEAM section. 3-4 team member cards (.tilt-card.card). Each: avatar placeholder (circle with initials in display font), name, title, 1-sentence bio with a specific credential. Professional and real-sounding.`,

  cta: `Generate the CTA section — the conversion section. Full-width, uses a gradient or the brand color as background. Large h2 with the core offer. Subheading adds urgency or specificity. ONE primary CTA button (.magnetic). Optional: phone number or "no commitment" reassurance line. This must make people want to click.`,

  footer: `Generate the FOOTER. 4 columns: logo+tagline+social links | service links | company links | contact details (address, phone, email). Copyright bar. All links have .footer-links hover animation. Social icons as SVG. Business-specific contact details (use realistic placeholders if not provided).`,

  faq: `Generate the FAQ section. 5-7 accordion-style Q&A items. Questions should be REAL objections a potential customer would have. Answers must be specific, confident, and overcome the objection. Implement with CSS details/summary or JS toggle with smooth height animation.`,

  locations: `Generate the LOCATIONS / SERVICE AREA section. Map placeholder (styled div with brand gradient), list of specific cities/areas served, business hours, contact details for the primary location. Real-looking and specific.`,

  results: `Generate the RESULTS / CASE STUDIES section. 2-3 result cards. Each: client industry/type, specific problem, specific outcome with real numbers ("Increased revenue 34% in 90 days"), testimonial excerpt. Use brand color accent on the outcome numbers.`,
}

async function generateSectionHtml(
  sectionType: SectionType,
  params: {
    business: { name: string; type: string; location: string; phone?: string | null; description: string }
    brandColor: string
    brandInt: string
    services: string[]
    tagline: string | undefined
    reviews: Array<{ reviewerName: string; rating: number; reviewText: string }>
    font: { display: string; body: string }
    techniques: TechniqueKey[]
    directives: SiteDirectives | undefined
    shaderGlsl: string | undefined
    researchContext: string | undefined
    competitorContext: string | undefined
    businessLiveData?: { leadCount: number; reviewCount: number; avgRating: number; recentContent: string[] }
  }
): Promise<string> {
  const { business, brandColor, brandInt, services, tagline, reviews, font, techniques, directives, shaderGlsl, researchContext, competitorContext, businessLiveData } = params

  const systemPrompt = buildSectionSystemPrompt(techniques, directives, shaderGlsl, brandColor, font)

  const reviewBlock = reviews.length > 0
    ? reviews.slice(0,4).map(r=>`• ${r.reviewerName}: "${r.reviewText}" (${r.rating}/5)`).join("\n")
    : "(generate 3 specific real-sounding testimonials from the business's actual city)"

  const liveData = businessLiveData && businessLiveData.leadCount > 0
    ? `Live data: ${businessLiveData.leadCount} leads, ${businessLiveData.reviewCount} reviews avg ${businessLiveData.avgRating.toFixed(1)}/5`
    : ""

  const userPrompt = `${SECTION_INSTRUCTIONS[sectionType]}

Business: ${business.name}
Type: ${business.type}
Location: ${business.location || "Nationwide"}
Phone: ${business.phone || "(use realistic local placeholder)"}
Tagline: ${tagline || "(generate a specific powerful tagline)"}
Brand color: ${brandColor} | Three.js int: ${brandInt}
Display font: '${font.display}' | Body font: '${font.body}'
Services: ${services.slice(0,6).join(" | ") || "Core services"}
${business.description ? `About: ${business.description}` : ""}
${liveData}
Reviews: ${reviewBlock}
${researchContext ? `Research: ${researchContext.slice(0,800)}` : ""}
${competitorContext ? `Competitor intel: ${competitorContext.slice(0,400)}` : ""}

Output ONLY the HTML for the ${sectionType} section — starting with <section, <nav, or <footer. No <html>, <head>, <body>, <style> or <script> wrappers. Use all CSS vars. Make it exceptional.`

  const raw = await runAgent(systemPrompt, userPrompt, {
    model: "sonnet", maxTokens: 6000, jsonMode: false,
  }) as string

  return raw.replace(/^```(?:html)?\n?/i,"").replace(/\n?```$/i,"").trim()
}

// ── JS block generator (all technique JS combined) ────────────────────────────

async function generateSharedJs(params: {
  business: { name: string; type: string }
  brandColor: string
  brandInt: string
  techniques: TechniqueKey[]
  sections: SectionType[]
  directives: SiteDirectives | undefined
}): Promise<string> {
  const { business, brandColor, brandInt, techniques, sections, directives } = params

  if (directives?.animationsEnabled === false) return ""

  const raw = await runAgent(
    `Generate a complete JavaScript block for a website. Output ONLY raw JavaScript — no <script> tags, no explanation.
The JS uses these techniques: ${techniques.join(", ")}.
The page has these sections: ${sections.join(", ")}.
CSS variables and DOM elements are already in the page.`,
    `Business: ${business.name} (${business.type})
Brand color: ${brandColor} | Three.js int: ${brandInt}

Generate ONE complete JavaScript block that includes ALL of the following (in order):
1. lerp helper: const lerp=(a,b,t)=>a+(b-a)*t;
2. mapRange helper: const mapRange=(v,a,b,c,d)=>c+((Math.min(Math.max(v,a),b)-a)/(b-a))*(d-c);
3. Scroll progress bar + hero parallax + nav scrolled state (SCROLL_BAR technique)
4. IntersectionObserver for [data-reveal] elements (REVEAL technique)
5. Cursor lerp animation + context-aware label from data-cursor-text (CURSOR technique)
6. GSAP registerPlugin(ScrollTrigger) + section entrance animations (GSAP technique)
7. revealWords() function + call on .hero-headline (delay .25) and .section-headline (scroll:true) (KINETIC_TYPE)
8. Blur reveal on .reveal-blur elements
9. Magnetic button effect on .magnetic elements (MAGNETIC)
10. 3D card tilt on .tilt-card elements (TILT)
11. IntersectionObserver for .wipe-reveal elements (WIPE)
12. Count-up animation for [data-target] elements (MICRO)
13. Scroll scrub: hero exit (scrub 1.5), section headings (scrub 1), cards (scrub 1) (SCRUB)
${sections.includes("services") || sections.includes("gallery") ? "14. GSAP horizontal scroll for .h-track (H_SCROLL)" : ""}
${sections.includes("pricing") ? "15. Pricing toggle: monthly/annual button swap (PRICING)" : ""}
${sections.includes("process") ? "16. SVG timeline line draw on scroll (.tl-line.drawn)" : ""}
17. Three.js WebGL hero: scene + camera + ShaderMaterial plane + IcosahedronGeometry + wireframe + particles + PointLight + animation loop with lerp mouse rotation. Brand int: ${brandInt}. Wrap in try/catch — fallback: canvas.style.background='radial-gradient(ellipse at 50% 55%,${brandColor} 0%,#070710 68%)'
18. Page loader: var l=document.getElementById('page-loader'); ... (LOADER technique JS — pure CSS exit, 5s fallback)

Write complete, working JavaScript. No comments. Minified style is fine.`,
    { model: "sonnet", maxTokens: 6000, jsonMode: false }
  ) as string

  return raw.replace(/^```(?:javascript|js)?\n?/i,"").replace(/\n?```$/i,"").trim()
}

// ── HTML assembler ────────────────────────────────────────────────────────────

function assembleHtml(params: {
  business: { name: string; type: string; location: string; phone?: string | null }
  brandColor: string
  font: { import: string; display: string; body: string }
  designCss: string
  sections: Array<{ type: SectionType; html: string }>
  sharedJs: string
  title: string
  slug: string
}): string {
  const { business, brandColor, designCss, sections, sharedJs, title, slug } = params

  const metaDesc = `${business.name} — professional ${business.type.toLowerCase()} in ${business.location || "your area"}. Contact us today.`

  const sectionHtml = sections.map(s => s.html).join("\n\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${metaDesc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:type" content="website">
<meta name="theme-color" content="${brandColor}">
${designCss}
</head>
<body>
${sectionHtml}
<script>
${sharedJs}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"${business.name}","description":"${metaDesc}","telephone":"${business.phone || ""}","address":{"@type":"PostalAddress","addressLocality":"${business.location || ""}"},"url":"https://${slug}.autopilot.ai"}
</script>
</body>
</html>`
}

// ── #17 Shader generator ──────────────────────────────────────────────────────

export async function generateCustomShader(effectName: string): Promise<string> {
  try {
    const glsl = await runAgent(
      `Generate GLSL fragment shader code only. No explanation. No markdown.
Requirements: varying vec2 vUv; uniform float uTime; uniform vec3 uColor; output gl_FragColor.
Animate with uTime. Use uColor for brand tinting. No texture samplers. Max 5 loop iterations.`,
      `Effect: "${effectName}" — for a dark business website hero background. Output only GLSL.`,
      { model: "haiku", maxTokens: 600, jsonMode: false }
    ) as string
    return glsl.replace(/^```(?:glsl|c|cpp)?\n?/i,"").replace(/\n?```$/i,"").trim()
  } catch { return "" }
}

// ── #2 Compliance verifier ────────────────────────────────────────────────────

export async function verifyCompliance(html: string, directives: SiteDirectives): Promise<string[]> {
  const violations: string[] = []
  if (directives.darkMode === false && /(--bg:\s*#0[0-2]|background:\s*#0[0-2])/i.test(html))
    violations.push("DARK_BG: Light theme requested but dark background detected")
  if (directives.animationsEnabled === false && /gsap\.|ScrollTrigger|WebGLRenderer/i.test(html))
    violations.push("ANIMATIONS_FOUND: Animations disabled but GSAP/WebGL code found")
  for (const item of directives.mustExclude) {
    const kw = item.toLowerCase().split(/\s+/)[0]
    if (kw.length > 3 && html.toLowerCase().includes(kw))
      violations.push(`MUST_EXCLUDE: "${item}" found in HTML but excluded by user`)
  }
  return violations
}

// ── #4 Diff section editor ────────────────────────────────────────────────────

const SECTION_MAP: Record<string, SectionType> = {
  nav: "nav", navigation: "nav", header: "nav", menu: "nav",
  hero: "hero", banner: "hero", headline: "hero",
  proof: "proof", marquee: "proof", trust: "proof",
  services: "services", offerings: "services", "what we do": "services",
  features: "features",
  about: "about", story: "about", company: "about",
  process: "process", "how it works": "process", steps: "process",
  testimonials: "testimonials", reviews: "testimonials",
  pricing: "pricing", plans: "pricing", packages: "pricing",
  cta: "cta", "call to action": "cta", contact: "cta",
  footer: "footer",
}

function detectSection(editRequest: string): SectionType {
  const lower = editRequest.toLowerCase()
  for (const [kw, sec] of Object.entries(SECTION_MAP)) {
    if (lower.includes(kw)) return sec
  }
  return "hero"
}

function extractSectionHtml(html: string, sectionType: SectionType): { content: string; start: number; end: number } | null {
  if (sectionType === "nav") {
    const m = html.match(/<nav[\s\S]*?<\/nav>/i)
    if (!m || m.index === undefined) return null
    return { content: m[0], start: m.index, end: m.index + m[0].length }
  }
  if (sectionType === "footer") {
    const m = html.match(/<footer[\s\S]*?<\/footer>/i)
    if (!m || m.index === undefined) return null
    return { content: m[0], start: m.index, end: m.index + m[0].length }
  }
  const allSections = [...html.matchAll(/<section[\s\S]*?<\/section>/gi)]
  const orderMap: Record<string, number> = { hero:0,proof:1,services:2,features:2,about:3,stats:3,process:4,testimonials:5,pricing:5,gallery:4,cta:6 }
  const idx = orderMap[sectionType] ?? 0
  const target = allSections[idx]
  if (!target || target.index === undefined) return null
  return { content: target[0], start: target.index, end: target.index + target[0].length }
}

export async function editSiteSection(
  currentHtml: string,
  editRequest: string,
  context: { business: { name: string; type: string }; brandColor: string; directives?: SiteDirectives }
): Promise<string> {
  const sectionType = detectSection(editRequest)
  const extracted   = extractSectionHtml(currentHtml, sectionType)
  if (!extracted) return currentHtml

  const font    = getFontPair(context.business.type)
  const techniques = selectTechniques(context.business.type, [sectionType], context.directives?.animationsEnabled ?? null)
  const sysPrompt  = buildSectionSystemPrompt(techniques, context.directives, undefined, context.brandColor, font)
  const brandInt   = `0x${context.brandColor.replace("#","")}`

  const raw = await runAgent(sysPrompt,
    `Edit request: "${editRequest}"
Business: ${context.business.name} (${context.business.type})
Brand color: ${context.brandColor} | Int: ${brandInt}

Current ${sectionType} HTML:
${extracted.content.slice(0,5000)}

Rewrite this section to fulfill the edit request. Output ONLY the replacement HTML.`,
    { model: "sonnet", maxTokens: 5000, jsonMode: false }
  ) as string

  const cleaned = raw.replace(/^```(?:html)?\n?/i,"").replace(/\n?```$/i,"").trim()
  if (!cleaned || cleaned.length < 100) return currentHtml

  return currentHtml.slice(0, extracted.start) + cleaned + currentHtml.slice(extracted.end)
}

// ── #40 CRO analysis ──────────────────────────────────────────────────────────

export async function runCROAnalysis(html: string, businessName: string): Promise<CROResult> {
  const issues: CROIssue[] = []
  if (!/<h1[\s\S]{0,400}(get|save|grow|free|start|discover|transform|your)/i.test(html))
    issues.push({ severity: "high", issue: "Hero headline doesn't lead with a benefit", fix: "Rewrite H1 to open with the primary customer benefit in the first 5 words" })
  if (!/<a[\s\S]{0,60}btn-primary/.test(html.slice(0,4000)))
    issues.push({ severity: "critical", issue: "No primary CTA above the fold", fix: "Add btn-primary CTA inside hero section" })
  if (!/(4\.\d|5\.0|\d{2,}★|\d{3,}\+\s*(client|customer|review|project))/i.test(html.slice(0,6000)))
    issues.push({ severity: "high", issue: "No social proof early in page", fix: "Add star rating and client count to hero badges" })
  if (!/(tel:|phone|\(\d{3}\)|\d{3}[-.\s]\d{3})/i.test(html))
    issues.push({ severity: "medium", issue: "No phone number found", fix: "Add phone number to nav and footer" })
  if (!/<meta name="description"/i.test(html))
    issues.push({ severity: "medium", issue: "Missing meta description", fix: "Add meta description to <head>" })
  if (issues.length === 0) return { issues: [], fixedHtml: html, score: 9.2 }
  try {
    const fixedRaw = await runAgent(
      "CRO expert. Apply all listed fixes to this HTML. Output ONLY the corrected HTML document.",
      `Business: ${businessName}\nFixes:\n${issues.map((iss,i)=>`${i+1}. ${iss.fix}`).join("\n")}\n\nHTML:\n${html.slice(0,9000)}`,
      { model: "sonnet", maxTokens: 10000, jsonMode: false }
    ) as string
    const match = fixedRaw.match(/(<!DOCTYPE[\s\S]+<\/html>)/i)
    return { issues, fixedHtml: match?.[1]?.trim() ?? html, score: 8.5 }
  } catch { return { issues, fixedHtml: html, score: 7.5 } }
}

// ── #39 Competitor analysis ───────────────────────────────────────────────────

export async function analyzeCompetitor(competitorUrl: string, business: { name: string; type: string }): Promise<string> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 9000)
    const res = await fetch(competitorUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal })
    if (!res.ok) return ""
    const rawHtml = await res.text()
    const text = rawHtml.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,5000)
    const analysis = await runAgent(
      "Analyze competitor websites. Extract intelligence to help a rival outperform them.",
      `Competitor: ${competitorUrl}\nOur business: ${business.name} (${business.type})\nText:\n${text}\n\nExtract: headline, sections, CTAs, weaknesses, 3 ways to outperform.`,
      { model: "haiku", maxTokens: 800 }
    ) as string
    return `━━━ COMPETITOR INTEL (${competitorUrl}) ━━━\n${analysis}\nDIRECTIVE: outperform this competitor on all dimensions above.`
  } catch { return "" }
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GenerateWebsiteParams {
  business: { name: string; type: string; description: string; location: string; phone?: string | null; website?: string | null }
  brandVoice:         Record<string, unknown>
  brandColor:         string
  services:           string[]
  tagline?:           string
  reviews?:           Array<{ reviewerName: string; rating: number; reviewText: string }>
  researchContext?:   string
  directives?:        SiteDirectives
  shaderGlsl?:        string
  styleCloneContext?: string
  imageContext?:      string
  competitorContext?: string
  currentHtml?:       string
  editSection?:       string
  runCRO?:            boolean
  businessLiveData?:  { leadCount: number; reviewCount: number; avgRating: number; recentContent: string[]; totalRevenue?: string }
}

export interface GenerateWebsiteResult {
  html: string; title: string; slug: string
  qualityScore: number; iterations: number; researchUsed: boolean
  directives: SiteDirectives | null; complianceViolations: string[]; croResult: CROResult | null
}

// ── Main export — section-by-section pipeline (Item A) ───────────────────────

export async function generateWebsite(params: GenerateWebsiteParams): Promise<GenerateWebsiteResult> {
  const { business, brandColor, services, tagline, reviews = [], researchContext,
    directives, shaderGlsl, styleCloneContext, imageContext, competitorContext,
    currentHtml, editSection, runCRO, businessLiveData } = params

  const brandInt = `0x${brandColor.replace("#","")}`

  // #4 — Diff edit: bypass full generation
  if (editSection && currentHtml) {
    const editedHtml = await editSiteSection(currentHtml, editSection, {
      business: { name: business.name, type: business.type },
      brandColor, directives,
    })
    const violations = directives ? await verifyCompliance(editedHtml, directives) : []
    return {
      html: editedHtml, title: business.name, slug: makeSlug(business.name),
      qualityScore: 8.5, iterations: 1, researchUsed: false,
      directives: directives ?? null, complianceViolations: violations, croResult: null,
    }
  }

  // ── Step 1: Plan sections by business type ──────────────────────────────────
  const sectionPlan = planSections(business.type, directives)

  // ── Step 2: Select techniques ───────────────────────────────────────────────
  const techniques = selectTechniques(business.type, sectionPlan, directives?.animationsEnabled ?? null)

  // ── Step 3: Font pair ───────────────────────────────────────────────────────
  const font = getFontPair(business.type)

  // ── Step 4: Research context merge ─────────────────────────────────────────
  const contextParts: string[] = []
  if (researchContext)    contextParts.push(researchContext)
  if (styleCloneContext)  contextParts.push(styleCloneContext)
  if (imageContext)       contextParts.push(imageContext)
  if (competitorContext)  contextParts.push(competitorContext)
  if (businessLiveData?.recentContent?.length) {
    contextParts.push(`Live content topics: ${businessLiveData.recentContent.slice(0,3).join(", ")}`)
  }
  const mergedContext = contextParts.join("\n\n").slice(0, 2000)

  const sectionParams = {
    business: { name: business.name, type: business.type, location: business.location, phone: business.phone, description: business.description },
    brandColor, brandInt, services,
    tagline, reviews,
    font: { display: font.display, body: font.body },
    techniques, directives, shaderGlsl,
    researchContext: mergedContext || undefined,
    competitorContext: competitorContext || undefined,
    businessLiveData,
  }

  // ── Step 5: Generate CSS design system ─────────────────────────────────────
  const designCss = await generateDesignCss({
    business: { name: business.name, type: business.type, location: business.location },
    brandColor, tagline, font, techniques, directives,
  })

  // ── Step 6: Generate sections in batches of 3 (rate-limit safe) ────────────
  const sectionResults: Array<{ type: SectionType; html: string }> = []

  for (let i = 0; i < sectionPlan.length; i += 3) {
    const batch = sectionPlan.slice(i, i + 3)
    const batchResults = await Promise.allSettled(
      batch.map(type => generateSectionHtml(type, sectionParams))
    )
    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j]
      sectionResults.push({
        type: batch[j],
        html: result.status === "fulfilled" ? result.value : `<section class="${batch[j]}-section"><p>Section generation failed — retry</p></section>`,
      })
    }
  }

  // ── Step 7: Generate shared JS ──────────────────────────────────────────────
  const sharedJs = await generateSharedJs({
    business: { name: business.name, type: business.type },
    brandColor, brandInt, techniques, sections: sectionPlan, directives,
  })

  // ── Step 8: Assemble ────────────────────────────────────────────────────────
  const title = `${business.name} — ${business.type} in ${business.location || "USA"}`
  const slug  = makeSlug(business.name)

  let html = assembleHtml({
    business: { name: business.name, type: business.type, location: business.location, phone: business.phone },
    brandColor, font, designCss,
    sections: sectionResults,
    sharedJs, title, slug,
  })

  // ── Step 9: Compliance check ────────────────────────────────────────────────
  const complianceViolations = directives ? await verifyCompliance(html, directives) : []

  // ── Step 10: Score ──────────────────────────────────────────────────────────
  const qualityScore = await scoreGeneratedSite(html, business.name, business.type)
  raiseQualityBaseline(qualityScore)

  // ── Step 11: CRO pass (optional) ────────────────────────────────────────────
  let croResult: CROResult | null = null
  if (runCRO) {
    try {
      croResult = await runCROAnalysis(html, business.name)
      if (croResult.fixedHtml && croResult.fixedHtml.length > html.length * 0.5) html = croResult.fixedHtml
    } catch { /* non-blocking */ }
  }

  return {
    html, title, slug, qualityScore, iterations: 1,
    researchUsed: !!(researchContext || styleCloneContext || imageContext || competitorContext),
    directives: directives ?? null, complianceViolations, croResult,
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
    { slug: `${home.slug}-about`,    title: `${params.business.name} — About`,    focus: "about page: story, team, values, credentials" },
    { slug: `${home.slug}-services`, title: `${params.business.name} — Services`, focus: "services page: descriptions, pricing, process, FAQ" },
    { slug: `${home.slug}-contact`,  title: `${params.business.name} — Contact`,  focus: "contact page: form, phone, email, address, hours, map" },
  ]

  const pageResults = await Promise.allSettled(
    pageConfigs.map(async ({ slug, title, focus }) => {
      const raw = await runAgent(
        `Build a complete inner page for an existing website. Same design system as home.
Output: PAGE_HTML:\n<!DOCTYPE html>\n[page]\n</html>`,
        `Business: ${params.business.name} (${params.business.type})\nFocus: ${focus}\nCSS: ${sharedDesignSystem}\nNav: ${sharedNav.slice(0,2000)}\nFooter: ${sharedFooter.slice(0,1500)}\nSlug: ${slug}\nTitle: ${title}`,
        { model: "sonnet", maxTokens: 8000, jsonMode: false }
      ) as string
      const htmlStart = raw.indexOf("PAGE_HTML:")
      let pageHtml = htmlStart >= 0 ? raw.slice(htmlStart + 10).trim() : raw.trim()
      pageHtml = pageHtml.replace(/^```(?:html)?\n?/i,"").replace(/\n?```$/i,"").trim()
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
