// Sitemap for the public, indexable surface: the homeowner portal, every
// programmatic city page, the free deal analyzer, and the proof page.

import type { MetadataRoute } from "next"
import { SELL_CITIES } from "@/lib/sell-cities"

const BASE = "https://autopilot-gold.vercel.app"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/sell`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/analyze`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/proof`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...SELL_CITIES.map((c) => ({
      url: `${BASE}/sell/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ]
}
