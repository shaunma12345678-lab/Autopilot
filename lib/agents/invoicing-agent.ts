import { runAgent } from "@/lib/claude"

interface Invoice {
  clientName: string
  invoiceNumber: string
  amount: number
  daysOverdue: number
  previousAttempts: number
}

export async function analyzeReceivables(invoices: Invoice[], businessName: string) {
  const system = `You are a collections specialist and business finance expert. Help businesses recover money professionally without destroying relationships. Return valid JSON only.`
  const user = `Business: ${businessName}
Outstanding invoices: ${JSON.stringify(invoices)}

Return JSON:
{
  "totalOutstanding": 0,
  "highRiskAmount": 0,
  "agingBuckets": {
    "current": { "count": 0, "amount": 0 },
    "1_30": { "count": 0, "amount": 0 },
    "31_60": { "count": 0, "amount": 0 },
    "61_90": { "count": 0, "amount": 0 },
    "90plus": { "count": 0, "amount": 0 }
  },
  "collectionSequences": [
    {
      "clientName": "...",
      "invoiceNumber": "...",
      "amount": 0,
      "daysOverdue": 0,
      "urgencyLevel": "friendly/firm/final/legal",
      "emailSubject": "...",
      "emailBody": "full email text",
      "nextStep": "what to do if no response in X days"
    }
  ],
  "legalDemandLetter": "full demand letter text for the most overdue invoice",
  "topRecommendations": ["rec1", "rec2"],
  "collectionProbability": { "under30Days": "90%", "30to60": "75%", "over60": "50%", "over90": "25%" }
}`
  return runAgent(system, user, { jsonMode: true, maxTokens: 4000 })
}
