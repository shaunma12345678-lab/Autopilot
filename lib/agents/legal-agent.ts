import { runAgent } from "@/lib/claude"

const SYSTEM_PROMPT = `You are a business attorney specializing in small business contracts and compliance. You draft agreements that protect the business without being so aggressive they kill deals. Plain English. Clear terms. Enforceable clauses.

IMPORTANT DISCLAIMER: All documents generated are templates for educational and starting-point purposes only. They do not constitute legal advice. Users must have a licensed attorney review before signing or sending any legal document.

Rules:
- Every contract must have: parties, scope, payment, IP ownership, limitation of liability, termination
- Plain English is safer than legalese for clarity and enforceability
- Always include a disclaimer recommending attorney review
- Return valid JSON only`

export async function generateServiceAgreement(params: {
  businessName: string
  businessType: string
  clientName?: string
  serviceDescription: string
  price: string
  paymentTerms: string
  deliverables: string[]
  timeline?: string
  state?: string
}): Promise<{
  agreement: string
  keyTermsSummary: Array<{ clause: string; whatItMeans: string; whyItMatters: string }>
  missingInfoNeeded: string[]
  redFlagsToReview: string[]
  disclaimer: string
}> {
  const user = `Draft a service agreement for ${params.businessName} (${params.businessType}).

Client: ${params.clientName ?? "[CLIENT NAME]"}
Service description: ${params.serviceDescription}
Price: ${params.price}
Payment terms: ${params.paymentTerms}
Deliverables: ${params.deliverables.join("; ")}
Timeline: ${params.timeline ?? "To be agreed"}
Governing state: ${params.state ?? "[STATE]"}

Draft a professional service agreement that includes:
- Parties and recitals
- Scope of services (with explicit out-of-scope clause)
- Payment terms, late fees, and deposit requirements
- IP ownership and usage rights
- Confidentiality clause
- Limitation of liability (cap at contract value)
- Termination clauses (by either party, with notice periods)
- Dispute resolution (mediation before litigation)
- Signature block

Include a key terms summary explaining each major clause in plain English, a list of information still needed, and any red flags to have an attorney review.

Return JSON with: agreement (full text), keyTermsSummary, missingInfoNeeded, redFlagsToReview, disclaimer`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 4000 })) as ReturnType<typeof generateServiceAgreement> extends Promise<infer T> ? T : never
}

export async function generatePrivacyPolicy(params: {
  businessName: string
  websiteUrl: string
  dataCollected: string[]
  usesAnalytics: boolean
  usesPayments: boolean
  emailMarketing: boolean
  state?: string
}): Promise<{
  privacyPolicy: string
  complianceNotes: string[]
  disclaimer: string
}> {
  const user = `Draft a privacy policy for ${params.businessName}.

Website: ${params.websiteUrl}
Data collected: ${params.dataCollected.join(", ")}
Uses analytics (Google Analytics etc.): ${params.usesAnalytics}
Processes payments: ${params.usesPayments}
Sends marketing emails: ${params.emailMarketing}
State: ${params.state ?? "United States (general)"}

Write a clear, compliant privacy policy that covers:
- What data is collected and why
- How data is used and shared
- Cookie policy
- User rights (access, deletion, opt-out)
- Contact information for privacy requests
- CCPA/GDPR considerations if applicable

Return JSON with: privacyPolicy (full HTML text), complianceNotes, disclaimer`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generatePrivacyPolicy> extends Promise<infer T> ? T : never
}

export async function generateNDA(params: {
  businessName: string
  otherParty?: string
  purposeOfDisclosure: string
  duration: string
  ndaType: "one-way" | "mutual"
  state?: string
}): Promise<{
  nda: string
  keyTermsSummary: Array<{ clause: string; plain: string }>
  disclaimer: string
}> {
  const user = `Draft a ${params.ndaType} Non-Disclosure Agreement for ${params.businessName}.

Other party: ${params.otherParty ?? "[OTHER PARTY]"}
Purpose: ${params.purposeOfDisclosure}
Confidentiality duration: ${params.duration}
Governing state: ${params.state ?? "[STATE]"}

Include standard NDA provisions: definition of confidential information, exclusions, obligations, return/destruction of information, remedies, term and termination, and governing law.

Return JSON with: nda (full text), keyTermsSummary, disclaimer`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 2500 })) as ReturnType<typeof generateNDA> extends Promise<infer T> ? T : never
}

export async function generateTermsOfService(params: {
  businessName: string
  websiteUrl: string
  serviceDescription: string
  pricingModel: string
  refundPolicy?: string
  state?: string
}): Promise<{
  termsOfService: string
  refundPolicy: string
  disclaimer: string
}> {
  const user = `Draft Terms of Service for ${params.businessName}.

Website: ${params.websiteUrl}
Service: ${params.serviceDescription}
Pricing model: ${params.pricingModel}
Refund policy: ${params.refundPolicy ?? "Generate an appropriate policy for this service type"}
State: ${params.state ?? "United States (general)"}

Draft comprehensive Terms of Service covering:
- Acceptance of terms
- Description of services
- User accounts and responsibilities
- Payment terms and billing
- Refund and cancellation policy
- Prohibited uses
- Intellectual property
- Disclaimers and limitation of liability
- Indemnification
- Governing law and dispute resolution
- Changes to terms

Return JSON with: termsOfService (full text), refundPolicy, disclaimer`

  return (await runAgent(SYSTEM_PROMPT, user, { jsonMode: true, maxTokens: 3000 })) as ReturnType<typeof generateTermsOfService> extends Promise<infer T> ? T : never
}
