import type { GeoBox } from "@/lib/geocoding"

// Hardcoded bounding boxes — no geocoding API call needed for county-level searches
export const COUNTY_BOXES: Record<string, GeoBox> = {
  "san-diego": {
    south: 32.53, north: 33.51, west: -117.60, east: -116.08,
    centerLat: 33.02, centerLng: -116.84, radiusMiles: 60,
  },
  "riverside": {
    south: 33.43, north: 34.08, west: -117.67, east: -115.40,
    centerLat: 33.76, centerLng: -116.54, radiusMiles: 70,
  },
  "san-bernardino": {
    south: 33.68, north: 35.81, west: -117.67, east: -114.43,
    centerLat: 34.75, centerLng: -116.05, radiusMiles: 100,
  },
  "orange": {
    south: 33.38, north: 33.95, west: -118.12, east: -117.41,
    centerLat: 33.67, centerLng: -117.77, radiusMiles: 30,
  },
  "los-angeles": {
    south: 33.70, north: 34.82, west: -118.95, east: -117.64,
    centerLat: 34.26, centerLng: -118.30, radiusMiles: 65,
  },
}

// Split a bounding box into a cols×rows grid of sub-boxes.
// Each sub-box covers an equal fraction of the original area.
// Querying each tile separately can yield 4-9x more results from
// APIs that cap results per bounding-box query (Zillow, Redfin).
export function tileBox(box: GeoBox, cols: number, rows: number): GeoBox[] {
  const latStep = (box.north - box.south) / rows
  const lngStep = (box.east - box.west) / cols
  const tiles: GeoBox[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const south = box.south + r * latStep
      const north = south + latStep
      const west  = box.west  + c * lngStep
      const east  = west  + lngStep
      tiles.push({
        south, north, west, east,
        centerLat:   (south + north) / 2,
        centerLng:   (west  + east)  / 2,
        radiusMiles: box.radiusMiles / Math.max(cols, rows),
      })
    }
  }

  return tiles
}

// Returns the grid dimensions for a target lead count.
// More leads → more tiles → more API queries → higher total.
export function tilesForTarget(maxLeads: number): { cols: number; rows: number } {
  if (maxLeads <= 100) return { cols: 2, rows: 2 }  // 4 tiles
  if (maxLeads <= 200) return { cols: 2, rows: 3 }  // 6 tiles
  if (maxLeads <= 300) return { cols: 3, rows: 3 }  // 9 tiles
  if (maxLeads <= 400) return { cols: 3, rows: 4 }  // 12 tiles
  return                      { cols: 4, rows: 4 }  // 16 tiles
}

// Run an array of async factories with at most `limit` running at once.
// Preserves output order relative to input order.
export async function withConcurrency<T>(
  fns: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: (T | undefined)[] = new Array(fns.length)
  let next = 0

  async function worker() {
    while (next < fns.length) {
      const i = next++
      try {
        results[i] = await fns[i]()
      } catch {
        results[i] = undefined
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker))
  return results.filter((r): r is T => r !== undefined)
}
