// Commercial real estate distress sources, layered on top of the same 4 CA
// counties the residential pipeline already covers. Reuses COUNTIES for
// county-level metadata (recorder/assessor/court URLs, ZIP codes) so the two
// pipelines never drift out of sync — only `sources` differs.
import { COUNTIES, type CountyConfig, type CountySource } from "./counties"

function creSourcesFor(countyName: string, state: string): CountySource[] {
  const county = `${countyName} County`
  return [
    {
      name: `${countyName} - CMBS Special Servicing`,
      layer: 1,
      signalTypes: ["cmbs_special_servicing"],
      searchTerms: [
        `"${county}" commercial property loan "special servicing" {year}`,
        `"${county}" CMBS "special servicer" transfer {year}`,
        `"${countyName}" ${state} commercial mortgage "special servicing" news {year}`,
        `site:globest.com OR site:bisnow.com "${countyName}" special servicing {year}`,
      ],
      siteHints: ["globest.com", "bisnow.com", "commercialobserver.com"],
    },
    {
      name: `${countyName} - SBA Loan Default`,
      layer: 1,
      signalTypes: ["sba_default"],
      searchTerms: [
        `"${county}" commercial property "SBA 504" OR "SBA 7(a)" default {year}`,
        `"${countyName}" ${state} small business loan default commercial real estate {year}`,
      ],
    },
    {
      name: `${countyName} Superior Court - Commercial LLC Bankruptcy`,
      layer: 1,
      signalTypes: ["llc_bankruptcy"],
      searchTerms: [
        `"${county}" LLC "chapter 11" OR "chapter 7" bankruptcy commercial property {year}`,
        `"${countyName}" ${state} business bankruptcy filing commercial real estate {year}`,
      ],
    },
    {
      name: `${countyName} County Recorder - Commercial UCC-1 Liens`,
      layer: 2,
      signalTypes: ["ucc_lien"],
      searchTerms: [
        `"${county}" "UCC-1" filed commercial property lien {year}`,
        `"${countyName}" ${state} "UCC lien" business filed recorder {year}`,
      ],
    },
    {
      name: `${countyName} Code Enforcement - Commercial Violations`,
      layer: 2,
      signalTypes: ["commercial_code_violation"],
      searchTerms: [
        `"${countyName}" ${state} commercial property "code violation" abandoned {year}`,
        `"${countyName}" ${state} commercial building "code enforcement" order {year}`,
      ],
    },
    {
      name: `${countyName} - Commercial Vacancy Signals`,
      layer: 2,
      signalTypes: ["commercial_vacancy"],
      searchTerms: [
        `"${countyName}" ${state} retail OR office property vacant "for lease" distress {year}`,
        `"${countyName}" ${state} anchor tenant closing OR bankruptcy commercial {year}`,
      ],
    },
  ]
}

export const CRE_COUNTIES: CountyConfig[] = COUNTIES.map((c) => ({
  ...c,
  sources: creSourcesFor(c.name, c.state),
}))

export function getCreCounty(id: string): CountyConfig | undefined {
  return CRE_COUNTIES.find((c) => c.id === id)
}
