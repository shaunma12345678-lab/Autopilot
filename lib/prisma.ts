// Supabase REST-based database client — works on Vercel (IPv4 port 443).
// Direct PostgreSQL is IPv6-only on Supabase free tier and unreachable from Vercel serverless.
// All routes import { prisma } from "@/lib/prisma" and get the REST client transparently.

import { db } from "@/lib/db"
import type { PrismaClient } from "@/app/generated/prisma/client"

// Cast to PrismaClient so TypeScript uses the generated types across all routes and pages.
// The runtime implementation uses Supabase REST API for every query.
export const prisma = db as unknown as PrismaClient
