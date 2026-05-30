/** Returns true if the error is a Prisma/Postgres "table does not exist" error. */
export function isMissingTableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("p2021") ||
    msg.includes("table") && msg.includes("not found")
  )
}
