// City registry for the programmatic /sell/[city] SEO pages. Each entry
// renders a localized homeowner-help page ("sell my house fast / stop
// foreclosure in {city}") that feeds the inbound-seller channel. Curated:
// the SoCal home market first, then the top investor metros already used
// elsewhere in the platform (markets-data, county connectors).

export interface SellCity {
  slug: string
  city: string
  state: string      // 2-letter
  stateName: string
  county: string
}

const c = (slug: string, city: string, state: string, stateName: string, county: string): SellCity =>
  ({ slug, city, state, stateName, county })

export const SELL_CITIES: SellCity[] = [
  // ── Southern California (home turf) ─────────────────────────────────────
  c("los-angeles-ca", "Los Angeles", "CA", "California", "Los Angeles"),
  c("long-beach-ca", "Long Beach", "CA", "California", "Los Angeles"),
  c("pomona-ca", "Pomona", "CA", "California", "Los Angeles"),
  c("palmdale-ca", "Palmdale", "CA", "California", "Los Angeles"),
  c("lancaster-ca", "Lancaster", "CA", "California", "Los Angeles"),
  c("compton-ca", "Compton", "CA", "California", "Los Angeles"),
  c("inglewood-ca", "Inglewood", "CA", "California", "Los Angeles"),
  c("san-diego-ca", "San Diego", "CA", "California", "San Diego"),
  c("chula-vista-ca", "Chula Vista", "CA", "California", "San Diego"),
  c("oceanside-ca", "Oceanside", "CA", "California", "San Diego"),
  c("escondido-ca", "Escondido", "CA", "California", "San Diego"),
  c("riverside-ca", "Riverside", "CA", "California", "Riverside"),
  c("moreno-valley-ca", "Moreno Valley", "CA", "California", "Riverside"),
  c("corona-ca", "Corona", "CA", "California", "Riverside"),
  c("perris-ca", "Perris", "CA", "California", "Riverside"),
  c("hemet-ca", "Hemet", "CA", "California", "Riverside"),
  c("indio-ca", "Indio", "CA", "California", "Riverside"),
  c("san-bernardino-ca", "San Bernardino", "CA", "California", "San Bernardino"),
  c("fontana-ca", "Fontana", "CA", "California", "San Bernardino"),
  c("rialto-ca", "Rialto", "CA", "California", "San Bernardino"),
  c("victorville-ca", "Victorville", "CA", "California", "San Bernardino"),
  c("hesperia-ca", "Hesperia", "CA", "California", "San Bernardino"),
  c("ontario-ca", "Ontario", "CA", "California", "San Bernardino"),
  c("chino-ca", "Chino", "CA", "California", "San Bernardino"),
  c("chino-hills-ca", "Chino Hills", "CA", "California", "San Bernardino"),
  c("anaheim-ca", "Anaheim", "CA", "California", "Orange"),
  c("santa-ana-ca", "Santa Ana", "CA", "California", "Orange"),
  c("garden-grove-ca", "Garden Grove", "CA", "California", "Orange"),

  // ── Top investor metros (already covered by county/data connectors) ─────
  c("memphis-tn", "Memphis", "TN", "Tennessee", "Shelby"),
  c("detroit-mi", "Detroit", "MI", "Michigan", "Wayne"),
  c("chicago-il", "Chicago", "IL", "Illinois", "Cook"),
  c("indianapolis-in", "Indianapolis", "IN", "Indiana", "Marion"),
  c("phoenix-az", "Phoenix", "AZ", "Arizona", "Maricopa"),
  c("mesa-az", "Mesa", "AZ", "Arizona", "Maricopa"),
  c("glendale-az", "Glendale", "AZ", "Arizona", "Maricopa"),
  c("kansas-city-mo", "Kansas City", "MO", "Missouri", "Jackson"),
  c("cleveland-oh", "Cleveland", "OH", "Ohio", "Cuyahoga"),
  c("columbus-oh", "Columbus", "OH", "Ohio", "Franklin"),
  c("cincinnati-oh", "Cincinnati", "OH", "Ohio", "Hamilton"),
  c("st-louis-mo", "St. Louis", "MO", "Missouri", "St. Louis"),
  c("birmingham-al", "Birmingham", "AL", "Alabama", "Jefferson"),
  c("jacksonville-fl", "Jacksonville", "FL", "Florida", "Duval"),
  c("tampa-fl", "Tampa", "FL", "Florida", "Hillsborough"),
  c("orlando-fl", "Orlando", "FL", "Florida", "Orange"),
  c("ocala-fl", "Ocala", "FL", "Florida", "Marion"),
  c("atlanta-ga", "Atlanta", "GA", "Georgia", "Fulton"),
  c("houston-tx", "Houston", "TX", "Texas", "Harris"),
  c("san-antonio-tx", "San Antonio", "TX", "Texas", "Bexar"),
  c("dallas-tx", "Dallas", "TX", "Texas", "Dallas"),
  c("fort-worth-tx", "Fort Worth", "TX", "Texas", "Tarrant"),
  c("oklahoma-city-ok", "Oklahoma City", "OK", "Oklahoma", "Oklahoma"),
  c("tulsa-ok", "Tulsa", "OK", "Oklahoma", "Tulsa"),
  c("milwaukee-wi", "Milwaukee", "WI", "Wisconsin", "Milwaukee"),
  c("pittsburgh-pa", "Pittsburgh", "PA", "Pennsylvania", "Allegheny"),
  c("philadelphia-pa", "Philadelphia", "PA", "Pennsylvania", "Philadelphia"),
  c("baltimore-md", "Baltimore", "MD", "Maryland", "Baltimore"),
  c("las-vegas-nv", "Las Vegas", "NV", "Nevada", "Clark"),
  c("buffalo-ny", "Buffalo", "NY", "New York", "Erie"),
  c("rochester-ny", "Rochester", "NY", "New York", "Monroe"),
  c("louisville-ky", "Louisville", "KY", "Kentucky", "Jefferson"),
  c("knoxville-tn", "Knoxville", "TN", "Tennessee", "Knox"),
  c("greensboro-nc", "Greensboro", "NC", "North Carolina", "Guilford"),
  c("winston-salem-nc", "Winston-Salem", "NC", "North Carolina", "Forsyth"),
  c("columbia-sc", "Columbia", "SC", "South Carolina", "Richland"),
  c("montgomery-al", "Montgomery", "AL", "Alabama", "Montgomery"),
]

export function findSellCity(slug: string): SellCity | null {
  return SELL_CITIES.find((x) => x.slug === slug) ?? null
}
