import { Resend } from "resend"

let _resend: Resend | undefined
const getResend = () => {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}
const FROM = process.env.FROM_EMAIL ?? "hello@autopilot.ai"

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

// Generic transactional send (used by the Autopilot digest). Graceful: returns
// false when no provider is configured; never throws.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || !to) return false
  try {
    await getResend().emails.send({ from: FROM, to, subject, html })
    return true
  } catch {
    return false
  }
}

export async function sendContentReadyEmail(to: string, businessName: string, count: number) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `Your ${count} content pieces are ready to review — ${businessName}`,
    html: `
      <h2>Your content is ready!</h2>
      <p>We've generated <strong>${count} new content pieces</strong> for ${businessName}.</p>
      <p>Log in to review, approve, or edit them before they go live.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/content" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px;">Review Content</a>
      <p style="color:#6b7280;font-size:14px;margin-top:32px;">AutoPilot — AI Business Operating System</p>
    `,
  })
}

export async function sendReviewAlertEmail(to: string, businessName: string, rating: number, reviewerName: string) {
  const isNegative = rating <= 2
  await getResend().emails.send({
    from: FROM,
    to,
    subject: `${isNegative ? "⚠️ Urgent: " : ""}New ${rating}★ review for ${businessName}`,
    html: `
      <h2>${isNegative ? "Urgent: Negative Review Received" : "New Review Received"}</h2>
      <p><strong>${reviewerName}</strong> left a <strong>${rating}-star</strong> review for ${businessName}.</p>
      <p>We've drafted a response. ${isNegative ? "Please review it before it's posted." : "It will auto-post unless you edit it."}</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/reputation" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px;">Review Response</a>
    `,
  })
}

export async function sendWelcomeEmail(to: string, name: string) {
  await getResend().emails.send({
    from: FROM,
    to,
    subject: "Welcome to AutoPilot — your AI business team is ready",
    html: `
      <h2>Welcome to AutoPilot, ${name || "there"}!</h2>
      <p>Your AI business operating system is set up and ready to go. Here's what happens next:</p>
      <ul>
        <li>✅ Your first week of content will be generated within the hour</li>
        <li>✅ Review monitoring is now active</li>
        <li>✅ Check your dashboard to approve content before it goes live</li>
      </ul>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px;">Go to Dashboard</a>
    `,
  })
}
