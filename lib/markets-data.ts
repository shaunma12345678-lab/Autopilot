// Curated investor markets. The TOP list is the established strong markets
// investors target; UPCOMING is lower-cost, high-potential cities. Each carries
// a short "why" (the consensus thesis) and a tag. Live deep-search analysis runs
// when a city is clicked — these lists set the starting point, the live data
// (distress, equity, rent yield) refines it.

export interface Market { city: string; state: string; tag: "cash flow" | "appreciation" | "balanced"; why: string }

export const TOP_MARKETS: Market[] = [
  { city: "Tampa",          state: "FL", tag: "balanced",     why: "No state income tax, strong job + population growth, landlord-friendly, solid price-to-rent." },
  { city: "Jacksonville",   state: "FL", tag: "cash flow",    why: "Affordable entries, growing port/logistics economy, good rent yields." },
  { city: "Orlando",        state: "FL", tag: "appreciation", why: "Tourism + tech jobs, heavy in-migration, strong short-term-rental demand." },
  { city: "Dallas",         state: "TX", tag: "balanced",     why: "Massive job growth, corporate relocations, no state income tax." },
  { city: "San Antonio",    state: "TX", tag: "cash flow",    why: "Low cost of entry, military + healthcare base, steady rents." },
  { city: "Houston",        state: "TX", tag: "cash flow",    why: "Huge diversified economy, affordable, strong rental demand." },
  { city: "Atlanta",        state: "GA", tag: "balanced",     why: "Corporate hub, in-migration, good balance of cash flow + appreciation." },
  { city: "Charlotte",      state: "NC", tag: "appreciation", why: "Banking + tech growth, fast population gains, appreciation play." },
  { city: "Raleigh",        state: "NC", tag: "appreciation", why: "Research Triangle jobs, educated in-migration, strong appreciation." },
  { city: "Nashville",      state: "TN", tag: "appreciation", why: "No income tax, music/health/tech jobs, big STR market." },
  { city: "Phoenix",        state: "AZ", tag: "balanced",     why: "Sun-belt migration, semiconductor jobs, large flip volume." },
  { city: "Indianapolis",   state: "IN", tag: "cash flow",    why: "Cheap entries, landlord-friendly, strong cash flow / price-to-rent." },
  { city: "Columbus",       state: "OH", tag: "balanced",     why: "Intel plants + state capital stability, affordable, rising rents." },
  { city: "Kansas City",    state: "MO", tag: "cash flow",    why: "Affordable, central logistics hub, dependable cash flow." },
  { city: "Birmingham",     state: "AL", tag: "cash flow",    why: "Very low entry, high gross yields, classic cash-flow market." },
  { city: "Memphis",        state: "TN", tag: "cash flow",    why: "Logistics (FedEx) economy, low prices, top-tier rent yields." },
  { city: "Cleveland",      state: "OH", tag: "cash flow",    why: "Some of the highest gross yields in the US, low cost of entry." },
  { city: "Cincinnati",     state: "OH", tag: "balanced",     why: "Affordable, stable employers, improving appreciation." },
  { city: "Las Vegas",      state: "NV", tag: "appreciation", why: "No income tax, tourism + STR demand, strong in-migration." },
  { city: "Austin",         state: "TX", tag: "appreciation", why: "Tech magnet, long-term appreciation leader (watch affordability)." },
]

export const UPCOMING_MARKETS: Market[] = [
  { city: "Detroit",        state: "MI", tag: "cash flow",    why: "Rock-bottom entries + redevelopment; high yields for the brave." },
  { city: "Toledo",         state: "OH", tag: "cash flow",    why: "Very low prices, strong rent-to-price; emerging cash-flow pick." },
  { city: "Dayton",         state: "OH", tag: "cash flow",    why: "Cheap, stable rents, improving downtown — under-the-radar." },
  { city: "Akron",          state: "OH", tag: "cash flow",    why: "Affordable Midwest yields, low competition." },
  { city: "Buffalo",        state: "NY", tag: "balanced",     why: "Low cost, steady appreciation, revitalizing economy." },
  { city: "Pittsburgh",     state: "PA", tag: "balanced",     why: "Eds-and-meds + tech, affordable, durable rents." },
  { city: "St. Louis",      state: "MO", tag: "cash flow",    why: "Cheap entries, solid yields, large rental base." },
  { city: "Oklahoma City",  state: "OK", tag: "cash flow",    why: "Low cost, energy + jobs, rising rents, landlord-friendly." },
  { city: "Little Rock",    state: "AR", tag: "cash flow",    why: "Inexpensive, stable demand, high gross yields." },
  { city: "Augusta",        state: "GA", tag: "cash flow",    why: "Cyber/military growth (Fort Eisenhower), cheap, growing." },
  { city: "Huntsville",     state: "AL", tag: "appreciation", why: "Aerospace/defense boom, fast growth, still affordable." },
  { city: "Spartanburg",    state: "SC", tag: "appreciation", why: "Manufacturing (BMW) corridor growth, low cost, rising values." },
]
