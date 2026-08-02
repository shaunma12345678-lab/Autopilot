// GitHub dev-activity signal — free API, used as a leading indicator of
// whether a crypto protocol is actively maintained or effectively abandoned.
// Unauthenticated GitHub API is rate-limited to 60 req/hour; set GITHUB_TOKEN
// to raise that to 5000/hour if this vertical sees real usage.

function parseOwnerRepo(githubUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(githubUrl)
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1] }
  } catch {
    return null
  }
}

export interface DevActivity {
  contributorCount: number
  commitsLast12Weeks: number
  devActivityScore: number // 0-100 heuristic: commit volume + contributor breadth
}

export async function getDevActivity(githubRepoUrl: string | null): Promise<DevActivity | null> {
  if (!githubRepoUrl) return null
  const parsed = parseOwnerRepo(githubRepoUrl)
  if (!parsed) return null

  try {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" }
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/stats/contributors`,
      { headers, signal: AbortSignal.timeout(10000) }
    )
    // GitHub returns 202 while it computes stats for a repo it hasn't cached yet —
    // treat as "not available this run" rather than an error.
    if (res.status === 202 || !res.ok) return null

    const data = await res.json() as Array<{ weeks: Array<{ w: number; c: number }> }>
    if (!Array.isArray(data) || data.length === 0) return null

    const twelveWeeksAgo = Date.now() / 1000 - 12 * 7 * 24 * 60 * 60
    let commitsLast12Weeks = 0
    for (const contributor of data) {
      for (const week of contributor.weeks ?? []) {
        if (week.w >= twelveWeeksAgo) commitsLast12Weeks += week.c
      }
    }
    const contributorCount = data.length
    const devActivityScore = Math.round(
      Math.min(commitsLast12Weeks / 2, 70) + Math.min(contributorCount * 3, 30)
    )

    return { contributorCount, commitsLast12Weeks, devActivityScore }
  } catch {
    return null
  }
}
