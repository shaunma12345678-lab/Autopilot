-- Run in Supabase SQL Editor. Additive + idempotent.
-- Lead decay: a discovery event is worth most the day it is filed, because the
-- edge is reading speed, not access. Stored rather than computed on read so the
-- database can order and paginate on it.
ALTER TABLE "DiscoveryEvent" ADD COLUMN IF NOT EXISTS "decayedPriority"  DOUBLE PRECISION;
ALTER TABLE "DiscoveryEvent" ADD COLUMN IF NOT EXISTS "decayRefreshedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "DiscoveryEvent_processed_decayedPriority_idx"
  ON "DiscoveryEvent"("processed", "decayedPriority");
