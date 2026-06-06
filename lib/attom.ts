// ATTOM Data Solutions API client — pre-foreclosure + deep property intelligence
// Docs: https://api.developer.attomdata.com/docs
// Requires env var: ATTOM_API_KEY

const ATTOM_BASE = "https://api.gateway.attomdata.com"

function headers() {
  const key = process.env.ATTOM_API_KEY
  if (!key) throw new Error("ATTOM_API_KEY is not set in environment variables")
  return { apikey: key, accept: "application/json" }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttomForeclosureRecord {
  attomId: number
  address: string
  city: string
  state: string
  zip: string
  foreclosureType: string
  recordingDate: string
  defaultAmount: number | null
  loanAmount: number | null
  lender: string | null
  openingBid: number | null
  auctionDate: string | null
  apn: string
  fips: string
}

export interface AttomPropertyDetail {
  attomId: number
  ownerName: string
  ownerName2: string | null
  mailingAddress: string | null
  mailingCity: string | null
  mailingState: string | null
  mailingZip: string | null
  isAbsentee: boolean          // mailing address differs from property
  ownerType: "individual" | "corporate"  // LLC/trust vs person
  taxDelinquent: boolean
  assessedValue: number | null
  beds: number | null
  baths: number | null
  sqft: number | null
  yearBuilt: number | null
  propertyType: string | null  // SFR, CONDO, MULTI-FAMILY, etc.
  lotSize: number | null
}

export interface AttomAVM {
  attomId: number
  value: number | null
  valueLow: number | null
  valueHigh: number | null
  confidence: number | null    // 0-100
}

export interface AttomSaleHistory {
  attomId: number
  lastSalePrice: number | null
  lastSaleDate: string | null
  priorSalePrice: number | null
  priorSaleDate: string | null
}

export interface AttomLien {
  type: string          // MORTGAGE, HOA, IRS, JUDGMENT, etc.
  amount: number | null
  recordingDate: string | null
  status: string | null // OPEN, RELEASED, etc.
}

export interface AttomLiens {
  attomId: number
  liens: AttomLien[]
  totalOpenAmount: number
  count: number
}

// Full enrichment bundle for a single property
export interface AttomPropertyBundle {
  detail: AttomPropertyDetail | null
  avm: AttomAVM | null
  saleHistory: AttomSaleHistory | null
  liens: AttomLiens | null
}

// ─── Foreclosure search ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRecord(p: any): AttomForeclosureRecord {
  return {
    attomId: p.identifier?.attomId ?? p.identifier?.Id ?? 0,
    address: p.address?.line1 ?? "",
    city: p.address?.locality ?? "",
    state: p.address?.countrySubd ?? "",
    zip: p.address?.postal1 ?? "",
    foreclosureType:
      p.foreclosure?.ftaForeclosureType ??
      p.foreclosure?.ftaDocType ??
      "UNKNOWN",
    recordingDate: p.foreclosure?.ftaRecordingDate ?? "",
    defaultAmount: p.foreclosure?.ftaDefaultAmt ?? null,
    loanAmount: p.foreclosure?.ftaLoanAmt ?? null,
    lender: p.foreclosure?.ftaCurrentLender ?? null,
    openingBid: p.foreclosure?.ftaOpeningBid ?? null,
    auctionDate: p.foreclosure?.ftaAuctionDate ?? null,
    apn: p.identifier?.apn ?? "",
    fips: p.identifier?.fips ?? "",
  }
}

async function fetchForeclosureSnapshot(
  params: Record<string, string>
): Promise<{ records: AttomForeclosureRecord[]; total: number }> {
  const url = `${ATTOM_BASE}/propertyapi/v1.0.0/foreclosure/snapshot?${new URLSearchParams(params)}`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ATTOM foreclosure search failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  if (data.status?.msg === "SuccessWithoutResult") return { records: [], total: 0 }
  if (data.status?.code !== 0)
    throw new Error(`ATTOM error: ${data.status?.msg ?? "Unknown"}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { records: (data.property ?? []).map((p: any) => parseRecord(p)), total: data.status?.total ?? 0 }
}

export async function searchForeclosuresByZip(
  zipCode: string,
  startDate: string,
  endDate: string,
  page = 1,
  pageSize = 100
): Promise<{ records: AttomForeclosureRecord[]; total: number }> {
  return fetchForeclosureSnapshot({
    zipCode,
    startcalrecordingdate: startDate,
    endcalrecordingdate: endDate,
    page: String(page),
    pageSize: String(Math.min(pageSize, 100)),
  })
}

export async function searchForeclosuresByCity(
  city: string,
  state: string,
  startDate: string,
  endDate: string,
  page = 1,
  pageSize = 100
): Promise<{ records: AttomForeclosureRecord[]; total: number }> {
  return fetchForeclosureSnapshot({
    address2: `${city}, ${state}`,
    startcalrecordingdate: startDate,
    endcalrecordingdate: endDate,
    page: String(page),
    pageSize: String(Math.min(pageSize, 100)),
  })
}

export async function searchForeclosuresByCounty(
  county: string,
  state: string,
  startDate: string,
  endDate: string,
  page = 1,
  pageSize = 100
): Promise<{ records: AttomForeclosureRecord[]; total: number }> {
  return fetchForeclosureSnapshot({
    countyname: county,
    state,
    startcalrecordingdate: startDate,
    endcalrecordingdate: endDate,
    page: String(page),
    pageSize: String(Math.min(pageSize, 100)),
  })
}

// ─── Property detail + owner ──────────────────────────────────────────────────

export async function getPropertyDetail(
  attomId: number
): Promise<AttomPropertyDetail | null> {
  try {
    const url = `${ATTOM_BASE}/propertyapi/v1.0.0/property/detail?attomId=${attomId}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    const p = data.property?.[0]
    if (!p) return null

    const owner = p.owner ?? {}
    const building = p.building ?? {}
    const assessment = p.assessment ?? {}

    const propAddr = (p.address?.line1 ?? "").toLowerCase()
    const mailAddr = (owner.mailing?.fullStreetAddress ?? "").toLowerCase()
    const isAbsentee = Boolean(
      mailAddr && propAddr && !mailAddr.includes(propAddr.slice(0, 10))
    )

    const ownerRaw = (owner.owner1?.fullName ?? owner.owner1?.lastNameFirst ?? "").toUpperCase()
    const corporatePatterns = /LLC|INC|CORP|TRUST|LP\b|LTD|HOLDINGS|PROPERTIES|INVESTMENTS|ESTATE OF/
    const ownerType: "individual" | "corporate" = corporatePatterns.test(ownerRaw)
      ? "corporate"
      : "individual"

    const taxDelinquentAmt = assessment.tax?.taxdelinquentamt ?? 0
    const taxDelinquent = taxDelinquentAmt > 0

    return {
      attomId,
      ownerName: owner.owner1?.fullName ?? owner.owner1?.lastNameFirst ?? "",
      ownerName2: owner.owner2?.fullName ?? null,
      mailingAddress: owner.mailing?.fullStreetAddress ?? null,
      mailingCity: owner.mailing?.city ?? null,
      mailingState: owner.mailing?.state ?? null,
      mailingZip: owner.mailing?.zip ?? null,
      isAbsentee,
      ownerType,
      taxDelinquent,
      assessedValue: assessment.assessed?.assdTtlValue ?? null,
      beds: building.rooms?.beds ?? null,
      baths: building.rooms?.bathsTotal ?? null,
      sqft: building.size?.universalsize ?? null,
      yearBuilt: building.summary?.yearBuilt ?? null,
      propertyType:
        building.summary?.propclass ??
        p.summary?.propClass ??
        null,
      lotSize: p.lot?.lotSize1 ?? null,
    }
  } catch {
    return null
  }
}

// ─── AVM (Automated Valuation Model) ─────────────────────────────────────────

export async function getPropertyAVM(
  attomId: number
): Promise<AttomAVM | null> {
  try {
    const url = `${ATTOM_BASE}/propertyapi/v1.0.0/attomavm/detail?attomId=${attomId}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    const p = data.property?.[0]
    if (!p?.avm) return null

    return {
      attomId,
      value: p.avm.amount?.value ?? null,
      valueLow: p.avm.amount?.low ?? null,
      valueHigh: p.avm.amount?.high ?? null,
      confidence: p.avm.confidence ?? null,
    }
  } catch {
    return null
  }
}

// ─── Sale history ─────────────────────────────────────────────────────────────

export async function getPropertySaleHistory(
  attomId: number
): Promise<AttomSaleHistory | null> {
  try {
    const url = `${ATTOM_BASE}/propertyapi/v1.0.0/saleshistory/snapshot?attomId=${attomId}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    const p = data.property?.[0]
    const history = p?.salehistory ?? []
    if (history.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...history].sort((a: any, b: any) =>
      (b.saleTransDate ?? "").localeCompare(a.saleTransDate ?? "")
    )

    return {
      attomId,
      lastSalePrice: sorted[0]?.amount?.saleamt ?? null,
      lastSaleDate: sorted[0]?.saleTransDate ?? null,
      priorSalePrice: sorted[1]?.amount?.saleamt ?? null,
      priorSaleDate: sorted[1]?.saleTransDate ?? null,
    }
  } catch {
    return null
  }
}

// ─── Liens ────────────────────────────────────────────────────────────────────

export async function getPropertyLiens(
  attomId: number
): Promise<AttomLiens | null> {
  try {
    const url = `${ATTOM_BASE}/propertyapi/v1.0.0/allliens/detail?attomId=${attomId}`
    const res = await fetch(url, { headers: headers() })
    if (!res.ok) return null
    const data = await res.json()
    const p = data.property?.[0]
    if (!p?.liens) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liens: AttomLien[] = (p.liens ?? []).map((l: any) => ({
      type: l.lienType ?? l.type ?? "UNKNOWN",
      amount: l.lienAmt ?? l.amount ?? null,
      recordingDate: l.recordingDate ?? null,
      status: l.lienStatus ?? l.status ?? null,
    }))

    const openLiens = liens.filter(
      (l) => !l.status || l.status.toUpperCase() !== "RELEASED"
    )
    const totalOpenAmount = openLiens.reduce(
      (sum, l) => sum + (l.amount ?? 0),
      0
    )

    return { attomId, liens: openLiens, totalOpenAmount, count: openLiens.length }
  } catch {
    return null
  }
}

// ─── Full property enrichment (parallel calls) ───────────────────────────────

export async function getFullPropertyBundle(
  attomId: number
): Promise<AttomPropertyBundle> {
  const [detail, avm, saleHistory, liens] = await Promise.allSettled([
    getPropertyDetail(attomId),
    getPropertyAVM(attomId),
    getPropertySaleHistory(attomId),
    getPropertyLiens(attomId),
  ])

  return {
    detail: detail.status === "fulfilled" ? detail.value : null,
    avm: avm.status === "fulfilled" ? avm.value : null,
    saleHistory: saleHistory.status === "fulfilled" ? saleHistory.value : null,
    liens: liens.status === "fulfilled" ? liens.value : null,
  }
}

// Batch enrichment with concurrency control — rate-limit safe
export async function batchFullEnrichment(
  attomIds: number[],
  concurrency = 3
): Promise<Map<number, AttomPropertyBundle>> {
  const results = new Map<number, AttomPropertyBundle>()

  for (let i = 0; i < attomIds.length; i += concurrency) {
    const batch = attomIds.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map((id) => getFullPropertyBundle(id))
    )
    settled.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        results.set(batch[idx], r.value)
      } else {
        results.set(batch[idx], {
          detail: null, avm: null, saleHistory: null, liens: null,
        })
      }
    })
    if (i + concurrency < attomIds.length) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return results
}
