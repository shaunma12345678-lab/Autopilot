import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a senior talent acquisition and people operations expert. You write job descriptions that attract A-players, not just anyone. You know what separates great hires from expensive mistakes, and you build hiring systems that reveal character and capability, not just credentials.

Rules:
- Job descriptions must attract the right candidate by repelling the wrong one
- Interview questions must reveal past behavior, not hypothetical answers
- Every hire must have a 30-60-90 day success plan
- Return valid JSON only`

export async function generateJobDescription(params: {
  businessName: string
  businessType: string
  role: string
  salary?: string
  requiredSkills: string[]
  niceToHaveSkills?: string[]
  cultureValues?: string[]
}): Promise<{
  jobPosting: {
    title: string
    headline: string
    aboutUs: string
    missionStatement: string
    roleOverview: string
    whatYouWillDo: string[]
    whatYouWillNotDo: string[]
    mustHaveRequirements: string[]
    niceToHave: string[]
    whatWeOffer: string[]
    compensationNote: string
    closingStatement: string
  }
  internalScorecardTemplate: {
    mustHaveTraits: Array<{ trait: string; howToEvaluate: string }>
    culturalFitIndicators: string[]
    redFlags: string[]
  }
  distributionChannels: Array<{ platform: string; tips: string; costEstimate: string }>
}> {
  const user = `Write a complete job description and hiring kit for ${params.businessName} (${params.businessType}).

Role: ${params.role}
Salary: ${params.salary ?? "Competitive, based on experience"}
Required skills: ${params.requiredSkills.join(", ")}
Nice-to-have skills: ${params.niceToHaveSkills?.join(", ") ?? "None specified"}
Company values: ${params.cultureValues?.join(", ") ?? "Hard work, integrity, teamwork"}

Write a job posting that:
- Opens with a compelling "why work here" hook (not "we're looking for a...")
- Explicitly lists what the role is NOT (to filter out wrong applicants)
- Uses inclusive, direct language
- Includes an internal scorecard to evaluate candidates consistently

Also list 5 distribution channels with tips and cost estimates.

Return JSON with: jobPosting, internalScorecardTemplate, distributionChannels`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateJobDescription> extends Promise<infer T> ? T : never
}

export async function generateInterviewKit(params: {
  role: string
  businessType: string
  requiredSkills: string[]
  cultureValues?: string[]
  interviewRounds: number
}): Promise<{
  rounds: Array<{
    round: number
    type: string
    duration: string
    interviewer: string
    objectives: string[]
    questions: Array<{
      question: string
      type: "behavioral" | "situational" | "technical" | "values"
      whatToListenFor: string[]
      followUps: string[]
      greenFlags: string[]
      redFlags: string[]
    }>
    scoringRubric: Array<{ criterion: string; weight: string; howToScore: string }>
  }>
  referenceCheckQuestions: string[]
  offerDecisionFramework: string
  thirtyDayOnboardingPlan: Array<{ week: number; goals: string[]; keyActivities: string[] }>
}> {
  const user = `Create a complete interview kit for hiring a ${params.role} at a ${params.businessType}.

Required skills: ${params.requiredSkills.join(", ")}
Company values: ${params.cultureValues?.join(", ") ?? "Excellence, reliability, growth mindset"}
Interview rounds: ${params.interviewRounds}

Create a structured kit with:
- ${params.interviewRounds} interview rounds with clear objectives and question banks
- Each question: behavioral/situational/technical/values type, what to listen for, follow-ups, green/red flags
- Scoring rubric for each round
- Reference check questions (5 questions that reveal the truth)
- Decision framework for making the final offer
- 4-week onboarding plan with weekly goals and key activities

Return JSON with: rounds, referenceCheckQuestions, offerDecisionFramework, thirtyDayOnboardingPlan`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateInterviewKit> extends Promise<infer T> ? T : never
}

export async function generateOfferLetter(params: {
  businessName: string
  candidateName: string
  role: string
  salary: string
  startDate: string
  benefits?: string[]
  reportingTo?: string
}): Promise<{
  offerLetter: string
  negotiationGuidance: { floorSalary: string; maximumConcessions: string[]; script: string }
  onboardingChecklist: string[]
}> {
  const user = `Write an offer letter and onboarding checklist for ${params.businessName}.

Candidate: ${params.candidateName}
Role: ${params.role}
Salary: ${params.salary}
Start date: ${params.startDate}
Benefits: ${params.benefits?.join(", ") ?? "To be discussed"}
Reporting to: ${params.reportingTo ?? "Business owner"}

Write a professional, warm offer letter that:
- Makes them excited to accept
- Sets clear expectations
- Protects the business

Include negotiation guidance (floor salary, acceptable concessions, script for counter-offers) and a 20-item pre-start onboarding checklist.

Return JSON with: offerLetter (full text), negotiationGuidance, onboardingChecklist`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateOfferLetter> extends Promise<infer T> ? T : never
}
