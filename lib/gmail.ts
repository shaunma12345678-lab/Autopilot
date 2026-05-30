import nodemailer from "nodemailer"
import { prisma } from "@/lib/prisma"

export interface GmailMessage {
  to:      string | string[]
  subject: string
  html:    string
  text?:   string
  replyTo?: string
}

interface GmailResult {
  sent:       boolean
  messageId?: string
  provider:   "gmail" | "resend" | "none"
  from?:      string
}

// Load the user's connected Gmail credentials from DB
async function getGmailCredentials(userId: string): Promise<{ email: string; appPassword: string } | null> {
  const account = await prisma.connectedAccount.findUnique({
    where:  { userId_provider: { userId, provider: "gmail" } },
    select: { accountEmail: true, accessToken: true },
  })
  if (!account?.accountEmail || !account.accessToken) return null
  return { email: account.accountEmail, appPassword: account.accessToken }
}

// Send via the user's connected Gmail account
export async function sendViaGmail(
  userId: string,
  message: GmailMessage
): Promise<GmailResult> {
  const creds = await getGmailCredentials(userId)
  if (!creds) return { sent: false, provider: "none" }

  const transporter = nodemailer.createTransport({
    host:   "smtp.gmail.com",
    port:   465,
    secure: true,
    auth: { user: creds.email, pass: creds.appPassword },
  })

  const to = Array.isArray(message.to) ? message.to.join(", ") : message.to

  const info = await transporter.sendMail({
    from:    `"AutoPilot" <${creds.email}>`,
    to,
    subject: message.subject,
    html:    message.html,
    text:    message.text,
    replyTo: message.replyTo ?? creds.email,
  })

  return {
    sent:      true,
    messageId: info.messageId,
    provider:  "gmail",
    from:      creds.email,
  }
}

// Check whether a user has Gmail connected
export async function hasGmailConnected(userId: string): Promise<boolean> {
  const account = await prisma.connectedAccount.findUnique({
    where:  { userId_provider: { userId, provider: "gmail" } },
    select: { id: true },
  })
  return !!account
}
