import { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { stars, text, name, company } = await request.json()

    if (!stars || stars < 1 || stars > 5) {
      return Response.json({ error: "Invalid rating" }, { status: 400 })
    }

    // Log for now; email via Resend when key is available
    console.log("[product-review]", { stars, text, name, company, at: new Date().toISOString() })

    const { resend } = await import("@/lib/email").then(m => ({ resend: m })).catch(() => ({ resend: null }))

    if (resend && process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend")
      const client = new Resend(process.env.RESEND_API_KEY)
      await client.emails.send({
        from: `AutoPilot Reviews <${process.env.FROM_EMAIL || "hello@autopilot.ai"}>`,
        to: process.env.FROM_EMAIL || "hello@autopilot.ai",
        subject: `⭐ New ${stars}-star review from ${name || "Anonymous"}`,
        html: `
          <h2>${"★".repeat(stars)}${"☆".repeat(5 - stars)} — ${stars}/5</h2>
          <p><strong>${name || "Anonymous"}${company ? ` · ${company}` : ""}</strong></p>
          ${text ? `<blockquote>${text}</blockquote>` : ""}
        `,
      }).catch(() => {})
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: "Failed to submit review" }, { status: 500 })
  }
}
