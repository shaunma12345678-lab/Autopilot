import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are an operations consultant who has helped small businesses scale from chaotic to systematic. You build SOPs that real employees actually follow — not 40-page documents nobody reads. Clarity, brevity, and accountability are your operating principles.

Rules:
- Every SOP must be completable by someone new in under 15 minutes
- Checklists work better than paragraphs — always prefer checklists
- Accountability must be assigned to a role, not a person
- Return valid JSON only`

export async function generateSOP(params: {
  businessName: string
  businessType: string
  process: string
  role?: string
  frequency?: string
  tools?: string[]
}): Promise<{
  sopTitle: string
  version: string
  owner: string
  frequency: string
  purpose: string
  steps: Array<{
    stepNumber: number
    title: string
    instructions: string[]
    tools?: string[]
    timeEstimate: string
    commonMistakes: string[]
    qualityCheck: string
  }>
  completionCriteria: string[]
  escalationPath: string
  relatedSOPs: string[]
  trainingNotes: string
}> {
  const user = `Write a complete Standard Operating Procedure (SOP) for ${params.businessName} (${params.businessType}).

Process to document: ${params.process}
Responsible role: ${params.role ?? "Team Member"}
Frequency: ${params.frequency ?? "As needed"}
Tools used: ${params.tools?.join(", ") ?? "Standard business tools"}

Create a practical SOP with:
- Clear numbered steps (5-12 steps for the process)
- Each step: title, bullet-point instructions, tools needed, time estimate, common mistakes to avoid, quality check
- Completion criteria (how you know it's done right)
- Escalation path (when to involve a manager)
- Training notes for new employees

Write it so a new hire could follow it on day one.

Return JSON with: sopTitle, version, owner, frequency, purpose, steps, completionCriteria, escalationPath, relatedSOPs, trainingNotes`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateSOP> extends Promise<infer T> ? T : never
}

export async function generateDailyChecklist(params: {
  businessName: string
  businessType: string
  role: string
  openingOrClosing: "opening" | "closing" | "daily"
}): Promise<{
  checklistTitle: string
  role: string
  estimatedTime: string
  sections: Array<{
    sectionName: string
    timing: string
    items: Array<{
      task: string
      details?: string
      toolOrLocation?: string
      acceptanceCriteria: string
    }>
  }>
  ifProblems: Array<{ issue: string; action: string; escalate: boolean }>
  weeklyAddons: Array<{ day: string; additionalTask: string }>
}> {
  const user = `Create a ${params.openingOrClosing} checklist for a ${params.role} at ${params.businessName} (${params.businessType}).

Include:
- 3-4 sections organized by timing/area
- Each task with specific acceptance criteria (not just "clean the counter" but "counter is clear of all items, wiped down, no visible residue")
- Problem-resolution guide: what to do if common issues arise
- Weekly add-ons: extra tasks by day of the week

Target completion time: 15-20 minutes.

Return JSON with: checklistTitle, role, estimatedTime, sections, ifProblems, weeklyAddons`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateDailyChecklist> extends Promise<infer T> ? T : never
}

export async function generateDelegationPlan(params: {
  businessName: string
  ownerRole: string
  currentTasks: string[]
  teamSize: number
  growthGoal: string
}): Promise<{
  taskAudit: Array<{
    task: string
    currentOwner: string
    shouldDelegate: boolean
    delegateTo: string
    transferRisk: "low" | "medium" | "high"
    sopNeeded: boolean
  }>
  delegationPriority: Array<{ rank: number; task: string; reason: string; timeFreed: string }>
  ownerFocusAreas: string[]
  hiringRecommendations: Array<{ role: string; when: string; expectedROI: string }>
  weeklyOpsRhythm: Array<{ cadence: string; meeting: string; purpose: string; duration: string }>
}> {
  const user = `Create a delegation plan for the owner of ${params.businessName}.

Owner's current role: ${params.ownerRole}
Team size: ${params.teamSize}
Growth goal: ${params.growthGoal}
Tasks currently handled by owner: ${params.currentTasks.join("; ")}

Deliver:
1. Task audit: for each task, assess should-delegate decision, who to delegate to, transfer risk, whether an SOP is needed
2. Delegation priority order with rationale and estimated time freed per week
3. What the owner should focus on (3-5 high-leverage areas only)
4. Hiring recommendations: which roles to add and when based on the growth goal
5. Weekly operating rhythm: meetings/cadences to keep the delegated work on track

Return JSON with: taskAudit, delegationPriority, ownerFocusAreas, hiringRecommendations, weeklyOpsRhythm`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateDelegationPlan> extends Promise<infer T> ? T : never
}
