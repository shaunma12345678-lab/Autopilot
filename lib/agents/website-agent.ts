import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an elite web designer who builds premium, conversion-optimized websites for small businesses. You produce complete, self-contained HTML files that look like $5,000 custom sites — beautiful typography, smooth animations, professional layout, and a clear conversion funnel.

Rules:
- Return ONLY valid JSON. No markdown, no code fences, no explanation.
- The "html" field must be a complete HTML document from <!DOCTYPE html> to </html>
- Use ONLY inline CSS within a single <style> block — no external CSS files except Google Fonts via @import
- Zero JavaScript dependencies — pure CSS animations only
- The design must be mobile-responsive using flexbox, CSS Grid, and @media queries
- Include CSS animations: fade-in on page load, hover transforms, smooth scrolling
- Professional color scheme derived from the provided brandColor
- Every section must have a clear purpose in the conversion funnel
- Return valid JSON: { "html": "...", "title": "...", "slug": "..." }`

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

  const userPrompt = `Generate a complete premium HTML website for the following business.

Business Name: ${business.name}
Business Type: ${business.type}
Description: ${business.description}
Location: ${business.location}
Phone: ${business.phone ?? "N/A"}
Website URL (if exists): ${business.website ?? "N/A"}
Brand Voice: ${JSON.stringify(brandVoice)}
Brand Color: ${brandColor}
Tagline: ${tagline ?? "Generate a compelling tagline based on the business"}
Services (list all in cards): ${services.join(", ")}

Customer Reviews to include:
${reviewsSection}

Design Requirements:
1. Google Fonts @import at top of <style> — use a premium font pairing (e.g. Inter + Playfair Display, or Poppins + Lora)
2. CSS custom properties (--primary, --primary-dark, --accent) derived from brand color ${brandColor}
3. Hero section: full-viewport gradient background using the brand color, large headline, compelling subheading, two CTA buttons (primary + secondary), subtle background pattern or shapes using CSS
4. Services section: 3-column card grid (2-col on mobile), each card with an emoji icon, service name, and 1-line description
5. About/Stats section: trust-building copy + 3 stats (years in business, clients served, satisfaction rate — invent plausible numbers)
6. Reviews section: clean review cards with star ratings rendered as ★ symbols, reviewer name, review text
7. Contact section: phone as tel: link, email as mailto: link, and a styled contact form (name, email, message, submit button) — form does not need to be functional
8. Footer: business name, location, copyright year
9. CSS animations: @keyframes fadeInUp for hero text, scale transform on card hover, smooth color transition on buttons
10. @media (max-width: 768px) for full mobile responsiveness
11. The overall aesthetic should be modern, trustworthy, and premium — not a generic template

Return JSON (no markdown, no code fences):
{
  "html": "complete HTML from <!DOCTYPE html> to </html>",
  "title": "SEO page title (business name + type + location)",
  "slug": "url-friendly slug from business name only, lowercase, hyphens, no special chars"
}`

  const result = await runAgent(SYSTEM_PROMPT, userPrompt, {
    jsonMode: true,
    maxTokens: 8000,
  }) as { html: string; title: string; slug: string }

  return {
    html: result.html,
    title: result.title,
    slug: result.slug,
  }
}
