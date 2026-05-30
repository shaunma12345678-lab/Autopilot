import { createSupabaseServerClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import AgentChat from "@/components/agent/AgentChat"
import { BOS_AGENT_BY_SLUG } from "@/lib/bos-registry"

// Accent colors per category
const CATEGORY_COLORS: Record<string, string> = {
  Finance:           "#10b981",
  Sales:             "#3b82f6",
  Marketing:         "#f59e0b",
  "Customer Success":"#8b5cf6",
  Operations:        "#06b6d4",
  HR:                "#ec4899",
  Tech:              "#f97316",
  Executive:         "#6366f1",
}

export default async function AgentChatPage({ params }: { params: Promise<{ agentSlug: string }> }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const business = await prisma.business.findFirst({ where: { userId: user.id } })
  if (!business) redirect("/onboarding")

  const { agentSlug } = await params
  const agentDef = BOS_AGENT_BY_SLUG.get(agentSlug)

  const agentName     = agentDef?.name     ?? agentSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  const agentCategory = agentDef?.category ?? "General"
  const systemPrompt  = agentDef?.system   ?? undefined
  const accentColor   = CATEGORY_COLORS[agentCategory] ?? "#6366f1"

  return (
    <div className="p-6 h-full flex flex-col" style={{ minHeight: "calc(100vh - 64px)" }}>
      <AgentChat
        agentSlug={agentSlug}
        agentName={agentName}
        agentCategory={agentCategory}
        systemPrompt={systemPrompt}
        businessId={business.id}
        accentColor={accentColor}
        placeholder={`Ask ${agentName} anything about your business…`}
      />
    </div>
  )
}
