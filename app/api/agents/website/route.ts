import { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import {
  generateWebsite,
  parseUserCommand,
  generateCustomShader,
  analyzeCompetitor,
} from "@/lib/agents/website-agent"
import { cloneUrlStyle, analyzeReferenceImage } from "@/lib/agents/site-researcher"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const {
      businessId,
      brandColor,
      services,
      tagline,
      // New params
      userPrompt,
      referenceUrl,
      referenceImage,       // { base64: string, mediaType: string }
      competitorUrl,
      currentSiteId,        // for diff editing
      editSection,          // e.g. "hero", "pricing", "footer"
      runCRO,
    } = body

    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    // Load business with live data
    const business = await prisma.business.findFirst({
      where: { id: businessId, userId: user.id },
      include: {
        reviews: {
          take:     5,
          orderBy:  { rating: "desc" },
          select:   { reviewerName: true, rating: true, reviewText: true },
        },
      },
    }).catch(() => null)

    if (!business) return Response.json({ error: "Business not found" }, { status: 404 })

    const brandVoice = business.brandVoice as Record<string, unknown>
    const serviceList: string[] = Array.isArray(services) && services.length > 0
      ? services
      : (brandVoice?.keyServices as string[] | undefined) ?? ["Our Services"]

    // Load current HTML for diff editing
    let currentHtml: string | undefined
    if (currentSiteId && editSection) {
      const currentSite = await prisma.site.findFirst({
        where: { id: currentSiteId },
        select: { html: true },
      }).catch(() => null)
      currentHtml = currentSite?.html ?? undefined
    }

    // #36 — Gather live business data in parallel
    const [leadCountResult, contentResult] = await Promise.allSettled([
      prisma.lead.count({ where: { businessId } }).catch(() => 0),
      prisma.message
        .findMany({
          where: {
            conversation: { businessId, agentSlug: "content-factory" },
            role: "ASSISTANT",
          },
          take:    6,
          orderBy: { createdAt: "desc" },
          select:  { content: true },
        })
        .catch(() => []),
    ])

    const leadCount      = leadCountResult.status === "fulfilled" ? (leadCountResult.value as number) : 0
    const contentMessages = contentResult.status === "fulfilled" ? (contentResult.value as Array<{content: string}>) : []
    const recentContent  = contentMessages
      .map(m => {
        const firstLine = m.content.split("\n")[0].replace(/^#+\s*/, "").trim()
        return firstLine.length > 10 && firstLine.length < 120 ? firstLine : null
      })
      .filter((s): s is string => s !== null)
      .slice(0, 3)

    const avgRating = business.reviews.length > 0
      ? business.reviews.reduce((sum, r) => sum + r.rating, 0) / business.reviews.length
      : 0

    const businessLiveData = {
      leadCount,
      reviewCount:  business.reviews.length,
      avgRating,
      recentContent,
    }

    // Run all pre-processing in parallel
    const [
      directivesResult,
      shaderResult,
      styleCloneResult,
      imageContextResult,
      competitorResult,
    ] = await Promise.allSettled([
      // #1 — Parse user command into structured directives
      userPrompt ? parseUserCommand(userPrompt) : Promise.resolve(null),
      // #17 — Generate custom shader if requested via userPrompt
      userPrompt && /shader|aurora|water|plasma|galaxy|smoke|fire|crystal/i.test(userPrompt)
        ? parseUserCommand(userPrompt).then(d => d.shaderEffect ? generateCustomShader(d.shaderEffect) : "")
        : Promise.resolve(""),
      // #10 — Clone reference URL style
      referenceUrl ? cloneUrlStyle(referenceUrl) : Promise.resolve(""),
      // #30 — Analyze reference image
      referenceImage?.base64
        ? analyzeReferenceImage(referenceImage.base64, referenceImage.mediaType ?? "image/jpeg")
        : Promise.resolve(""),
      // #39 — Analyze competitor
      competitorUrl
        ? analyzeCompetitor(competitorUrl, { name: business.name, type: business.type })
        : Promise.resolve(""),
    ])

    const directives      = directivesResult.status      === "fulfilled" ? directivesResult.value      : null
    const shaderGlsl      = shaderResult.status          === "fulfilled" ? shaderResult.value           : ""
    const styleCloneCtx   = styleCloneResult.status      === "fulfilled" ? styleCloneResult.value       : ""
    const imageCtx        = imageContextResult.status    === "fulfilled" ? imageContextResult.value     : ""
    const competitorCtx   = competitorResult.status      === "fulfilled" ? competitorResult.value       : ""

    const result = await generateWebsite({
      business: {
        name:        business.name,
        type:        business.type,
        description: business.description,
        location:    business.location,
        phone:       business.phone,
        website:     business.website,
      },
      brandVoice,
      brandColor:         brandColor ?? "#6366f1",
      services:           serviceList,
      tagline:            tagline ?? undefined,
      reviews:            business.reviews,
      directives:         directives ?? undefined,
      shaderGlsl:         shaderGlsl || undefined,
      styleCloneContext:  styleCloneCtx || undefined,
      imageContext:       imageCtx || undefined,
      competitorContext:  competitorCtx || undefined,
      currentHtml:        currentHtml,
      editSection:        editSection ?? undefined,
      runCRO:             runCRO === true,
      businessLiveData,
    })

    // Save to DB (skip if this was a diff edit of an existing site)
    if (editSection && currentSiteId) {
      const updated = await prisma.site.update({
        where: { id: currentSiteId },
        data:  { html: result.html },
      })
      return Response.json({
        site:                 updated,
        slug:                 result.slug,
        title:                result.title,
        qualityScore:         result.qualityScore,
        iterations:           result.iterations,
        complianceViolations: result.complianceViolations,
        croIssues:            result.croResult?.issues ?? [],
        directives:           result.directives,
        editedSection:        editSection,
      })
    }

    const saved = await prisma.site.create({
      data: {
        businessId,
        slug:      result.slug,
        title:     result.title,
        html:      result.html,
        published: false,
      },
    })

    return Response.json({
      site:                 saved,
      slug:                 result.slug,
      title:                result.title,
      qualityScore:         result.qualityScore,
      iterations:           result.iterations,
      researchUsed:         result.researchUsed,
      complianceViolations: result.complianceViolations,
      croIssues:            result.croResult?.issues ?? [],
      directives:           result.directives,
    })
  } catch (err) {
    console.error("[website-agent POST]", err)
    return Response.json({ error: "Failed to generate website" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get("businessId")
    if (!businessId) return Response.json({ error: "businessId required" }, { status: 400 })

    const business = await prisma.business.findFirst({ where: { id: businessId, userId: user.id } })
    if (!business) return Response.json({ error: "Not found" }, { status: 404 })

    const sites = await prisma.site.findMany({
      where:   { businessId },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({ sites })
  } catch (err) {
    console.error("[website-agent GET]", err)
    return Response.json({ error: "Failed to fetch sites" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const { siteId, published } = body

    const site = await prisma.site.findFirst({
      where:   { id: siteId },
      include: { business: { select: { userId: true } } },
    })
    if (!site || !site.business || site.business.userId !== user.id) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    const updated = await prisma.site.update({
      where: { id: siteId },
      data:  { published },
    })

    return Response.json({ site: updated })
  } catch (err) {
    console.error("[website-agent PATCH]", err)
    return Response.json({ error: "Failed to update site" }, { status: 500 })
  }
}
