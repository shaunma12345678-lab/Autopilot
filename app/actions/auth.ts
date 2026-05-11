"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { sendWelcomeEmail } from "@/lib/email"
import { stripe, STRIPE_PRICE_IDS } from "@/lib/stripe"
import { redirect } from "next/navigation"

export async function signUp(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const name = formData.get("name") as string
  const plan = (formData.get("plan") as string) || ""

  if (!email || !password || !name) {
    return { error: "All fields are required" }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) return { error: error.message }
  if (!data.user) return { error: "Failed to create account" }

  await prisma.user.create({
    data: { id: data.user.id, email, name },
  })

  await sendWelcomeEmail(email, name).catch(() => {})

  // For paid plans: create Stripe checkout session and redirect immediately
  const priceId = STRIPE_PRICE_IDS[plan]
  if (priceId && stripe) {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding?payment=success&plan=${plan}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`,
        metadata: { userId: data.user.id, plan },
        subscription_data: { metadata: { userId: data.user.id, plan } },
      })
      if (session.url) redirect(session.url)
    } catch {
      // If Stripe fails, fall through to onboarding — don't block account creation
    }
  }

  redirect("/onboarding")
}

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) return { error: "Email and password are required" }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: error.message }
  redirect("/dashboard")
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
