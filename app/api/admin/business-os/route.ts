import { NextRequest } from "next/server"
import { BOS_AGENT_REGISTRY, BOS_AGENT_BY_SLUG } from "@/lib/bos-registry"
import { runAgent } from "@/lib/claude"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? ""   // no fallback: unset env disables admin access

// ── In-memory state (per lambda instance) ───────────────────────────────────
// For cross-instance persistence, replace with Upstash Redis:
// const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })

interface AgentState {
  enabled: boolean
  lastRunAt: string | null
  lastRunOk: boolean | null
  lastResult: string | null
  errorCount: number
  runCount: number
  circuitState: "closed" | "open" | "half-open"
}

interface QueueJob {
  id: string
  agentName: string
  agentSlug: string
  priority: string
  status: "queued" | "running" | "completed" | "failed" | "dead"
  attempts: number
  maxAttempts: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
  triggeredBy: string
  error?: string
  result?: unknown
}

interface WorkflowState {
  enabled: boolean
  lastRunAt: string | null
  lastRunOk: boolean | null
  runCount: number
  errorCount: number
  recentRuns: Array<{ id: string; startedAt: string; success: boolean; stepsCompleted: number }>
}

// Use globalThis so state survives hot reloads in dev
const g = globalThis as typeof globalThis & {
  _bosAgentState?: Map<string, AgentState>
  _bosJobQueue?: QueueJob[]
  _bosWorkflowState?: Map<string, WorkflowState>
  _bosStartedAt?: string
  _bosTotalTokens?: number
}

if (!g._bosAgentState) g._bosAgentState = new Map()
if (!g._bosJobQueue) g._bosJobQueue = []
if (!g._bosWorkflowState) g._bosWorkflowState = new Map()
if (!g._bosStartedAt) g._bosStartedAt = new Date().toISOString()
if (!g._bosTotalTokens) g._bosTotalTokens = 0

const agentState = g._bosAgentState
const jobQueue = g._bosJobQueue
const workflowState = g._bosWorkflowState

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAgentState(slug: string): AgentState {
  if (!agentState.has(slug)) {
    agentState.set(slug, {
      enabled: true,
      lastRunAt: null,
      lastRunOk: null,
      lastResult: null,
      errorCount: 0,
      runCount: 0,
      circuitState: "closed",
    })
  }
  return agentState.get(slug)!
}

function getWorkflowState(id: string): WorkflowState {
  if (!workflowState.has(id)) {
    workflowState.set(id, {
      enabled: true,
      lastRunAt: null,
      lastRunOk: null,
      runCount: 0,
      errorCount: 0,
      recentRuns: [],
    })
  }
  return workflowState.get(id)!
}

function makeJob(slug: string, priority: string, triggeredBy: string): QueueJob {
  const agent = BOS_AGENT_BY_SLUG.get(slug)
  return {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentName: agent?.name ?? slug,
    agentSlug: slug,
    priority,
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    triggeredBy,
  }
}

function getMetrics() {
  const now = Date.now()
  const dayAgo = now - 86_400_000

  const runsToday = jobQueue.filter(j => j.startedAt && new Date(j.startedAt).getTime() > dayAgo).length
  const errorsToday = jobQueue.filter(j => j.status === "failed" && j.finishedAt && new Date(j.finishedAt).getTime() > dayAgo).length
  const enabledAgents = [...agentState.values()].filter(s => s.enabled).length + (BOS_AGENT_REGISTRY.length - agentState.size)
  const totalAgents = BOS_AGENT_REGISTRY.length

  return {
    runsToday,
    errorsToday,
    enabledAgents,
    totalAgents,
    tokenUsage: { total: g._bosTotalTokens ?? 0 },
    uptime: process.uptime(),
  }
}

function buildAgentList() {
  return BOS_AGENT_REGISTRY.map(def => {
    const state = getAgentState(def.slug)
    return {
      name: def.name,
      slug: def.slug,
      description: def.description,
      category: def.category,
      schedule: def.schedule,
      enabled: state.enabled,
      lastRunAt: state.lastRunAt,
      lastRunOk: state.lastRunOk,
      lastResult: state.lastResult,
      errorCount: state.errorCount,
      runCount: state.runCount,
      circuitState: state.circuitState,
    }
  })
}

const STATIC_WORKFLOWS = [
  { id: "new-lead-pipeline", name: "New Lead Pipeline", description: "Qualifies every inbound lead and immediately nurtures high-tier prospects.", category: "Sales", trigger: { type: "event", eventType: "lead.created" }, steps: [{ agentName: "Lead Qualifier" }, { agentName: "Deal Nurture" }] },
  { id: "payment-failure-recovery", name: "Payment Failure Recovery", description: "Runs invoicing collections and churn prevention in parallel when a payment fails.", category: "Finance", trigger: { type: "event", eventType: "invoice.payment_failed" }, steps: [{ agentName: "Invoicing & Collections", parallel: true }, { agentName: "Churn Prevention", parallel: true }] },
  { id: "cancellation-response", name: "Cancellation Response", description: "When a subscription cancels, immediately runs churn analysis and expansion revenue scan.", category: "Customer Success", trigger: { type: "event", eventType: "customer.subscription.canceled" }, steps: [{ agentName: "Churn Prevention", parallel: true }, { agentName: "Expansion Revenue", parallel: true }] },
  { id: "new-customer-welcome", name: "New Customer Welcome", description: "Fires on subscription creation. Runs expansion revenue scan and health monitoring setup.", category: "Customer Success", trigger: { type: "event", eventType: "customer.subscription.created" }, steps: [{ agentName: "Expansion Revenue" }] },
  { id: "employee-onboarding", name: "Employee Onboarding", description: "Triggers the full onboarding workflow when a new employee is hired.", category: "HR", trigger: { type: "event", eventType: "employee.hired" }, steps: [{ agentName: "New Hire Concierge" }] },
  { id: "incident-response", name: "Deploy Incident Response", description: "When CI/CD fails, simultaneously runs Deploy Guardian and Threat Detector.", category: "Tech", trigger: { type: "event", eventType: "deploy.failed" }, steps: [{ agentName: "Deploy Guardian", parallel: true }, { agentName: "Threat Detector", parallel: true }] },
  { id: "weekly-business-review", name: "Weekly Business Review", description: "Every Monday at 6 AM: analytics, competitive intel, and pipeline analyst in parallel.", category: "Executive", trigger: { type: "schedule", cron: "0 6 * * 1" }, steps: [{ agentName: "Analytics Pipeline", parallel: true }, { agentName: "Competitive Intel", parallel: true }, { agentName: "Pipeline Analyst", parallel: true }] },
  { id: "monthly-reporting", name: "Monthly Reporting Suite", description: "1st of every month at 7 AM: analytics pipeline runs first, then board report is generated.", category: "Executive", trigger: { type: "schedule", cron: "0 7 1 * *" }, steps: [{ agentName: "Analytics Pipeline" }, { agentName: "Board Report Generator" }] },
  { id: "daily-financial-health", name: "Daily Financial Health", description: "Weekdays at 6 AM: financial command center and cash flow forecaster run in parallel.", category: "Finance", trigger: { type: "schedule", cron: "0 6 * * 1-5" }, steps: [{ agentName: "Financial Command Center", parallel: true }, { agentName: "Cash Flow Forecaster", parallel: true }] },
  { id: "security-infrastructure-sweep", name: "Security & Infrastructure Sweep", description: "Twice daily: Threat Detector and Deploy Guardian run simultaneously at 8 AM and 8 PM.", category: "Tech", trigger: { type: "schedule", cron: "0 8,20 * * *" }, steps: [{ agentName: "Threat Detector", parallel: true }, { agentName: "Deploy Guardian", parallel: true }] },
]

function buildWorkflowList() {
  return STATIC_WORKFLOWS.map(wf => {
    const state = getWorkflowState(wf.id)
    return { ...wf, ...state }
  })
}

// ── Agent execution ───────────────────────────────────────────────────────────

async function executeAgent(slug: string, input?: string, priority = "normal", triggeredBy = "admin"): Promise<QueueJob> {
  const def = BOS_AGENT_BY_SLUG.get(slug)
  if (!def) throw new Error(`Unknown agent: ${slug}`)

  const job = makeJob(slug, priority, triggeredBy)
  jobQueue.unshift(job)
  if (jobQueue.length > 200) jobQueue.splice(200)

  const state = getAgentState(slug)
  job.status = "running"
  job.startedAt = new Date().toISOString()
  job.attempts++

  try {
    const userPrompt = input?.trim() || def.defaultPrompt
    const result = await runAgent(def.system, userPrompt, { jsonMode: true, maxTokens: 8096 })

    job.status = "completed"
    job.finishedAt = new Date().toISOString()
    job.result = result

    const preview = JSON.stringify(result).slice(0, 120) + "…"
    state.lastRunAt = job.finishedAt
    state.lastRunOk = true
    state.lastResult = preview
    state.runCount++
    state.circuitState = "closed"
    g._bosTotalTokens = (g._bosTotalTokens ?? 0) + 2000 // estimate

    return job
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    job.status = "failed"
    job.finishedAt = new Date().toISOString()
    job.error = msg

    state.lastRunAt = job.finishedAt
    state.lastRunOk = false
    state.errorCount++
    if (state.errorCount >= 3) state.circuitState = "open"

    return job
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, action, payload } = body as {
      password: string
      action: string
      payload?: Record<string, unknown>
    }

    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return Response.json({ error: "Invalid password" }, { status: 401 })
    }

    switch (action) {
      case "health":
        return Response.json({
          status: "online",
          version: "2.0.0",
          uptime: process.uptime(),
          startedAt: g._bosStartedAt,
          agentCount: BOS_AGENT_REGISTRY.length,
          provider: process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4-20250514" : process.env.GROQ_API_KEY ? "llama-3.3-70b" : "unconfigured",
        })

      case "agents":
        return Response.json({ agents: buildAgentList() })

      case "agent_detail": {
        const slug = payload?.slug as string
        const def = BOS_AGENT_BY_SLUG.get(slug)
        if (!def) return Response.json({ error: `Unknown agent: ${slug}` }, { status: 404 })
        const state = getAgentState(slug)
        const jobs = jobQueue.filter(j => j.agentSlug === slug).slice(0, 20)
        return Response.json({ ...def, ...state, recentJobs: jobs })
      }

      case "enable_agent": {
        const slug = payload?.slug as string
        const state = getAgentState(slug)
        state.enabled = true
        if (state.circuitState === "open") state.circuitState = "half-open"
        return Response.json({ success: true, slug, enabled: true })
      }

      case "disable_agent": {
        const slug = payload?.slug as string
        const state = getAgentState(slug)
        state.enabled = false
        return Response.json({ success: true, slug, enabled: false })
      }

      case "run_agent": {
        const { slug, input, priority, force } = payload as {
          slug: string
          input?: string
          priority?: string
          force?: boolean
        }
        const state = getAgentState(slug)
        if (!state.enabled && !force) {
          return Response.json({ error: "Agent is disabled. Pass force:true to override." }, { status: 400 })
        }
        if (state.circuitState === "open" && !force) {
          return Response.json({ error: "Agent circuit breaker is open (3+ consecutive failures). Pass force:true to reset." }, { status: 400 })
        }

        const job = await executeAgent(slug, input, priority ?? "high", "admin-manual")
        return Response.json({ job, result: job.result, elapsed: job.finishedAt && job.startedAt ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime() : null })
      }

      case "queue": {
        const recentJobs = jobQueue.slice(0, 100)
        const stats = {
          queued: recentJobs.filter(j => j.status === "queued").length,
          running: recentJobs.filter(j => j.status === "running").length,
          completed: recentJobs.filter(j => j.status === "completed").length,
          failed: recentJobs.filter(j => j.status === "failed").length,
          dead: recentJobs.filter(j => j.status === "dead").length,
        }
        return Response.json({ jobs: recentJobs, stats })
      }

      case "cancel_job": {
        const jobId = payload?.jobId as string
        const job = jobQueue.find(j => j.id === jobId)
        if (!job) return Response.json({ error: "Job not found" }, { status: 404 })
        if (job.status === "queued") {
          job.status = "failed"
          job.error = "Cancelled by admin"
          job.finishedAt = new Date().toISOString()
        }
        return Response.json({ success: true, job })
      }

      case "retry_job": {
        const jobId = payload?.jobId as string
        const job = jobQueue.find(j => j.id === jobId)
        if (!job) return Response.json({ error: "Job not found" }, { status: 404 })
        const retriedJob = await executeAgent(job.agentSlug, undefined, job.priority, "admin-retry")
        return Response.json({ success: true, job: retriedJob })
      }

      case "workflows":
        return Response.json({ workflows: buildWorkflowList() })

      case "enable_workflow": {
        const wfId = payload?.workflowId as string
        const state = getWorkflowState(wfId)
        state.enabled = true
        return Response.json({ success: true, workflowId: wfId, enabled: true })
      }

      case "disable_workflow": {
        const wfId = payload?.workflowId as string
        const state = getWorkflowState(wfId)
        state.enabled = false
        return Response.json({ success: true, workflowId: wfId, enabled: false })
      }

      case "run_workflow": {
        const wfId = payload?.workflowId as string
        const wf = STATIC_WORKFLOWS.find(w => w.id === wfId)
        if (!wf) return Response.json({ error: `Unknown workflow: ${wfId}` }, { status: 404 })

        const state = getWorkflowState(wfId)
        const runId = `run_${Date.now()}`
        const runStart = new Date().toISOString()

        // Separate parallel and sequential steps
        const parallelSteps = wf.steps.filter((s: { agentName: string; parallel?: boolean }) => s.parallel)
        const sequentialSteps = wf.steps.filter((s: { agentName: string; parallel?: boolean }) => !s.parallel)

        let stepsCompleted = 0
        let success = true

        try {
          // Execute parallel steps concurrently
          if (parallelSteps.length > 0) {
            const parallelSlugs = parallelSteps.map((s: { agentName: string }) => {
              const match = BOS_AGENT_REGISTRY.find(a => a.name === s.agentName)
              return match?.slug ?? s.agentName.toLowerCase().replace(/\s+/g, "-")
            })
            await Promise.all(parallelSlugs.map((slug: string) => executeAgent(slug, undefined, "high", `workflow:${wfId}`)))
            stepsCompleted += parallelSteps.length
          }

          // Execute sequential steps in order
          for (const step of sequentialSteps) {
            const match = BOS_AGENT_REGISTRY.find(a => a.name === step.agentName)
            const slug = match?.slug ?? step.agentName.toLowerCase().replace(/\s+/g, "-")
            await executeAgent(slug, undefined, "normal", `workflow:${wfId}`)
            stepsCompleted++
          }
        } catch {
          success = false
        }

        state.lastRunAt = new Date().toISOString()
        state.lastRunOk = success
        state.runCount++
        if (!success) state.errorCount++
        state.recentRuns.unshift({ id: runId, startedAt: runStart, success, stepsCompleted })
        if (state.recentRuns.length > 10) state.recentRuns.splice(10)

        return Response.json({ success, runId, stepsCompleted, workflowId: wfId })
      }

      case "metrics":
        return Response.json(getMetrics())

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
