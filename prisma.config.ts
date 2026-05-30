import * as dotenv from "dotenv"
import { defineConfig } from "prisma/config"

// Load .env.local first (Next.js convention), then fall back to .env
dotenv.config({ path: ".env.local" })
dotenv.config({ path: ".env" })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Always use the pooled PgBouncer URL for application connections.
    // DIRECT_URL is only for Prisma CLI migrations (handled separately).
    url: process.env["DATABASE_URL"],
  },
})
