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
  { city: "Buffalo",        state: "NY", tag: "balanced",     why: "Black Rock + revitalization; decent appreciation, good for renting." },
  { city: "Peoria",         state: "IL", tag: "cash flow",    why: "Great price-to-rent, cheap entries — strong rental cash flow." },
  { city: "Rochester",      state: "NY", tag: "cash flow",    why: "Low prices, high rent-to-price, eds-and-meds base." },
  { city: "Durham",         state: "NC", tag: "appreciation", why: "Research Triangle + Chapel Hill demand, educated growth." },
  { city: "Knoxville",      state: "TN", tag: "appreciation", why: "No income tax, growing, affordable — appreciation + rent." },
  { city: "Montgomery",     state: "AL", tag: "cash flow",    why: "Very low entry, high gross yields, stable government base." },
  { city: "Fort Wayne",     state: "IN", tag: "cash flow",    why: "Cheap, landlord-friendly Indiana, dependable cash flow." },
  { city: "Colorado Springs", state: "CO", tag: "appreciation", why: "Military + tech growth, strong in-migration." },
  { city: "Twin Falls",     state: "ID", tag: "appreciation", why: "Fast-growing small market, agribusiness + low cost." },
  { city: "Fort Worth",     state: "TX", tag: "balanced",     why: "DFW growth, no income tax, big flip + rental volume." },
  { city: "Columbia",       state: "SC", tag: "cash flow",    why: "Low price, high rent — capital + university base." },
  { city: "Greenville",     state: "SC", tag: "cash flow",    why: "Low prices, high rent, manufacturing corridor growth." },
  { city: "Des Moines",     state: "IA", tag: "balanced",     why: "Insurance/finance jobs, stable, solid price-to-rent." },
  { city: "McKinney",       state: "TX", tag: "appreciation", why: "Fast-growing DFW suburb, strong demand." },
  { city: "Cincinnati",     state: "OH", tag: "balanced",     why: "~7% vacancy, affordable, stable employers." },
  { city: "Louisville",     state: "KY", tag: "balanced",     why: "Logistics hub, a little faster-growing, affordable." },
  { city: "Greensboro",     state: "NC", tag: "cash flow",    why: "Good price-to-rent ratio, low cost of entry." },
  { city: "Winston-Salem",  state: "NC", tag: "cash flow",    why: "Affordable NC, healthcare base, solid yields." },
  { city: "Kansas City",    state: "MO", tag: "cash flow",    why: "Central logistics hub, dependable cash flow." },
  { city: "Hattiesburg",    state: "MS", tag: "cash flow",    why: "Very low cost, university + medical, high yields." },
  { city: "Ocala",          state: "FL", tag: "appreciation", why: "No income tax, fast Florida in-migration, affordable." },
  { city: "Hartford",       state: "CT", tag: "cash flow",    why: "Insurance capital, cheap relative to rents." },
  { city: "Morgantown",     state: "WV", tag: "cash flow",    why: "University town, steady demand, low cost." },
  { city: "Huntsville",     state: "AL", tag: "appreciation", why: "Aerospace/defense boom, fast growth, still affordable." },
  { city: "Tuscaloosa",     state: "AL", tag: "cash flow",    why: "University demand (Alabama), affordable rentals." },
  { city: "Sioux City",     state: "IA", tag: "cash flow",    why: "Very affordable, stable agribusiness, high yields." },
  { city: "Rockford",       state: "IL", tag: "cash flow",    why: "Low prices, strong rent-to-price, emerging." },
  { city: "Detroit",        state: "MI", tag: "cash flow",    why: "Rock-bottom entries + redevelopment; high yields." },
  { city: "Oklahoma City",  state: "OK", tag: "cash flow",    why: "Low cost, energy + jobs, landlord-friendly." },
  { city: "Spartanburg",    state: "SC", tag: "appreciation", why: "BMW corridor growth, low cost, rising values." },
]
