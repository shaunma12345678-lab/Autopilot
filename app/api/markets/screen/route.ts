// User-defined screens over the full analysis dataset.
//
// GET  — returns the filterable field catalogue with plain-language help, so a
//        user is never filtering on a number whose meaning is unstated.
// POST — runs a screen spec.
//
// Fields are an allowlist: a user-supplied name is looked up and rejected if
// absent, never interpolated. This is a filter language, not a query language.

export const maxDuration = 60

import { NextRequest } from "next/server"
import { isMarketsAuthorized } from "@/lib/markets-auth"
import { FIELDS, validateSpec, runScreen, type ScreenSpec } from "@/lib/screen-builder"

export async function GET(request: NextRequest) {
  if (!(await isMarketsAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  return Response.json({
    fields: Object.entries(FIELDS).map(([name, d]) => ({ name, ...d })),
    example: {
      filters: [
        { field: "valuationScore", op: "gte", value: 60 },
        { field: "piotroskiScore", op: "gte", value: 6 },
        { field: "altmanZone", op: "eq", value: "safe" },
        { field: "hasRestatement", op: "eq", value: false },
        { field: "dataConfidence", op: "in", value: ["medium", "high"] },
      ],
      sortBy: "valuationScore",
      limit: 25,
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isMarketsAuthorized(request))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    const spec = await request.json() as ScreenSpec

    const errors = validateSpec(spec)
    if (errors.length > 0) {
      return Response.json({ error: "Invalid screen", details: errors }, { status: 400 })
    }

    const result = await runScreen(spec)
    return Response.json(result)
  } catch (err) {
    console.error("[markets/screen POST]", err)
    return Response.json({ error: "Failed to run screen" }, { status: 500 })
  }
}
