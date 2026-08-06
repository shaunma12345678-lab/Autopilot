// Deterministic news classification — our own system, no model required.
//
// WHY THIS IS BETTER THAN ASKING AN LLM, not merely cheaper.
//
// The AI provider silently died and every comprehension feature returned an
// empty fallback for days while reporting success. That is not a configuration
// accident, it is what depending on a rate-limited black box for JUDGMENT looks
// like when it fails. Rules in this file cannot 429, cannot exhaust a quota,
// cost nothing, run in microseconds, and produce the same answer every time —
// which also means a user can be shown exactly WHY something was flagged.
//
// The insight is that most of what looked like comprehension is classification
// over a bounded vocabulary:
//
//   Plaintiff law firms publishing "investigation initiated" releases are a
//   finite, enumerable list of about twenty firms. That is a PUBLISHER problem,
//   not a reading-comprehension problem, and a source list solves it exactly
//   rather than probabilistically.
//
//   Content farms producing "is X a buy?" and "X stock moves 3%" are likewise a
//   known set of publishers and a small set of headline shapes.
//
//   The events that actually matter — a subpoena, an FDA decision, a CFO
//   departure, a guidance cut, a recall — are a bounded vocabulary. Regulators
//   and companies describe them in consistent language because the wording is
//   legally constrained.
//
// A language model is genuinely better at writing a fluent paragraph. It is not
// better at deciding whether Pomerantz LLP counts as a regulatory action, and
// that decision is the part that has to be right.

export type NewsCategory =
  | "regulatory"        // SEC, DOJ, FTC, FDA — government action
  | "corporate_action"  // M&A, divestiture, spin-off
  | "leadership"        // executive and auditor changes
  | "guidance"          // outlook raised or cut
  | "operational"       // recalls, plant closures, strikes, layoffs
  | "financing"         // debt raises, downgrades, covenant issues
  | "litigation"        // real lawsuits, not solicitation
  | "noise"             // everything below the bar

export interface ClassifiedItem {
  title: string
  source: string
  publishedAt: string
  category: NewsCategory
  material: boolean
  /** Why it was classified this way — always shown, never a bare verdict. */
  why: string
}

// ── Publishers whose output is structurally not news ───────────────────────
//
// These firms publish "investigation initiated on behalf of shareholders"
// releases about essentially any stock that has declined, and syndicate them
// through wire services so they dominate a naive headline count. They indicate
// a price drop, not wrongdoing. Treating them as legal exposure would mark most
// of the market as under investigation.
const SOLICITATION_FIRMS = [
  "kahn swick", "pomerantz", "rosen law", "the rosen", "bronstein", "levi & korsinsky",
  "schall law", "glancy prongay", "bragar eagel", "faruqi", "kessler topaz",
  "robbins geller", "block & leviton", "johnson fistel", "gross law", "howard g. smith",
  "hagens berman", "scott+scott", "berger montague", "labaton",
]

// Automated or aggregated content: price-move posts, ratings roundups,
// listicles. Not wrong, just not information about the business.
const CONTENT_FARMS = [
  "zacks", "stockstory", "simply wall st", "insider monkey", "247 wall st",
  "benzinga", "invezz", "tipranks", "marketbeat", "revelio labs", "gurufocus",
  "stocktwits", "investorplace", "the motley fool", "barchart",
]

// Publishers with editorial standards and primary reporting. Presence here
// raises confidence; absence is not itself disqualifying, since company press
// releases arrive over wires.
const PRIMARY_SOURCES = [
  "reuters", "bloomberg", "wall street journal", "financial times", "associated press",
  "cnbc", "business wire", "pr newswire", "globe newswire", "sec.gov", "barron",
  "washington post", "new york times", "axios", "politico",
]

// ── Material event vocabulary ──────────────────────────────────────────────
//
// Ordered by severity: the first rule that matches wins, so a headline
// containing both a subpoena and an analyst rating classifies as regulatory.
const RULES: Array<{ category: NewsCategory; patterns: RegExp; why: string }> = [
  {
    category: "regulatory",
    patterns: /\b(sec (charges|investigation|enforcement|subpoena)|department of justice|doj (probe|investigation|charges)|ftc (sues|blocks|investigation)|subpoena|consent decree|cease and desist|indictment|criminal (charges|probe))\b/i,
    why: "Names a government enforcement or investigative action, which is a legal fact rather than an allegation by a private party.",
  },
  {
    category: "regulatory",
    patterns: /\b(fda (approval|approves|rejects|clearance|warning letter|complete response)|clinical hold|recall(ed|s)? (of|due)|black box warning)\b/i,
    why: "A regulator decision that directly changes what the company is permitted to sell.",
  },
  {
    category: "corporate_action",
    patterns: /\b(to acquire|acquisition of|merger|to be acquired|takeover bid|tender offer|spin-?off|divest(iture|s|ing)?|sells? (its|the) .{0,30}(business|division|unit)|hsr waiting period)\b/i,
    why: "A transaction that changes what the company owns or who owns it.",
  },
  {
    category: "leadership",
    patterns: /\b((ceo|cfo|coo|chairman|president|auditor)s? (steps? down|resign|resigns|resigned|departs?|to leave|fired|ousted|terminated)|names? (new )?(ceo|cfo)|appoints? (new )?(ceo|cfo)|dismisses? .{0,20}auditor)\b/i,
    why: "A change in the people accountable for the numbers. CFO and auditor departures matter most.",
  },
  {
    category: "guidance",
    patterns: /\b(cuts? (its )?(guidance|outlook|forecast)|lowers? (its )?(guidance|outlook|forecast)|raises? (its )?(guidance|outlook|forecast)|withdraws? (its )?(guidance|outlook)|warns? on|profit warning|slashes? (outlook|forecast))\b/i,
    why: "Management changed what it expects, which is management's own revision to its own prior statement.",
  },
  {
    category: "operational",
    patterns: /\b(lay ?offs?|cuts? \d+[,\d]* jobs|plant closure|closes? (its )?(plant|factory)|strike|work stoppage|union (vote|contract)|production halt|supply (disruption|shortage)|data breach|cyberattack|ransomware)\b/i,
    why: "A disruption to the company's ability to operate or produce.",
  },
  {
    category: "financing",
    patterns: /\b(credit (rating )?downgrade|downgraded? by (moody|s&p|fitch)|covenant (breach|waiver|violation)|default(s|ed) on|bankruptcy|chapter 11|debt (offering|raise)|dilutive offering|going concern|delisting notice)\b/i,
    why: "Affects the company's access to capital or its ability to meet obligations.",
  },
  {
    category: "litigation",
    patterns: /\b(jury (awards?|finds?|verdict)|court (rules?|orders?)|settles? .{0,30}(lawsuit|claims?|litigation) for|\$[\d.]+ ?(m|b|million|billion) settlement|class action certified|appeals court)\b/i,
    why: "A court outcome or a settlement with a stated cost, as distinct from an announced intent to investigate.",
  },
]

function hasAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase()
  return needles.some(n => h.includes(n))
}

export function classifyItem(item: {
  title: string; source: string; publishedAt: string
}): ClassifiedItem {
  const combined = `${item.title} ${item.source}`
  const base = { title: item.title, source: item.source, publishedAt: item.publishedAt }

  // Solicitation is checked FIRST and unconditionally. These headlines contain
  // words like "investigation" and "securities law violations" that would
  // otherwise trip the regulatory rule — which is precisely how a naive filter
  // concludes that half the market is under federal investigation.
  if (hasAny(combined, SOLICITATION_FIRMS) ||
      /\b(investigat\w+ (on behalf of|for) (investors|shareholders)|encourages? investors|deadline reminder|lead plaintiff|class period)\b/i.test(item.title)) {
    return {
      ...base, category: "noise", material: false,
      why: "Plaintiff-firm solicitation. These are published about nearly any stock that has declined and indicate a price drop, not wrongdoing.",
    }
  }

  if (hasAny(item.source, CONTENT_FARMS) ||
      /\b(is it (still )?a (buy|sell)|should you buy|stock (jumps?|falls?|rises?|drops?|slides?|soars?|moves?)|price target|(upgraded?|downgraded?) (to|by) (buy|sell|hold|neutral|overweight)|analyst(s)? (say|rate)|\d+ (stocks?|reasons)|why .{0,25} stock)\b/i.test(item.title)) {
    return {
      ...base, category: "noise", material: false,
      why: "Automated price-movement or ratings content rather than information about the business.",
    }
  }

  for (const rule of RULES) {
    if (rule.patterns.test(item.title)) {
      const primary = hasAny(item.source, PRIMARY_SOURCES)
      return {
        ...base, category: rule.category, material: true,
        why: primary ? `${rule.why} Reported by ${item.source}.` : rule.why,
      }
    }
  }

  return {
    ...base, category: "noise", material: false,
    why: "No material event language matched.",
  }
}

export interface ClassifiedNews {
  material: ClassifiedItem[]
  noiseCount: number
  categories: NewsCategory[]
  riskPenalty: number
  summary: string
}

// Categories that count against the company. Corporate actions and guidance
// raises are material but directionally neutral, so they are surfaced without
// being penalised.
const ADVERSE: NewsCategory[] = ["regulatory", "operational", "financing", "litigation"]

export function classifyNews(items: Array<{ title: string; source: string; publishedAt: string }>): ClassifiedNews {
  const classified = items.map(classifyItem)
  const material = classified.filter(c => c.material)
  const categories = [...new Set(material.map(c => c.category))]

  const adverseCount = material.filter(c => ADVERSE.includes(c.category)).length
  // Capped low on purpose. A press cycle is not a business fundamental, and
  // sentiment decays far faster than anything in a filing.
  const riskPenalty = Math.min(adverseCount * 5, 15)

  const summary = material.length === 0
    ? `Scanned ${items.length} recent headlines and found no material corporate events — the coverage is price commentary and aggregator content.`
    : `${material.length} material development${material.length === 1 ? "" : ""} across ${categories.join(", ")}, from ${items.length} headlines scanned. The remaining ${classified.length - material.length} were price commentary or plaintiff-firm solicitation.`

  return { material, noiseCount: classified.length - material.length, categories, riskPenalty, summary }
}
