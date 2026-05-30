import { NextRequest } from "next/server"

export const maxDuration = 60

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ap2026admin"

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const pw = request.headers.get("x-admin-password")
  if (pw !== ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.VERCEL_TOKEN) {
    return Response.json(
      { error: "Add VERCEL_TOKEN to Vercel environment variables to enable publishing" },
      { status: 400 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const html  = String(body.html  ?? "").trim()
  const title = String(body.title ?? "site").trim()
  const rawSlug = String(body.slug ?? title).trim()

  if (!html) return Response.json({ error: "html is required" }, { status: 400 })

  // Clean slug: lowercase, hyphens only, max 52 chars
  const slug = rawSlug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52) || "site"

  try {
    const res = await fetch("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.VERCEL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: slug,
        files: [
          {
            file:     "index.html",
            data:     html,
            encoding: "utf8",
          },
        ],
        projectSettings: {
          framework: null,
        },
      }),
    })

    const data = await res.json() as Record<string, unknown>

    if (!res.ok) {
      const errMsg = typeof data.error === "object" && data.error !== null
        ? String((data.error as Record<string, unknown>).message ?? JSON.stringify(data.error))
        : String(data.error ?? `Vercel API error ${res.status}`)
      return Response.json({ error: errMsg }, { status: res.status })
    }

    const deploymentId = String(data.id ?? "")
    const url = data.url
      ? `https://${String(data.url)}`
      : `https://${slug}.vercel.app`

    return Response.json({ url, deploymentId, slug })
  } catch (err) {
    console.error("[admin/publish-site]", err)
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Publish failed: ${msg.slice(0, 200)}` }, { status: 500 })
  }
}
