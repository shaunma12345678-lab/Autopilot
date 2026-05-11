import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an elite creative developer who builds STUNNING, award-winning websites for small businesses. You produce complete, self-contained HTML files that rival $50,000 agency sites — immersive 3D environments, interactive WebGL shaders, multi-layered scroll-triggered storytelling, and conversion-focused design.

Rules:
- Return ONLY valid JSON. No markdown, no code fences, no explanation.
- The "html" field must be a complete HTML document from <!DOCTYPE html> to </html>
- Load Three.js via CDN: <script src="https://unpkg.com/three@0.158.0/build/three.min.js"></script>
- Google Fonts @import at top of <style>
- All other CSS in a single <style> block — professional, mobile-responsive with flexbox/grid

Required advanced effects (ALL must be implemented):
1. THREE.js hero canvas — animated WebGL fragment shader background (fbm noise + plasma flow, colored from brandColor)
2. A rotating 3D object (TorusKnotGeometry or IcosahedronGeometry) with MeshPhongMaterial in the brand color, positioned in the hero
3. Particle system (400+ points via THREE.Points) floating around the hero
4. Mouse parallax — hero layers shift at different rates on mousemove (data-depth attributes)
5. The 3D object smoothly tracks the mouse (lerp camera/object position each frame)
6. Scroll-triggered section reveals using IntersectionObserver + CSS opacity/transform transitions
7. Smooth scroll behavior; sticky nav that changes background on scroll
8. Mobile graceful degradation: if WebGL context fails, show CSS gradient fallback on hero canvas
9. CTA buttons: gradient using brandColor, shimmer pseudo-element animation on hover
10. Typography: large clamp() headlines, clean body text

Sections (must all be included):
- Sticky nav with business name logo and anchor links
- Hero: full-viewport with WebGL canvas, headline, subheadline, two CTAs
- Services: card grid with hover lift + glow
- Stats/About: 3 impactful numbers + trust copy
- Reviews/Testimonials: cards with star ratings
- Contact: phone, email, contact form (visual only)
- Footer

Return valid JSON: { "html": "...", "title": "...", "slug": "..." }`

export async function generateWebsite(params: {
  business: {
    name: string
    type: string
    description: string
    location: string
    phone?: string | null
    website?: string | null
  }
  brandVoice: Record<string, unknown>
  brandColor: string
  services: string[]
  tagline?: string
  reviews?: Array<{ reviewerName: string; rating: number; reviewText: string }>
}): Promise<{ html: string; title: string; slug: string }> {
  const { business, brandVoice, brandColor, services, tagline, reviews = [] } = params

  const reviewsSection = reviews.length > 0
    ? reviews.map((r) => `- ${r.reviewerName} (${r.rating}/5): "${r.reviewText}"`).join("\n")
    : "No reviews yet — write placeholder testimonials that feel authentic."

  const userPrompt = `Build an immersive, award-winning website for:

Business Name: ${business.name}
Business Type: ${business.type}
Description: ${business.description}
Location: ${business.location}
Phone: ${business.phone ?? "N/A"}
Website URL: ${business.website ?? "N/A"}
Brand Voice: ${JSON.stringify(brandVoice)}
Brand Color: ${brandColor}
Tagline: ${tagline ?? "Generate a compelling tagline based on the business"}
Services (use all as cards): ${services.join(", ")}

Customer Reviews:
${reviewsSection}

THREE.js hero requirements:
1. Fragment shader using fbm noise — create animated plasma/energy flow using the brand color ${brandColor} as the primary hue. Include uTime, uResolution, and uMouse uniforms.
2. THREE.IcosahedronGeometry (radius 1.5, detail 1) with wireframe overlay (two meshes: solid MeshPhongMaterial + wireframe LineSegments) in the brand color
3. 500 particles in a sphere distribution, small white/brand-colored points
4. On each animation frame: icosahedron rotates slowly, mouse position gently tilts it via lerp, particles pulse with sine wave
5. renderer.setPixelRatio(Math.min(devicePixelRatio, 2)), transparent: true so CSS background shows through

Parallax layers in hero HTML:
- .layer-1 (deepest, barely moves): large blurred circle shapes
- .layer-2: headline text
- .layer-3: subheadline + CTAs (move most on mouse)
- JS: document.addEventListener('mousemove', e => { layers.forEach((el,i) => { const depth = i*3; el.style.transform = \`translate(\${mx*depth}px,\${my*depth}px)\`; }) })

Scroll storytelling:
- Each section fades + slides up via IntersectionObserver
- Stats counter animation: numbers count up when section enters viewport
- Service cards: stagger delay (0.1s, 0.2s, 0.3s...)

Return JSON (no markdown, no code fences):
{
  "html": "complete HTML from <!DOCTYPE html> to </html>",
  "title": "SEO title",
  "slug": "url-slug"
}`

  const result = await runAgent(SYSTEM_PROMPT, userPrompt, {
    jsonMode: true,
    maxTokens: 12000,
  }) as { html: string; title: string; slug: string }

  return {
    html: result.html,
    title: result.title,
    slug: result.slug,
  }
}
