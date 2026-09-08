// Deterministic editorial checks on finished copy.
//
// THE ASYMMETRY THIS CLOSES. The idea pipeline is ruthless: premises are
// generated wide, critiqued until half die, then scored on eleven dimensions.
// The actual WRITING then went out on a single model call with nothing looking
// at it — no critique, no verification, no check that it was even complete.
// The stage that produces the thing a customer reads was the only stage with no
// quality gate on it at all.
//
// Everything here is deterministic. A model asked "is this good writing?" will
// say yes to its own output, which is why the checks that matter are the ones
// arithmetic and pattern-matching can settle: is every number traceable to the
// grounding, are the required sections present, does it end mid-sentence, is
// the rhythm monotone. Those are facts, and facts are checkable.
//
// WHAT THIS IS NOT. It is not a detector-avoidance pass. Nothing here tests
// output against a classifier or mutates text to move a score. It is a fixed
// editorial rubric — the same notes a line editor gives — applied consistently.

export type Severity = "fatal" | "major" | "minor"

export interface ProseIssue {
  code: string
  severity: Severity
  message: string
  /** The offending text, so a revision pass can be told exactly what to fix. */
  evidence?: string
}

export interface ProseStats {
  words: number
  sentences: number
  avgSentenceWords: number
  /** Standard deviation of sentence length. Flat prose reads as a drone. */
  sentenceVariation: number
  /** Rough spoken duration, for formats measured in seconds. */
  readingSeconds: number
}

export interface ProseReport {
  issues: ProseIssue[]
  stats: ProseStats
  /** 0-100. Fatals dominate, because a truncated script is not "87% good". */
  score: number
  passed: boolean
}

export interface ProseCheckOptions {
  kind: string
  /** The grounding the writer was given. Numbers must trace back to it. */
  context?: string
  /** Sections that must be present, matched case-insensitively. */
  requiredSections?: string[]
  requireCta?: boolean
}

// ── Editorial rubric ──────────────────────────────────────────────────────────

// Phrases that survive in copy only because nobody read it back. Each one is
// filler standing where a specific claim belongs.
const CLICHES = [
  "in today's fast-paced", "in today's world", "in the world of", "when it comes to",
  "at the end of the day", "the fact of the matter", "needless to say",
  "it's no secret that", "let's dive in", "let's dive into", "dive deep",
  "game-changer", "game changer", "game-changing", "revolutionize", "revolutionary",
  "unlock the power", "unlock the secret", "unleash", "supercharge", "turbocharge",
  "take it to the next level", "next-level", "cutting-edge", "state-of-the-art",
  "seamless", "seamlessly", "robust solution", "leverage the power",
  "delve into", "navigate the", "tapestry", "testament to", "plethora",
  "elevate your", "transform your", "embark on", "journey towards",
  "look no further", "the ultimate guide", "you won't believe",
  "little did they know", "the results speak for themselves",
]

// Openers that waste the only line that decides whether anyone keeps watching.
const WEAK_OPENERS = [
  "in today's", "have you ever", "are you tired of", "did you know that",
  "let me tell you", "so basically", "hey guys", "hi everyone", "welcome back",
  "as a business owner", "in this video", "in this post", "i wanted to talk about",
]

// Text the writer was told to replace and did not.
const PLACEHOLDERS = [
  "[insert", "[your ", "[business name", "[name here", "[add ", "[describe",
  "talk about x", "talk about your", "mention your", "todo", "tbd", "lorem ipsum",
  "xxx", "[etc", "and so on...", "placeholder",
]

const CTA_SIGNALS = [
  "call", "book", "dm", "message us", "comment", "link in bio", "come in",
  "visit", "text us", "click", "swipe", "tap", "order", "reserve", "stop by",
  "sign up", "subscribe", "follow", "save this", "share this", "send this",
  "schedule", "walk in", "drop by", "get yours", "grab",
  "contact", "reach out", "get started", "learn more", "apply", "join",
  "email us", "book now", "shop", "claim", "download", "register",
]

const SEVERITY_PENALTY: Record<Severity, number> = { fatal: 40, major: 12, minor: 4 }

// ── Text preparation ──────────────────────────────────────────────────────────

/** Spoken words only — direction blocks and speaker labels are not prose. */
function spokenText(body: string): string {
  return body
    .replace(/\[[^\]]*\]/g, " ")            // [b-roll], [on-screen text]
    .replace(/\([^)]*\)/g, " ")             // (action)
    .replace(/^===.*$/gm, " ")              // === SECTION ===
    .replace(/^[A-Z][A-Z ']{1,24}:/gm, " ") // SPEAKER:
    .replace(/^\s*\d+[.)]\s*/gm, " ")       // numbered beats
    .replace(/#[\w]+/g, " ")                // hashtags
    .replace(/\s{2,}/g, " ")
    .trim()
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2)
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// ── Number tracing ────────────────────────────────────────────────────────────

/**
 * Numbers that read as claims, as opposed to structure.
 *
 * "Slide 3" and "beat 2" are scaffolding; "$1,200" and "37%" are assertions
 * about the world, and an invented one is the single most damaging thing this
 * pipeline can emit. A number counts as a claim when it carries a unit or is
 * large enough that nobody writes it by accident.
 */
export function claimNumbers(text: string): string[] {
  const cleaned = text.replace(/\[[^\]]*\]/g, " ")

  const patterns = [
    /\$\s?\d[\d,]*(?:\.\d+)?[kKmMbB]?/g,        // $1,200  $2.4M
    /\d[\d,]*(?:\.\d+)?\s?%/g,                   // 37%
    /\b\d[\d,]*(?:\.\d+)?\s?[kKmMbB]\b/g,        // 40k  2.4M
    /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g,         // 1,200
    /\b\d+\.\d+\b/g,                             // 2.5
    /\b\d{3,}\b/g,                               // 250
  ]

  // Spans are tracked, not just strings: the patterns deliberately overlap, so
  // "$687,000" also matches as "687,000", "687" and "000". Reporting one
  // invented figure four times would both bury the real defect list and
  // multiply the penalty for a single mistake.
  const spans: Array<{ start: number; end: number; text: string }> = []
  for (const p of patterns) {
    for (const m of cleaned.matchAll(p)) {
      if (m.index === undefined) continue
      spans.push({ start: m.index, end: m.index + m[0].length, text: m[0].trim() })
    }
  }

  // A two-digit number attached to a plural noun is a claim about the world
  // ("40 customers", "25 years"), while the small integers that run a list
  // ("5 tips", "slide 3") are scaffolding. Twenty is the floor because almost
  // nothing structural counts that high.
  for (const m of cleaned.matchAll(/\b([2-9]\d)\s+([a-z]{3,}s)\b/gi)) {
    if (m.index === undefined) continue
    spans.push({ start: m.index, end: m.index + m[1].length, text: m[1] })
  }

  // Keep only the widest match covering each position.
  const widest = spans.filter((s) => !spans.some((o) =>
    o !== s && o.start <= s.start && o.end >= s.end && (o.end - o.start) > (s.end - s.start)))

  return [...new Set(widest.map((s) => s.text))]
}

/** Digits only, so "$1,200" and "1200" compare equal. */
function numericCore(token: string): string {
  return token.replace(/[^\d.]/g, "").replace(/\.0+$/, "")
}

function contextSupportsNumber(token: string, context: string): boolean {
  const core = numericCore(token)
  if (!core) return true
  if (context.includes(core)) return true

  // "$2.4M" in the copy may be written "2,400,000" in the grounding.
  const scale = /[kK]$/.test(token) ? 1_000 : /[mM]$/.test(token) ? 1_000_000 : /[bB]$/.test(token) ? 1_000_000_000 : 1
  if (scale > 1) {
    const expanded = Math.round(parseFloat(core) * scale)
    if (Number.isFinite(expanded)) {
      if (context.includes(String(expanded))) return true
      if (context.includes(expanded.toLocaleString("en-US"))) return true
    }
  }
  // A grounding figure of 1,200 satisfies a copy figure of 1200.
  const withCommas = Number(core).toLocaleString("en-US")
  return withCommas !== "NaN" && context.includes(withCommas)
}

// ── The check ─────────────────────────────────────────────────────────────────

export function checkProse(body: string, options: ProseCheckOptions): ProseReport {
  const issues: ProseIssue[] = []
  const text = (body ?? "").trim()
  const spoken = spokenText(text)
  const sentences = sentencesOf(spoken)
  const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length)
  const words = wordCounts.reduce((a, b) => a + b, 0)

  const stats: ProseStats = {
    words,
    sentences: sentences.length,
    avgSentenceWords: sentences.length ? Math.round((words / sentences.length) * 10) / 10 : 0,
    sentenceVariation: Math.round(standardDeviation(wordCounts) * 10) / 10,
    readingSeconds: Math.round((words / 2.6) * 10) / 10,   // ~156 spoken wpm
  }

  const add = (code: string, severity: Severity, message: string, evidence?: string) =>
    issues.push({ code, severity, message, evidence })

  // Empty or stub output.
  if (words < 20) {
    add("too-short", "fatal", `Only ${words} words of actual copy — the deliverable is missing.`)
  }

  // Truncation. The most common real failure, and invisible without a check:
  // the model hits its token ceiling and the copy simply stops.
  if (text.length > 0 && !/[.!?"'’”\])]$/.test(text.trimEnd())) {
    add("truncated", "fatal", "Ends mid-sentence — the output was cut off before it finished.",
        text.trimEnd().slice(-70))
  }

  // Required sections, for multi-part deliverables.
  for (const section of options.requiredSections ?? []) {
    if (!text.toLowerCase().includes(section.toLowerCase())) {
      add("missing-section", "fatal", `The "${section}" section is missing.`, section)
    }
  }

  // Numbers must trace to the grounding.
  if (options.context) {
    const unsupported = claimNumbers(text).filter((n) => !contextSupportsNumber(n, options.context!))
    for (const n of unsupported.slice(0, 8)) {
      add("unsupported-number", "fatal",
          `The figure ${n} does not appear anywhere in the grounding — it was invented.`, n)
    }
  }

  // Placeholders the writer was told to fill in.
  const lower = text.toLowerCase()
  for (const p of PLACEHOLDERS) {
    if (lower.includes(p)) add("placeholder", "fatal", `Unfilled placeholder left in the copy: "${p}".`, p)
  }

  // The hook.
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("===")) ?? ""
  const hook = firstLine.replace(/^[A-Z][A-Z ']{1,24}:\s*/, "").replace(/\[[^\]]*\]/g, "").trim()
  if (hook.length > 120) {
    add("hook-too-long", "major", `The opening line is ${hook.length} characters — it has to land in about 1.5 seconds.`, hook.slice(0, 90))
  }
  const weak = WEAK_OPENERS.find((w) => hook.toLowerCase().startsWith(w))
  if (weak) add("weak-opener", "major", `Opens with "${weak}" — the one line that decides whether anyone stays is spent on filler.`, hook.slice(0, 90))

  // Clichés.
  const foundCliches = CLICHES.filter((c) => lower.includes(c))
  for (const c of foundCliches.slice(0, 6)) {
    add("cliche", "major", `"${c}" is filler standing where a specific claim belongs.`, c)
  }

  // Rhythm. Uniform sentence length is the clearest signal of unedited prose.
  if (sentences.length >= 5 && stats.sentenceVariation < 3) {
    add("monotone-rhythm", "major",
        `Every sentence is about the same length (variation ${stats.sentenceVariation}). Vary short and long lines.`)
  }
  if (stats.avgSentenceWords > 28) {
    add("run-on", "major", `Sentences average ${stats.avgSentenceWords} words — too long to say out loud.`)
  }

  // Repeated openers.
  const openers = sentences.map((s) => s.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean)
  const openerCounts = new Map<string, number>()
  for (const o of openers) openerCounts.set(o!, (openerCounts.get(o!) ?? 0) + 1)
  for (const [word, count] of openerCounts) {
    if (count >= 3 && word.length > 2) {
      add("repeated-opener", "minor", `${count} sentences open with "${word}".`, word)
    }
  }

  // A call to action, where the format is supposed to sell something.
  if (options.requireCta) {
    const tail = lower.slice(-500)
    if (!CTA_SIGNALS.some((c) => tail.includes(c))) {
      add("no-cta", "major", "No call to action — the copy ends without asking the reader to do anything.")
    }
  }

  const penalty = issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0)
  const score = Math.max(0, 100 - penalty)
  const passed = !issues.some((i) => i.severity === "fatal") && score >= 60

  return { issues, stats, score, passed }
}

/** The issue list as revision instructions, most severe first. */
export function issuesAsInstructions(report: ProseReport): string {
  const order: Severity[] = ["fatal", "major", "minor"]
  return [...report.issues]
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .map((i) => `- [${i.severity}] ${i.message}${i.evidence ? ` (found: "${i.evidence}")` : ""}`)
    .join("\n")
}
