export interface CountySource {
  name: string
  layer: 1 | 2 | 3
  signalTypes: string[]
  searchTerms: string[]
  siteHints?: string[]
}

export interface CountyConfig {
  id: string
  name: string
  state: string
  fips: string
  recorderUrl: string
  assessorUrl: string
  courtUrl: string
  zipCodes: string[]
  sources: CountySource[]
}

export const COUNTIES: CountyConfig[] = [
  {
    id: "san-diego",
    name: "San Diego",
    state: "CA",
    fips: "06073",
    recorderUrl: "https://arcc.co.san-diego.ca.us/",
    assessorUrl: "https://arcc.co.san-diego.ca.us/",
    courtUrl: "https://www.sdcourt.ca.gov/",
    zipCodes: ["92101","92103","92104","92105","92106","92107","92108","92109","92110","92111","92113","92114","92115","92116","92117","92118","92119","92120","92121","92122","92123","92124","92126","92127","92128","92129","92130","92131","92132","92139","92140","92154","92173"],
    sources: [
      {
        name: "SD County Recorder - NOD/LP/NTS",
        layer: 1,
        signalTypes: ["nod", "lis_pendens", "notice_of_sale"],
        searchTerms: [
          '"San Diego County" "notice of default" {year} recorder',
          '"San Diego County" "lis pendens" {year} filed property',
          '"San Diego County" "notice of trustee sale" {year}',
          'site:arcc.co.san-diego.ca.us foreclosure {year}',
          '"San Diego" "notice of default" {year} site:legalnewsonline.com OR site:foreclosureradar.com',
        ],
        siteHints: ["arcc.co.san-diego.ca.us", "sdcounty.ca.gov"],
      },
      {
        name: "SD Tax Collector - Delinquent Roll",
        layer: 2,
        signalTypes: ["tax_delinquent"],
        searchTerms: [
          '"San Diego County" delinquent property tax list {year}',
          '"San Diego" "delinquent taxes" real estate {year} county treasurer',
          'site:sdttc.com delinquent tax {year}',
          '"San Diego" property "tax lien" filed {year}',
        ],
        siteHints: ["sdttc.com", "co.san-diego.ca.us"],
      },
      {
        name: "SD Development Services - Code Violations",
        layer: 2,
        signalTypes: ["code_violation"],
        searchTerms: [
          '"San Diego" "code violation" property abandoned {year}',
          '"San Diego" building code enforcement violation order {year}',
          'site:sandiego.gov "code enforcement" violation {year}',
          '"San Diego" "notice of violation" abandoned structure {year}',
        ],
        siteHints: ["sandiego.gov", "development.sandiego.gov"],
      },
      {
        name: "SD Superior Court - Probate",
        layer: 3,
        signalTypes: ["probate"],
        searchTerms: [
          '"San Diego County" probate court filing {year} real property',
          '"San Diego" probate petition "real property" estate {year}',
          'site:sdcourt.ca.gov probate {year}',
          '"San Diego County" estate probate property sale {year}',
        ],
        siteHints: ["sdcourt.ca.gov"],
      },
      {
        name: "SD Superior Court - Divorce/Dissolution",
        layer: 3,
        signalTypes: ["divorce"],
        searchTerms: [
          '"San Diego County" divorce dissolution "real property" {year}',
          '"San Diego" "petition for dissolution" property {year}',
          '"San Diego" marital dissolution property sale order {year}',
        ],
        siteHints: ["sdcourt.ca.gov"],
      },
      {
        name: "SD HOA Lien Filings",
        layer: 2,
        signalTypes: ["hoa_lien"],
        searchTerms: [
          '"San Diego County" "HOA lien" filed recorder {year}',
          '"San Diego" homeowners association lien property {year}',
          '"San Diego" "assessment lien" HOA filed {year}',
        ],
      },
    ],
  },
  {
    id: "riverside",
    name: "Riverside",
    state: "CA",
    fips: "06065",
    recorderUrl: "https://asrclkrec.com/",
    assessorUrl: "https://assessor.rivcogov.us/",
    courtUrl: "https://www.riverside.courts.ca.gov/",
    zipCodes: ["92501","92503","92504","92505","92506","92507","92508","92509","92518","92530","92532","92543","92544","92545","92548","92551","92553","92555","92557","92562","92563","92567","92570","92571","92582","92584","92585","92586","92587","92590","92591","92592","92595","92596"],
    sources: [
      {
        name: "Riverside County Recorder - NOD/LP/NTS",
        layer: 1,
        signalTypes: ["nod", "lis_pendens", "notice_of_sale"],
        searchTerms: [
          '"Riverside County" "notice of default" {year} recorder',
          '"Riverside County" "lis pendens" {year} filed',
          '"Riverside County" "notice of trustee sale" {year}',
          'site:asrclkrec.com foreclosure {year}',
        ],
      },
      {
        name: "Riverside Tax Collector - Delinquent Roll",
        layer: 2,
        signalTypes: ["tax_delinquent"],
        searchTerms: [
          '"Riverside County" delinquent property tax {year}',
          '"Riverside" "tax lien" property {year} county',
          'site:rivcotax.com delinquent {year}',
        ],
      },
      {
        name: "Riverside Superior Court - Probate",
        layer: 3,
        signalTypes: ["probate"],
        searchTerms: [
          '"Riverside County" probate petition property {year}',
          '"Riverside" probate estate real property sale {year}',
        ],
      },
    ],
  },
  {
    id: "san-bernardino",
    name: "San Bernardino",
    state: "CA",
    fips: "06071",
    recorderUrl: "https://www.sbcounty.gov/arc/",
    assessorUrl: "https://www.sbcounty.gov/assessor/",
    courtUrl: "https://www.sb-court.org/",
    zipCodes: ["92401","92404","92405","92407","92408","92410","92411","92835","92411","92413","91701","91702","91730","91737","91739","91740","91743","91761","91762","91764","91786"],
    sources: [
      {
        name: "SB County Recorder - NOD/LP/NTS",
        layer: 1,
        signalTypes: ["nod", "lis_pendens", "notice_of_sale"],
        searchTerms: [
          '"San Bernardino County" "notice of default" {year} recorder',
          '"San Bernardino County" "lis pendens" {year} filed',
          '"San Bernardino County" "notice of trustee sale" {year}',
          'site:sbcounty.gov foreclosure recorder {year}',
        ],
      },
      {
        name: "SB Tax Collector - Delinquent Roll",
        layer: 2,
        signalTypes: ["tax_delinquent"],
        searchTerms: [
          '"San Bernardino County" delinquent property tax {year}',
          '"San Bernardino" "tax lien" property {year}',
        ],
      },
      {
        name: "SB Superior Court - Probate",
        layer: 3,
        signalTypes: ["probate"],
        searchTerms: [
          '"San Bernardino County" probate petition property {year}',
          '"San Bernardino" probate estate real property {year}',
        ],
      },
    ],
  },
  {
    id: "orange",
    name: "Orange",
    state: "CA",
    fips: "06059",
    recorderUrl: "https://www.ocrecorder.com/",
    assessorUrl: "https://www.ocassessor.gov/",
    courtUrl: "https://www.occourts.org/",
    zipCodes: ["92701","92703","92704","92705","92706","92707","92708","92780","92781","92782","92801","92802","92804","92805","92806","92807","92808","92821","92823","92831","92832","92833","92835","92861","92868","92869"],
    sources: [
      {
        name: "OC Recorder - NOD/LP/NTS",
        layer: 1,
        signalTypes: ["nod", "lis_pendens", "notice_of_sale"],
        searchTerms: [
          '"Orange County" California "notice of default" {year} recorder',
          '"Orange County" California "lis pendens" {year} filed',
          '"Orange County" California "notice of trustee sale" {year}',
          'site:ocrecorder.com foreclosure {year}',
        ],
      },
      {
        name: "OC Tax Collector - Delinquent Roll",
        layer: 2,
        signalTypes: ["tax_delinquent"],
        searchTerms: [
          '"Orange County" California delinquent property tax {year}',
          '"Orange County" "tax lien" property {year} California',
          'site:octax.com delinquent {year}',
        ],
      },
      {
        name: "OC Superior Court - Probate",
        layer: 3,
        signalTypes: ["probate"],
        searchTerms: [
          '"Orange County" California probate estate real property {year}',
          '"Orange County" probate petition property sale {year}',
        ],
      },
    ],
  },
]

export function getCounty(id: string): CountyConfig | undefined {
  return COUNTIES.find(c => c.id === id)
}

export const SIGNAL_LAYER_MAP: Record<string, 1 | 2 | 3> = {
  nod: 1,
  lis_pendens: 1,
  notice_of_sale: 1,
  tax_delinquent: 2,
  code_violation: 2,
  hoa_lien: 2,
  quitclaim: 2,
  probate: 3,
  divorce: 3,
  obituary_match: 3,
  business_closure: 3,
}

export function getDistressLayer(signalTypes: string[]): 1 | 2 | 3 {
  const layers = signalTypes.map(t => SIGNAL_LAYER_MAP[t] ?? 3)
  return Math.min(...layers) as 1 | 2 | 3
}
