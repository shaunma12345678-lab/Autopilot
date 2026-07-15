// Today's 30-yr mortgage rate (Freddie Mac PMMS, keyless, cached in-module).
// Public on purpose: it exposes only a nationally published number, and the
// per-property Exit Playbook needs it from every surface without auth plumbing.

export const maxDuration = 25

import { mortgageRate30 } from "@/lib/rental-intel"

export async function GET() {
  const rate30 = await mortgageRate30()
  return Response.json(
    { rate30, source: rate30 != null ? "Freddie Mac PMMS" : null },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  )
}
