"use client"

// ─── Live Distress Map ────────────────────────────────────────────────────────
// A spatial hunting tool for wholesalers — its own section at the top of the
// Real Estate area. Everything here is dependency-free (Leaflet + free OSM tiles)
// and never touches the server search path, so it cannot slow a search or break
// a Vercel build.
//
// Modes & layers:
//   • City mode    — flies to the searched area and pins every deal, color-coded
//                    by urgency; nearby pins auto-cluster into count bubbles.
//   • Address mode — type any address; it flies there and tells you whether it's
//                    a live deal and what distress signals exist.
//   • Draw a zone  — free-draw a polygon; the table below filters to that area.
//   • Plan route   — tap pins to build an ordered door-knock route, then open it
//                    in Google Maps with every waypoint.
//   • Comps layer  — show comparable sales (from on-demand valuations) for ARV.
//   • Density layer— a heat overlay revealing the hottest blocks to farm.

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import "leaflet/dist/leaflet.css"
import type {
  Map as LeafletMap, LayerGroup, CircleMarker, Marker, Polygon, Polyline, LeafletMouseEvent, TileLayer,
} from "leaflet"
import type { ForeclosureLead } from "@/lib/agents/foreclosure-agent"
import { geocodeLeads, geocodePlace, geocodeAddress, reverseGeocode, type LatLng } from "@/lib/geocode"
import { analyzeDeal, fmtMoney } from "@/lib/deal-analysis"
import { predictPreForeclosure } from "@/lib/predictive"
import { marketSnapshot, type MarketSnapshot } from "@/lib/market-stats"
import { loadBuyBox, saveBuyBox, matchesBuyBox, DEFAULT_BUYBOX, type BuyBox } from "@/lib/buy-box"
import { CRM_STAGES, loadCrm, persistCrm, crmColor, CRM_EVENT, type CrmStage, type CrmMap } from "@/lib/crm"
import { loadSeen, addSeen, newLeadIds, leadSignature } from "@/lib/seen-leads"
import { learnProfile, fitsProfile, type LearnedProfile } from "@/lib/deal-learning"

// ── Urgency model: how a pin is colored & sized ───────────────────────────────
type Urgency = "imminent" | "soon" | "active" | "early"

function leadUrgency(lead: ForeclosureLead): Urgency {
  const d = lead.daysUntilAuction
  if (typeof d === "number" && d >= 0) {
    if (d <= 7)  return "imminent"
    if (d <= 21) return "soon"
  }
  const hotStage = lead.foreclosureStage === "NOTICE_OF_SALE" || lead.foreclosureStage === "AUCTION"
  if (hotStage || (lead.score ?? 0) >= 75) return "soon"
  const activeStage = lead.foreclosureStage === "NOTICE_OF_DEFAULT" || lead.foreclosureStage === "LIS_PENDENS"
  if (activeStage || (lead.score ?? 0) >= 45) return "active"
  return "early"
}

// Distinct color for OUR predictions (not a filed foreclosure). Dashed ring +
// magenta signals "forecast / uncertain" so it can never be mistaken for a
// confirmed distress pin.
const PREDICT_COLOR = "#d946ef"

const URGENCY_RANK: Record<Urgency, number> = { imminent: 3, soon: 2, active: 1, early: 0 }
const URGENCY_COLOR: Record<Urgency, string> = {
  imminent: "#ef4444", soon: "#f97316", active: "#eab308", early: "#22c55e",
}
const URGENCY_LABEL: Record<Urgency, string> = {
  imminent: "Auction imminent (≤7 days)",
  soon:     "Hot — sale soon / high score",
  active:   "Active distress (NOD / Lis Pendens)",
  early:    "Early signal / pre-foreclosure",
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k"
  return "$" + Math.round(n)
}

// One-line verdict: is this a good deal? (combines grade + score)
function dealVerdict(grade: string, score: number): { text: string; color: string } {
  if (grade === "A" || score >= 80) return { text: "✅ Strong deal", color: "#34d399" }
  if (grade === "B" || score >= 65) return { text: "👍 Solid deal", color: "#a3e635" }
  if (grade === "F")                return { text: "🔻 Risky — likely underwater", color: "#f87171" }
  if (grade === "C" || score >= 45) return { text: "⚠️ Marginal — negotiate hard", color: "#fbbf24" }
  return { text: "🔻 Weak — low signal", color: "#f87171" }
}

// Haversine distance in meters (for click-to-analyze nearest-lead lookup).
function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c))
}

// Ray-casting point-in-polygon (lng = x, lat = y).
function pointInPolygon(lat: number, lng: number, poly: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lng, yi = poly[i].lat
    const xj = poly[j].lng, yj = poly[j].lat
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// Popup deal card with an optional "View in list" button and a Street View link.
function popupHtml(lead: ForeclosureLead, ll: LatLng, withListButton: boolean, fallbackPsf?: number | null, crmStage?: CrmStage, fits?: boolean, isNew?: boolean): string {
  const u = leadUrgency(lead)
  const countdown =
    typeof lead.daysUntilAuction === "number" && lead.daysUntilAuction >= 0
      ? `<div style="color:#fca5a5;font-weight:600;margin-top:2px">🔨 Auction in ${lead.daysUntilAuction} day${lead.daysUntilAuction === 1 ? "" : "s"}</div>` : ""
  const liens = lead.juniorLiens?.length
    ? `<div style="color:#fbbf24;margin-top:2px">⚠ ${lead.juniorLiens.length} junior lien${lead.juniorLiens.length === 1 ? "" : "s"} behind 1st</div>` : ""
  const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll.lat},${ll.lng}`
  const a = analyzeDeal(lead, undefined, fallbackPsf ? { fallbackPsf } : undefined)
  const verdict = dealVerdict(a.grade, lead.score ?? 0)
  const pred = predictPreForeclosure(lead)
  const predBanner = pred.predicted
    ? `<div style="margin-top:5px;background:#3b0764;border:1px solid #d946ef66;border-radius:8px;padding:6px 8px">
        <div style="color:#f0abfc;font-weight:800;font-size:11px">🔮 PREDICTED PRE-FORECLOSURE</div>
        <div style="font-size:10.5px;color:#e9d5ff;margin-top:1px">${pred.probability}% likely · ${pred.timeframe} · ${pred.confidence} confidence</div>
        <div style="font-size:10px;color:#d8b4fe;margin-top:2px">Signals: ${pred.factors.slice(0, 4).map(escapeHtml).join(", ")}</div>
        <div style="font-size:9.5px;color:#c084fc;margin-top:3px;font-style:italic">⚠ Our forecast — NOT a filed foreclosure. Verify before acting.</div>
      </div>`
    : ""
  const crmRow = `<div style="margin-top:7px;border-top:1px solid #ffffff14;padding-top:6px"><div style="font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Pipeline</div><div style="display:flex;gap:3px;flex-wrap:wrap">${CRM_STAGES.map((s) => `<button data-crm-lead="${lead.attomId}" data-crm-stage="${s.id}" style="font-size:9px;padding:2px 5px;border-radius:5px;border:1px solid ${s.color}66;background:${crmStage === s.id ? s.color : "transparent"};color:${crmStage === s.id ? "#111" : s.color};cursor:pointer;font-weight:700">${s.label}</button>`).join("")}</div></div>`
  const profitColor = a.headlineProfit > 0 ? "#34d399" : "#f87171"

  // Is it distressed?
  const distressLine = `<div style="font-size:11px;margin-top:4px"><span style="color:#9ca3af">Distressed:</span> ${a.distressed ? `<span style="color:#fca5a5;font-weight:700">✓ Yes — ${escapeHtml(a.distressType)}</span>` : '<span style="color:#9ca3af">not flagged</span>'}</div>`

  // The money: how much you could make + ROI.
  const moneyBox = a.hasValue
    ? `<div style="margin-top:6px;background:#0c1f17;border:1px solid #10b98144;border-radius:8px;padding:7px 9px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="color:#9ca3af;font-size:11px">${a.headlineLabel}</span>
          <span style="font-weight:800;font-size:15px;color:${profitColor}">${fmtMoney(a.headlineProfit)}</span>
        </div>
        ${a.headlineLabel === "Flip profit" ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:1px"><span style="color:#9ca3af">ROI (cash-on-cash)</span><span style="font-weight:700;color:${a.roiPct > 0 ? "#34d399" : "#f87171"}">${a.roiPct}%</span></div>` : ""}
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:1px"><span style="color:#9ca3af">Max offer (MAO)</span><span style="font-weight:700">${fmtMoney(a.mao)}</span></div>
        <div style="font-size:10.5px;color:#a5b4fc;margin-top:3px">🎯 ${escapeHtml(a.exit.strategy)} · grade ${a.grade} · motivation ${a.motivation}/100</div>
      </div>`
    : `<div style="margin-top:6px;font-size:10.5px;color:#fcd34d;background:#1f1a0c;border:1px solid #f59e0b33;border-radius:8px;padding:6px 8px">No value estimate — run Live Valuation to size profit & ROI.</div>`

  const flagBadges = [
    a.chronic ? '<span style="color:#e879f9">🔁 chronic distress</span>' : "",
    a.bankruptcy ? '<span style="color:#f87171">⚖️ poss. bankruptcy</span>' : "",
    a.debtEstimated ? '<span style="color:#7dd3fc">≈ est. debt</span>' : "",
  ].filter(Boolean).join(" · ")
  const flagsLine = flagBadges ? `<div style="font-size:10px;margin-top:4px">${flagBadges}</div>` : ""

  const why = a.whyGood.slice(0, 4)
  const whyBox = why.length
    ? `<div style="margin-top:6px"><div style="font-size:10px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Why it's a deal</div><div style="margin-top:2px;font-size:10.5px;color:#d1fae5">${why.map((s) => "✓ " + escapeHtml(s)).join("<br/>")}</div></div>`
    : ""

  return `
    <div style="min-width:220px;max-width:280px;font-family:ui-sans-serif,system-ui;color:#e5e7eb">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="background:${URGENCY_COLOR[u]};color:#111;font-weight:700;font-size:11px;padding:1px 6px;border-radius:6px">${lead.score ?? 0}</span>
        <span style="font-weight:600;font-size:12px">${escapeHtml(lead.priority ?? "")}</span>
      </div>
      <div style="font-weight:700;font-size:12.5px;line-height:1.3">${escapeHtml(lead.address)}</div>
      <div style="font-size:11px;color:#9ca3af">${escapeHtml([lead.city, lead.state, lead.zip].filter(Boolean).join(", "))}</div>
      <div style="font-size:12px;font-weight:800;margin-top:3px;color:${verdict.color}">${verdict.text}</div>
      ${(isNew || fits) ? `<div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">${isNew ? '<span style="font-size:9.5px;font-weight:700;background:#0ea5e9;color:#04293a;border-radius:5px;padding:1px 5px">🆕 NEW</span>' : ""}${fits ? '<span style="font-size:9.5px;font-weight:700;background:#16a34a33;color:#86efac;border:1px solid #16a34a66;border-radius:5px;padding:1px 5px">📈 Matches your deals</span>' : ""}</div>` : ""}
      ${predBanner}
      ${distressLine}${countdown}${liens}
      ${moneyBox}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:11px;margin-top:6px">
        <span style="color:#9ca3af">Est. value</span><span>${money(lead.estimatedValue)}</span>
        <span style="color:#9ca3af">Equity</span><span>${a.hasValue ? a.equityPercent + "%" : (lead.equityPercent != null ? Math.round(lead.equityPercent) + "%" : "—")}</span>
        <span style="color:#9ca3af">Total debt</span><span>${money(a.totalDebt)}</span>
        <span style="color:#9ca3af">Repairs</span><span>${a.hasValue ? money(a.repairCost) : "—"}</span>
      </div>
      ${whyBox}${flagsLine}${crmRow}
      <div style="display:flex;gap:6px;margin-top:8px">
        ${withListButton ? `<button data-leadid="${lead.attomId}" style="flex:1;background:#4f46e5;color:#fff;border:0;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;cursor:pointer">Full analysis →</button>` : ""}
        <a href="${sv}" target="_blank" rel="noreferrer" style="flex:1;text-align:center;background:#374151;color:#e5e7eb;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:600;text-decoration:none">📷 Street View</a>
      </div>
    </div>`
}

type Mode = "explore" | "draw" | "route"

// Result of analyzing ANY address (good-deal check beyond foreclosure).
interface AnalyzeResp {
  found: boolean
  property: { beds: number | null; baths: number | null; sqft: number | null; yearBuilt: number | null; owner: string | null; type: string | null }
  value: number
  analysis: { hasValue: boolean; arv: number; mao: number; profit: number; label: string; roi: number; equityPercent: number; grade: string; verdict: { call: string; reason: string }; profitRange: { low: number; likely: number; high: number }; whyGood: string[] }
}
type HeatMetric = "score" | "equity" | "profit"

const HEAT_LABEL: Record<HeatMetric, string> = { score: "Score", equity: "Equity $", profit: "Profit $" }

interface SavedZone { id: string; name: string; points: LatLng[] }
const ZONES_KEY = "ap_farm_zones_v1"

function loadZones(): SavedZone[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(ZONES_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((z) => z && Array.isArray(z.points) && z.points.length >= 3) : []
  } catch { return [] }
}
function persistZones(zones: SavedZone[]): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(ZONES_KEY, JSON.stringify(zones)) } catch { /* quota */ }
}

// #6 Driving for Dollars — houses logged in the field, persisted locally.
interface DrivingLead { id: string; lat: number; lng: number; address: string | null; note: string; ts: number }
const DRIVE_KEY = "ap_driving_leads_v1"
function loadDrivingLeads(): DrivingLead[] {
  if (typeof window === "undefined") return []
  try { const raw = window.localStorage.getItem(DRIVE_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : [] } catch { return [] }
}
function persistDrivingLeads(list: DrivingLead[]): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(DRIVE_KEY, JSON.stringify(list)) } catch { /* quota */ }
}

// #13 Zone deal alerts — phone + the lead IDs already seen per saved zone.
interface AlertConfig { phone: string; zones: Record<string, number[]> }
const ALERTS_KEY = "ap_zone_alerts_v1"
function loadAlerts(): AlertConfig {
  if (typeof window === "undefined") return { phone: "", zones: {} }
  try { const raw = window.localStorage.getItem(ALERTS_KEY); const a = raw ? JSON.parse(raw) : null; return a && typeof a === "object" ? { phone: a.phone ?? "", zones: a.zones ?? {} } : { phone: "", zones: {} } } catch { return { phone: "", zones: {} } }
}
function persistAlerts(cfg: AlertConfig): void {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(ALERTS_KEY, JSON.stringify(cfg)) } catch { /* quota */ }
}

// Heat weight 0..1 for a lead under the chosen metric.
function heatWeight(lead: ForeclosureLead, metric: HeatMetric): number {
  if (metric === "score") return Math.max(0, Math.min(100, lead.score ?? 0)) / 100
  const a = analyzeDeal(lead)
  if (!a.hasValue) return 0.15
  if (metric === "equity") return Math.max(0, Math.min(1, a.equityAvailable / 250_000))
  const p = a.exit.strategy.startsWith("Fix") ? a.flipProfit : a.wholesaleSpread
  return Math.max(0, Math.min(1, p / 80_000))
}

interface Props {
  leads: ForeclosureLead[]
  flyToQuery?: string
  onSelectLead?: (attomId: number) => void
  highlightId?: number | null
  /** Called with the attomIds inside a drawn zone, or null when cleared. */
  onZoneFilter?: (attomIds: number[] | null) => void
  /** Auth headers for /api/leads/notify (zone deal alerts). */
  apiHeaders?: Record<string, string>
  /** Re-runs the parent search (powers auto-refresh / per-farm auto-crawl). */
  onRefresh?: () => void
}

export default function DistressMap({ leads, flyToQuery, onSelectLead, highlightId, onZoneFilter, apiHeaders, onRefresh }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef       = useRef<LeafletMap | null>(null)
  const layerRef     = useRef<LayerGroup | null>(null)   // pins + clusters
  const compLayerRef = useRef<LayerGroup | null>(null)   // comparable sales
  const heatLayerRef = useRef<LayerGroup | null>(null)   // density overlay
  const searchPinRef = useRef<Marker | null>(null)
  const zonePolyRef  = useRef<Polygon | null>(null)
  const guideRef     = useRef<Polyline | null>(null)
  const markerById   = useRef<Map<number, CircleMarker>>(new Map())
  const LRef         = useRef<typeof import("leaflet") | null>(null)
  const drawPtsRef   = useRef<LatLng[]>([])
  const didFitRef    = useRef(false)
  const streetTileRef = useRef<TileLayer | null>(null)
  const satTileRef    = useRef<TileLayer | null>(null)
  const finishedZoneRef = useRef<LatLng[] | null>(null)
  const driveLayerRef = useRef<LayerGroup | null>(null)
  const meMarkerRef   = useRef<CircleMarker | null>(null)
  const watchIdRef    = useRef<number | null>(null)
  const myPosRef      = useRef<LatLng | null>(null)
  const alertsRef     = useRef<AlertConfig>({ phone: "", zones: {} })
  const buyBoxRef     = useRef<BuyBox>(DEFAULT_BUYBOX)
  const crmRef        = useRef<CrmMap>({})
  const pipelineRef   = useRef(false)
  const psfRef        = useRef<number | null>(null)
  const newIdsRef     = useRef<Set<number>>(new Set())
  const newOnlyRef    = useRef(false)
  const predOnlyRef   = useRef(false)
  const profileRef    = useRef<LearnedProfile | null>(null)
  const onRefreshRef  = useRef(onRefresh)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const openLeadIdRef = useRef<number | null>(null)  // popup kept open across rebuilds
  const rebuildingRef = useRef(false)

  // Refs so map event handlers always read the latest values (no stale closures).
  // These are kept in sync inside effects (never written during render).
  const onSelectRef = useRef(onSelectLead)
  const onZoneRef   = useRef(onZoneFilter)
  const leadsRef    = useRef(leads)
  const coordsRef   = useRef<Record<number, LatLng>>({})
  const renderRef   = useRef<() => void>(() => {})
  const analyzeRef  = useRef<(ll: { lat: number; lng: number }) => void>(() => {})
  const setCrmStageRef = useRef<(id: number, stage: CrmStage) => void>(() => {})
  const modeRef     = useRef<Mode>("explore")

  const [collapsed, setCollapsed]   = useState(false)
  const [ready, setReady]           = useState(false)
  const [coords, setCoords]         = useState<Record<number, LatLng>>({})
  const [geoProgress, setGeoProgress] = useState<{ done: number; total: number } | null>(null)
  const [addrInput, setAddrInput]   = useState("")
  const [assessing, setAssessing]   = useState(false)
  const [assessment, setAssessment] = useState<null | { kind: "deal" | "none" | "notfound" | "analyzing" | "analyze"; title: string; lead?: ForeclosureLead; note?: string; data?: AnalyzeResp }>(null)
  const [mode, setMode]             = useState<Mode>("explore")
  const [zoneCount, setZoneCount]   = useState<number | null>(null)
  const [route, setRoute]           = useState<ForeclosureLead[]>([])
  const [showComps, setShowComps]   = useState(false)
  const [showHeat, setShowHeat]     = useState(false)
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("profit")
  const [baseLayer, setBaseLayer]   = useState<"street" | "satellite">("street")
  const [savedZones, setSavedZones] = useState<SavedZone[]>([])
  const [showZones, setShowZones]   = useState(false)
  const [canSaveZone, setCanSaveZone] = useState(false)
  const [driving, setDriving]       = useState(false)
  const [driveLeads, setDriveLeads] = useState<DrivingLead[]>([])
  const [showDriveList, setShowDriveList] = useState(false)
  const [gpsError, setGpsError]     = useState<string | null>(null)
  const [alerts, setAlerts]         = useState<AlertConfig>({ phone: "", zones: {} })
  const [alertBanner, setAlertBanner] = useState<string | null>(null)
  const [buyBox, setBuyBox]         = useState<BuyBox>(DEFAULT_BUYBOX)
  const [showBuyBox, setShowBuyBox] = useState(false)
  const [crm, setCrm]               = useState<CrmMap>({})
  const [pipelineView, setPipelineView] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [newOnly, setNewOnly]       = useState(false)
  const [predOnly, setPredOnly]     = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [toolsOpen, setToolsOpen]   = useState(true)
  const snapshot: MarketSnapshot = useMemo(() => marketSnapshot(leads), [leads])
  // #2 New leads = those not seen in a prior search (read seen BEFORE we record
  // this batch, which happens in an effect below). Derived — no effect setState.
  const newIds: Set<number> = useMemo(
    () => (typeof window === "undefined" || !leads.length ? new Set<number>() : newLeadIds(leads, loadSeen())),
    [leads],
  )
  const newCount = newIds.size
  const profile: LearnedProfile | null = useMemo(
    () => learnProfile(leads, crm, (l) => analyzeDeal(l, undefined, snapshot.medianPsf ? { fallbackPsf: snapshot.medianPsf } : undefined)),
    [leads, crm, snapshot],
  )

  // Keep latest props/state available to imperative Leaflet handlers via refs.
  useEffect(() => { onSelectRef.current = onSelectLead }, [onSelectLead])
  useEffect(() => { onZoneRef.current = onZoneFilter }, [onZoneFilter])
  useEffect(() => { leadsRef.current = leads }, [leads])
  useEffect(() => { coordsRef.current = coords }, [coords])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { alertsRef.current = alerts }, [alerts])
  useEffect(() => { buyBoxRef.current = buyBox }, [buyBox])
  useEffect(() => { crmRef.current = crm }, [crm])
  useEffect(() => { pipelineRef.current = pipelineView }, [pipelineView])
  useEffect(() => { psfRef.current = snapshot.medianPsf }, [snapshot])
  useEffect(() => { newOnlyRef.current = newOnly }, [newOnly])
  useEffect(() => { predOnlyRef.current = predOnly }, [predOnly])
  useEffect(() => { profileRef.current = profile }, [profile])
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => { newIdsRef.current = newIds }, [newIds])

  // After flagging this batch's new leads, record them as seen so the NEXT
  // search only flags genuinely fresh inventory.
  useEffect(() => { if (leads.length) addSeen(leads.map((l) => leadSignature(l))) }, [leads])

  // Re-draw pins when filters / pipeline / CRM / market / new-set change.
  useEffect(() => { if (ready) renderRef.current() }, [buyBox, pipelineView, crm, snapshot, newOnly, predOnly, newIds, profile, ready])

  // #1 Auto-refresh / per-farm auto-crawl: periodically re-run the search so new
  // deals surface (and zone alerts fire) while the map is open.
  useEffect(() => {
    if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null }
    if (autoRefresh && onRefreshRef.current) {
      refreshTimerRef.current = setInterval(() => onRefreshRef.current?.(), 15 * 60 * 1000)
    }
    return () => { if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null } }
  }, [autoRefresh])

  // #9 CRM stage setter (persisted) — wired into popup chips via a ref.
  const setCrmStage = useCallback((id: number, stage: CrmStage) => {
    setCrm((prev) => { const next = { ...prev, [id]: stage }; persistCrm(next); return next })
  }, [])
  useEffect(() => { setCrmStageRef.current = setCrmStage }, [setCrmStage])
  // Sync pin colors when a stage is changed elsewhere (e.g. the lead table).
  useEffect(() => {
    const sync = () => setCrm(loadCrm())
    window.addEventListener(CRM_EVENT, sync)
    return () => window.removeEventListener(CRM_EVENT, sync)
  }, [])

  // ── Zone drawing (defined before the map init effect that references them) ──
  // Apply a polygon: draw it, count leads inside, filter the table.
  const applyZone = useCallback((pts: LatLng[]) => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map || pts.length < 3) return
    if (guideRef.current) { guideRef.current.remove(); guideRef.current = null }
    if (zonePolyRef.current) { zonePolyRef.current.remove(); zonePolyRef.current = null }
    zonePolyRef.current = L.polygon(pts.map((p) => [p.lat, p.lng]), { color: "#818cf8", weight: 2, fillColor: "#6366f1", fillOpacity: 0.12 }).addTo(map)
    try { map.fitBounds(pts.map((p) => [p.lat, p.lng]) as [number, number][], { padding: [30, 30], maxZoom: 15 }) } catch {}
    const inside = leadsRef.current.filter((l) => { const ll = coordsRef.current[l.attomId]; return ll && pointInPolygon(ll.lat, ll.lng, pts) })
    setZoneCount(inside.length)
    onZoneRef.current?.(inside.map((l) => l.attomId))
    finishedZoneRef.current = pts
    setCanSaveZone(true)
  }, [])

  const finishZone = useCallback(() => {
    const pts = drawPtsRef.current
    if (pts.length < 3) return
    applyZone(pts)
    setMode("explore")
  }, [applyZone])

  const clearZone = useCallback(() => {
    drawPtsRef.current = []
    guideRef.current?.remove(); guideRef.current = null
    zonePolyRef.current?.remove(); zonePolyRef.current = null
    finishedZoneRef.current = null
    setCanSaveZone(false)
    setZoneCount(null)
    onZoneRef.current?.(null)
  }, [])

  const startDraw = useCallback(() => { clearZone(); drawPtsRef.current = []; setMode("draw") }, [clearZone])

  // Save the just-drawn zone as a named farm (localStorage).
  const saveZone = useCallback(() => {
    const pts = finishedZoneRef.current
    if (!pts || pts.length < 3) return
    const name = (typeof window !== "undefined" ? window.prompt("Name this farm zone:", "My farm") : "")?.trim()
    if (!name) return
    const zone: SavedZone = { id: `${Date.now()}`, name, points: pts }
    setSavedZones((prev) => { const next = [...prev, zone]; persistZones(next); return next })
  }, [])

  const loadSavedZone = useCallback((zone: SavedZone) => { applyZone(zone.points); setShowZones(false) }, [applyZone])
  const deleteSavedZone = useCallback((id: string) => {
    setSavedZones((prev) => { const next = prev.filter((z) => z.id !== id); persistZones(next); return next })
  }, [])

  // ── Route building ──────────────────────────────────────────────────────────
  const addToRoute = useCallback((lead: ForeclosureLead) => {
    setRoute((prev) => (prev.some((l) => l.attomId === lead.attomId) ? prev : [...prev, lead]))
  }, [])
  const openRoute = useCallback(() => {
    const stops = route.map((l) => coordsRef.current[l.attomId]).filter(Boolean) as LatLng[]
    if (stops.length < 1) return
    const capped = stops.slice(0, 10) // Google dir URL practical waypoint ceiling
    const fmt = (s: LatLng) => `${s.lat},${s.lng}`
    let url: string
    if (capped.length === 1) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${fmt(capped[0])}&travelmode=driving`
    } else {
      const origin = fmt(capped[0])
      const destination = fmt(capped[capped.length - 1])
      const waypoints = capped.slice(1, -1).map(fmt).join("|")
      url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}` +
        (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "") + "&travelmode=driving"
    }
    window.open(url, "_blank", "noopener")
  }, [route])

  // ── Click-to-analyze: click ANY point (in Explore mode) → show the address &
  //    whether it's a flagged deal. If a known lead is within ~120m, open it;
  //    otherwise reverse-geocode the spot and report honestly. ─────────────────
  const analyzeAtPoint = useCallback(async (pt: { lat: number; lng: number }) => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    const here: LatLng = { lat: pt.lat, lng: pt.lng }

    let best: { lead: ForeclosureLead; d: number; ll: LatLng } | null = null
    for (const lead of leadsRef.current) {
      const ll = coordsRef.current[lead.attomId]; if (!ll) continue
      const d = distanceMeters(here, ll)
      if (!best || d < best.d) best = { lead, d, ll }
    }

    // Clicked on/near a known deal → surface that deal.
    if (best && best.d <= 120) {
      map.flyTo([best.ll.lat, best.ll.lng], Math.max(map.getZoom(), 15), { duration: 0.4 })
      const id = best.lead.attomId
      const open = () => markerById.current.get(id)?.openPopup()
      const m = markerById.current.get(id)
      if (m) open(); else setTimeout(open, 600)
      return
    }

    // Empty spot → reverse-geocode and report (honest about road/open land).
    const popup = L.popup({ maxWidth: 264, autoClose: false, closeOnClick: false }).setLatLng([here.lat, here.lng])
      .setContent('<div style="font-family:ui-sans-serif,system-ui;color:#e5e7eb;font-size:12px">📍 Looking up this address…</div>')
      .openOn(map)
    const { address, kind } = await reverseGeocode(here.lat, here.lng)
    const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${here.lat},${here.lng}`
    const heading = kind === "parcel"
      ? `📍 ${escapeHtml(address || "")}`
      : kind === "road"
      ? `🛣️ ${escapeHtml(address || "A road / freeway")} — not a property`
      : address ? `📍 Near ${escapeHtml(address)}` : "📍 No address found at this exact spot"
    const guidance = kind === "parcel"
      ? "Not in the current distress results — no active foreclosure, tax, or lien signal. To underwrite it we need value &amp; debt: search this area or paste it into “Check an address”."
      : "Click directly on a house/parcel (zoom in for accuracy) — this point is on a road or open land, which has no property address."
    popup.setContent(`
      <div style="min-width:210px;font-family:ui-sans-serif,system-ui;color:#e5e7eb">
        <div style="font-weight:700;font-size:12px;line-height:1.3">${heading}</div>
        <div style="color:#fbbf24;font-weight:700;font-size:11.5px;margin-top:4px">⚠️ Not a flagged distressed deal</div>
        <div style="font-size:10.5px;color:#9ca3af;margin-top:3px">${guidance}</div>
        ${kind === "parcel" ? `<a href="${sv}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:8px;background:#374151;color:#e5e7eb;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:600;text-decoration:none">📷 Street View</a>` : ""}
      </div>`)
  }, [])
  useEffect(() => { analyzeRef.current = analyzeAtPoint }, [analyzeAtPoint])

  // ── Initialize Leaflet once ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !containerRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(containerRef.current, { scrollWheelZoom: true, zoomControl: false }).setView([34.0, -117.6], 9)
      L.control.zoom({ position: "bottomleft" }).addTo(map)
      streetTileRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map)
      satTileRef.current = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "&copy; Esri" })
      setSavedZones(loadZones())
      setDriveLeads(loadDrivingLeads())
      setAlerts(loadAlerts())
      setBuyBox(loadBuyBox())
      setCrm(loadCrm())
      layerRef.current = L.layerGroup().addTo(map)
      heatLayerRef.current = L.layerGroup().addTo(map)
      compLayerRef.current = L.layerGroup().addTo(map)
      driveLayerRef.current = L.layerGroup().addTo(map)

      // Delegate popup buttons: "Full analysis" and the CRM stage chips.
      map.on("popupopen", (e: { popup: { getElement: () => HTMLElement | undefined } }) => {
        const el = e.popup.getElement?.()
        const btn = el?.querySelector<HTMLButtonElement>("button[data-leadid]")
        if (btn) btn.onclick = () => { const id = Number(btn.getAttribute("data-leadid")); if (Number.isFinite(id)) onSelectRef.current?.(id) }
        el?.querySelectorAll<HTMLButtonElement>("button[data-crm-stage]").forEach((b) => {
          b.onclick = () => {
            const id = Number(b.getAttribute("data-crm-lead"))
            const stage = b.getAttribute("data-crm-stage") as CrmStage | null
            if (Number.isFinite(id) && stage) setCrmStageRef.current(id, stage)
          }
        })
      })

      // Only forget the open popup when the USER closes it (the X), not when we
      // rebuild markers — so deal popups survive re-renders & CRM updates.
      map.on("popupclose", () => { if (!rebuildingRef.current) openLeadIdRef.current = null })

      // Map clicks: draw mode adds zone vertices; explore mode analyzes the spot.
      map.on("click", (e: LeafletMouseEvent) => {
        if (modeRef.current === "draw") {
          drawPtsRef.current = [...drawPtsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]
          const pts = drawPtsRef.current.map((p) => [p.lat, p.lng]) as [number, number][]
          if (guideRef.current) { guideRef.current.setLatLngs(pts) }
          else { guideRef.current = L.polyline(pts, { color: "#818cf8", weight: 2, dashArray: "4 4" }).addTo(map) }
        } else if (modeRef.current === "explore") {
          analyzeRef.current(e.latlng)
        }
      })
      map.on("dblclick", () => { if (modeRef.current === "draw") finishZone() })

      // Re-cluster on pan/zoom (reads latest data via renderRef).
      map.on("moveend zoomend", () => renderRef.current())

      mapRef.current = map
      setReady(true)
      renderRef.current()
    })()
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (ready && !collapsed) setTimeout(() => mapRef.current?.invalidateSize(), 60) }, [ready, collapsed])

  // Double-click zoom interferes with finishing a drawn zone.
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    if (mode === "draw") map.doubleClickZoom.disable(); else map.doubleClickZoom.enable()
  }, [mode])

  // A stable key based only on ADDRESSES — so enrichment patches (which change
  // the leads array identity but not the addresses) don't wipe the pins and
  // restart geocoding. This is the "only 2 mapped" fix.
  const leadsKey = useMemo(() => leads.map((l) => `${l.attomId}~${l.address ?? ""}~${l.zip ?? ""}`).join("|"), [leads])

  // Reset mapped coordinates only when the actual address set changes.
  const [coordsKey, setCoordsKey] = useState(leadsKey)
  if (leadsKey !== coordsKey) {
    setCoordsKey(leadsKey)
    setCoords({})
    setGeoProgress(leads.length ? { done: 0, total: leads.length } : null)
  }

  // ── Geocode the current lead set (cached, bounded concurrency, abortable) ───
  // Keyed on leadsKey so a value/owner patch never restarts an in-flight run.
  useEffect(() => {
    didFitRef.current = false
    const current = leadsRef.current
    if (!current.length) return
    const ctrl = new AbortController()
    geocodeLeads(
      current,
      (index, ll) => {
        const id = current[index].attomId
        setCoords((prev) => (prev[id] ? prev : { ...prev, [id]: ll }))
        setGeoProgress((g) => (g ? { done: g.done + 1, total: g.total } : g))
      },
      { signal: ctrl.signal },
    ).catch(() => {}).finally(() => { if (!ctrl.signal.aborted) setGeoProgress(null) })
    return () => { ctrl.abort() }
  }, [leadsKey])

  // ── Cluster + render pins (grid-clustering by screen pixels) ────────────────
  const hasSelect = Boolean(onSelectLead)
  const renderMarkers = useCallback(() => {
    const L = LRef.current, layer = layerRef.current, map = mapRef.current
    if (!L || !layer || !map) return
    rebuildingRef.current = true // popupclose during clear shouldn't forget the open deal
    layer.clearLayers(); markerById.current.clear()

    const zoom = map.getZoom()
    const CELL = 64
    const psf = psfRef.current
    const box = buyBoxRef.current
    const analysisOf = (l: ForeclosureLead) => analyzeDeal(l, undefined, psf ? { fallbackPsf: psf } : undefined)
    const pts = leadsRef.current.map((l) => ({ l, ll: coordsRef.current[l.attomId] })).filter((x): x is { l: ForeclosureLead; ll: LatLng } => Boolean(x.ll))

    // Buy-box (#1), New (#2) and Predicted filters: matching deals cluster/pin;
    // the rest fade to faint grey dots so your matches pop.
    const newOnly = newOnlyRef.current
    const predOnly = predOnlyRef.current
    let clusterPts = pts
    if (box.enabled || newOnly || predOnly) {
      clusterPts = []
      for (const p of pts) {
        const passBox = !box.enabled || matchesBuyBox(p.l, analysisOf(p.l), box)
        const passNew = !newOnly || newIdsRef.current.has(p.l.attomId)
        const passPred = !predOnly || predictPreForeclosure(p.l).predicted
        if (passBox && passNew && passPred) clusterPts.push(p)
        else L.circleMarker([p.ll.lat, p.ll.lng], { radius: 3, stroke: false, fillColor: "#475569", fillOpacity: 0.35, bubblingMouseEvents: false }).addTo(layer)
      }
    }

    const buckets = new Map<string, { items: { l: ForeclosureLead; ll: LatLng }[]; x: number; y: number }>()
    for (const p of clusterPts) {
      const pix = map.project([p.ll.lat, p.ll.lng], zoom)
      const key = Math.floor(pix.x / CELL) + ":" + Math.floor(pix.y / CELL)
      const b = buckets.get(key)
      if (b) { b.items.push(p); b.x += pix.x; b.y += pix.y } else buckets.set(key, { items: [p], x: pix.x, y: pix.y })
    }

    const allLatLng: [number, number][] = []
    for (const b of buckets.values()) {
      if (b.items.length === 1) {
        const { l, ll } = b.items[0]
        const u = leadUrgency(l)
        const stage = crmRef.current[l.attomId]
        const predicted = predictPreForeclosure(l).predicted
        const radius = 6 + Math.round((Math.max(0, Math.min(100, l.score ?? 0)) / 100) * 10)
        const m = L.circleMarker([ll.lat, ll.lng], {
          radius,
          // Predicted (no filing) gets a magenta dashed ring — clearly a forecast.
          color: predicted && !pipelineRef.current ? PREDICT_COLOR : l.isAbsentee ? "#a78bfa" : "#0b0f17",
          weight: predicted && !pipelineRef.current ? 2.5 : l.isAbsentee ? 3 : 1.5,
          dashArray: predicted && !pipelineRef.current ? "3 3" : undefined,
          fillColor: pipelineRef.current ? crmColor(stage) : predicted ? PREDICT_COLOR : URGENCY_COLOR[u],
          fillOpacity: 0.9,
          bubblingMouseEvents: false, // don't trigger the map's click-to-analyze
        })
        // Persistent: stays open (with an X) until the user closes it, so deal
        // info doesn't vanish when they click elsewhere on the map.
        const fits = fitsProfile(l, analysisOf(l), profileRef.current)
        const isNew = newIdsRef.current.has(l.attomId)
        // autoPan:false prevents an edge-popup from panning the map, which would
        // fire moveend → rebuild → close. Persistent until the user hits X.
        m.bindPopup(popupHtml(l, ll, hasSelect, psf, stage, fits, isNew), { maxWidth: 268, autoClose: false, closeOnClick: false, autoPan: false })
        // Zoomed in: show a permanent score chip on each lead. Zoomed out: a
        // hover tooltip with score + address (keeps the view uncluttered).
        const zoomedIn = zoom >= 15
        m.bindTooltip(
          zoomedIn ? `${l.score ?? 0}` : `${l.score ?? 0} · ${escapeHtml(l.address)}`,
          { direction: "top", offset: [0, -4], permanent: zoomedIn, className: zoomedIn ? "ap-score-label" : "" },
        )
        if (u === "imminent") m.setStyle({ className: "ap-pulse-pin" })
        m.on("click", () => {
          if (modeRef.current === "route") { m.closePopup(); addToRoute(l) }
          else { openLeadIdRef.current = l.attomId; m.openPopup() }
        })
        m.addTo(layer)
        markerById.current.set(l.attomId, m)
      } else {
        // Cluster bubble — sized by count, colored by most-urgent member.
        const center = map.unproject([b.x / b.items.length, b.y / b.items.length], zoom)
        let worst: Urgency = "early"
        for (const it of b.items) { const u = leadUrgency(it.l); if (URGENCY_RANK[u] > URGENCY_RANK[worst]) worst = u }
        const n = b.items.length
        const size = Math.min(52, 26 + String(n).length * 8)
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${URGENCY_COLOR[worst]};opacity:.9;color:#111;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.85);box-shadow:0 1px 6px rgba(0,0,0,.5)">${n}</div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        })
        L.marker([center.lat, center.lng], { icon })
          .on("click", () => map.flyTo([center.lat, center.lng], Math.min(zoom + 2, 16), { duration: 0.5 }))
          .addTo(layer)
      }
      for (const it of b.items) allLatLng.push([it.ll.lat, it.ll.lng])
    }

    if (allLatLng.length && !flyToQuery && !didFitRef.current) {
      didFitRef.current = true
      try { map.fitBounds(allLatLng, { padding: [40, 40], maxZoom: 13 }) } catch {}
    }

    // Re-open the popup that was open before this rebuild (if its pin still
    // exists at this zoom), so clicking, filtering, or CRM updates never make
    // the deal card vanish.
    const oid = openLeadIdRef.current
    if (oid != null) markerById.current.get(oid)?.openPopup()
    rebuildingRef.current = false
  }, [flyToQuery, addToRoute, hasSelect])
  useEffect(() => { renderRef.current = renderMarkers }, [renderMarkers])
  useEffect(() => { if (ready) renderMarkers() }, [coords, leads, ready, renderMarkers])

  // ── Fly to the searched area ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !flyToQuery) return
    let cancelled = false
    ;(async () => { const ll = await geocodePlace(flyToQuery); if (!cancelled && ll && mapRef.current) mapRef.current.flyTo([ll.lat, ll.lng], 12, { duration: 0.8 }) })()
    return () => { cancelled = true }
  }, [flyToQuery, ready])

  // ── Emphasize a hovered/selected lead ───────────────────────────────────────
  useEffect(() => {
    if (!highlightId) return
    const ll = coords[highlightId]
    if (ll && mapRef.current) {
      mapRef.current.flyTo([ll.lat, ll.lng], 16, { duration: 0.6 })
      setTimeout(() => markerById.current.get(highlightId)?.openPopup(), 700)
    }
  }, [highlightId, coords])

  // ── Comparable-sales layer (geocode comp addresses on demand) ───────────────
  useEffect(() => {
    const L = LRef.current, layer = compLayerRef.current
    if (!L || !layer || !ready) return
    layer.clearLayers()
    if (!showComps) return
    const ctrl = new AbortController()
    const comps = leads.flatMap((l) => (l.comps ?? []).map((c) => c)).filter((c) => c?.address)
    ;(async () => {
      for (const c of comps) {
        if (ctrl.signal.aborted) return
        const ll = await geocodeAddress(c.address)
        if (ctrl.signal.aborted || !ll) continue
        L.circleMarker([ll.lat, ll.lng], { radius: 4, color: "#0b0f17", weight: 1, fillColor: "#94a3b8", fillOpacity: 0.85 })
          .bindTooltip(`Comp · ${money(c.price)}${c.sqft ? ` · ${c.sqft} sqft` : ""}`, { direction: "top" })
          .addTo(layer)
      }
    })()
    return () => { ctrl.abort() }
  }, [showComps, leads, ready])

  // ── Heat overlay — density weighted by Score / Equity $ / Profit $ ──────────
  useEffect(() => {
    const L = LRef.current, layer = heatLayerRef.current
    if (!L || !layer || !ready) return
    layer.clearLayers()
    if (!showHeat) return
    for (const l of leads) {
      const ll = coords[l.attomId]; if (!ll) continue
      const w = heatWeight(l, heatMetric)
      if (w <= 0) continue
      // Hotter (more equity/profit/score) = larger + more opaque red.
      L.circleMarker([ll.lat, ll.lng], { radius: 18 + Math.round(w * 16), stroke: false, fillColor: "#ef4444", fillOpacity: 0.07 + w * 0.16 })
        .addTo(layer)
    }
  }, [showHeat, heatMetric, coords, leads, ready])

  // ── Base layer swap (Street ↔ Satellite) ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current, street = streetTileRef.current, sat = satTileRef.current
    if (!map || !street || !sat) return
    if (baseLayer === "satellite") { if (map.hasLayer(street)) map.removeLayer(street); if (!map.hasLayer(sat)) sat.addTo(map) }
    else { if (map.hasLayer(sat)) map.removeLayer(sat); if (!map.hasLayer(street)) street.addTo(map) }
  }, [baseLayer, ready])

  // ── #6 Driving for Dollars — GPS follow + log houses in the field ───────────
  const toggleDriving = useCallback(() => {
    if (driving) {
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      meMarkerRef.current?.remove(); meMarkerRef.current = null
      setDriving(false)
      return
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGpsError("Location isn't available on this device/browser."); return }
    setGpsError(null); setDriving(true); setMode("explore")
    let first = true
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const L = LRef.current, map = mapRef.current; if (!L || !map) return
        const ll: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        myPosRef.current = ll
        if (meMarkerRef.current) meMarkerRef.current.setLatLng([ll.lat, ll.lng])
        else meMarkerRef.current = L.circleMarker([ll.lat, ll.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#2563eb", fillOpacity: 1, className: "ap-pulse-pin" }).addTo(map)
        if (first) { map.flyTo([ll.lat, ll.lng], 16, { duration: 0.6 }); first = false }
      },
      (err) => setGpsError(err.message || "Couldn't get your location — allow location access."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }, [driving])

  const logHouse = useCallback(async () => {
    const map = mapRef.current; if (!map) return
    const c = myPosRef.current ?? { lat: map.getCenter().lat, lng: map.getCenter().lng }
    const { address } = await reverseGeocode(c.lat, c.lng)
    const note = (typeof window !== "undefined" ? window.prompt("Quick note (condition, boarded up, overgrown…) — optional:", "") : "") ?? ""
    const dl: DrivingLead = { id: `${Date.now()}`, lat: c.lat, lng: c.lng, address, note, ts: Date.now() }
    setDriveLeads((prev) => { const next = [dl, ...prev]; persistDrivingLeads(next); return next })
  }, [])

  const deleteDriveLead = useCallback((id: string) => setDriveLeads((prev) => { const n = prev.filter((d) => d.id !== id); persistDrivingLeads(n); return n }), [])
  const exportDriveLeads = useCallback(() => {
    if (typeof window === "undefined" || !driveLeads.length) return
    const rows = [["address", "note", "lat", "lng", "logged"], ...driveLeads.map((d) => [d.address ?? "", d.note, String(d.lat), String(d.lng), new Date(d.ts).toISOString()])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a"); a.href = url; a.download = "driving-for-dollars.csv"; a.click(); URL.revokeObjectURL(url)
  }, [driveLeads])

  // Render logged houses (persisted) as 🏠 markers.
  useEffect(() => {
    const L = LRef.current, layer = driveLayerRef.current
    if (!L || !layer || !ready) return
    layer.clearLayers()
    for (const d of driveLeads) {
      const icon = L.divIcon({ className: "", html: '<div style="font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">🏠</div>', iconSize: [18, 18], iconAnchor: [9, 16] })
      L.marker([d.lat, d.lng], { icon }).bindPopup(
        `<div style="font-family:ui-sans-serif,system-ui;color:#e5e7eb;min-width:170px"><div style="font-weight:700;font-size:12px">🏠 ${d.address ? escapeHtml(d.address) : "Logged house"}</div>${d.note ? `<div style="font-size:11px;color:#cbd5e1;margin-top:2px">${escapeHtml(d.note)}</div>` : ""}<div style="font-size:10px;color:#9ca3af;margin-top:2px">Logged ${new Date(d.ts).toLocaleDateString()}</div><a href="https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:6px;color:#a5b4fc;font-size:11px;font-weight:600;text-decoration:none">Navigate →</a></div>`,
        { autoClose: false, closeOnClick: false },
      ).addTo(layer)
    }
  }, [driveLeads, ready])

  // Stop GPS watching on unmount.
  useEffect(() => () => { if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current) }, [])

  // ── #13 Zone deal alerts — fire when NEW HOT deals enter a watched farm ─────
  const toggleZoneAlert = useCallback((zone: SavedZone) => {
    setAlerts((prev) => {
      const zones = { ...prev.zones }
      let phone = prev.phone
      if (zones[zone.id]) { delete zones[zone.id] }
      else {
        if (!phone) { const p = (typeof window !== "undefined" ? window.prompt("Phone number to text deal alerts to (e.g. +13105551234):", "") : "")?.trim() ?? ""; if (!p) return prev; phone = p }
        // Baseline with current HOT leads so we only alert on FUTURE new ones.
        zones[zone.id] = leadsRef.current.filter((l) => l.priority === "HOT")
          .filter((l) => { const ll = coordsRef.current[l.attomId]; return ll && pointInPolygon(ll.lat, ll.lng, zone.points) })
          .map((l) => l.attomId)
      }
      const next = { phone, zones }; persistAlerts(next); alertsRef.current = next; return next
    })
  }, [])

  useEffect(() => {
    if (!ready || geoProgress !== null || !leads.length) return
    const cfg = alertsRef.current
    const watched = Object.keys(cfg.zones)
    if (watched.length === 0) return
    const byId = new Map(savedZones.map((z) => [z.id, z]))
    const zones = { ...cfg.zones }
    let totalNew = 0
    const lines: string[] = []
    for (const zid of watched) {
      const zone = byId.get(zid); if (!zone) continue
      const seen = new Set(cfg.zones[zid] ?? [])
      const hotInside = leads.filter((l) => l.priority === "HOT")
        .filter((l) => { const ll = coordsRef.current[l.attomId]; return ll && pointInPolygon(ll.lat, ll.lng, zone.points) })
      const fresh = hotInside.filter((l) => !seen.has(l.attomId))
      if (fresh.length) { totalNew += fresh.length; lines.push(`${fresh.length} in "${zone.name}"`) }
      zones[zid] = Array.from(new Set([...(cfg.zones[zid] ?? []), ...hotInside.map((l) => l.attomId)]))
    }
    const next: AlertConfig = { phone: cfg.phone, zones }
    alertsRef.current = next; persistAlerts(next); setAlerts(next)
    if (totalNew > 0) {
      const msg = `🔔 ${totalNew} new HOT pre-foreclosure deal${totalNew === 1 ? "" : "s"} in your farm: ${lines.join(", ")}.`
      setAlertBanner(msg)
      if (cfg.phone) {
        fetch("/api/leads/notify", { method: "POST", headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) }, body: JSON.stringify({ phone: cfg.phone, message: msg }) }).catch(() => {})
      }
    }
  }, [leads, geoProgress, ready, savedZones, apiHeaders])

  // ── In-map address assessment: "is this a good deal?" ───────────────────────
  const assess = useCallback(async () => {
    const q = addrInput.trim()
    if (!q || !mapRef.current || !LRef.current) return
    setAssessing(true); setAssessment(null)
    try {
      const L = LRef.current
      const ll = (await geocodeAddress(q)) ?? (await geocodePlace(q))
      if (!ll) { setAssessment({ kind: "notfound", title: "Couldn't locate that address." }); return }
      mapRef.current.flyTo([ll.lat, ll.lng], 16, { duration: 0.8 })
      if (searchPinRef.current) searchPinRef.current.setLatLng([ll.lat, ll.lng])
      else {
        const icon = L.divIcon({ className: "", html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#4f46e5;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>', iconSize: [18, 18], iconAnchor: [9, 18] })
        searchPinRef.current = L.marker([ll.lat, ll.lng], { icon }).addTo(mapRef.current)
      }
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
      const nq = norm(q)
      const streetOf = (a: string) => norm(a.split(",")[0])
      const hit = leads.find((l) => { const s = streetOf(l.address); return s.length > 4 && (nq.includes(s) || s.includes(nq)) })
      if (hit) {
        setAssessment({ kind: "deal", title: `Live deal — score ${hit.score}/100 (${hit.priority})`, lead: hit })
        markerById.current.get(hit.attomId)?.openPopup()
        return
      }
      // Not a flagged distressed lead → analyze ANY property for a good deal.
      setAssessment({ kind: "analyzing", title: "Analyzing this property…" })
      try {
        const res = await fetch("/api/leads/analyze-address", { method: "POST", headers: { "Content-Type": "application/json", ...(apiHeaders ?? {}) }, body: JSON.stringify({ address: q }) })
        const d = await res.json() as AnalyzeResp & { error?: string }
        if (d && d.analysis && (d.found || d.analysis.hasValue)) setAssessment({ kind: "analyze", title: q, data: d })
        else setAssessment({ kind: "none", title: "Not a distressed deal, and not enough public data to underwrite it.", note: "Try a more complete address, or add a free TAVILY_API_KEY for richer web data." })
      } catch {
        setAssessment({ kind: "none", title: "Couldn't analyze that address.", note: "" })
      }
    } finally { setAssessing(false) }
  }, [addrInput, leads, apiHeaders])

  const pinCount = Object.keys(coords).length
  const toolBtn = (active: boolean) =>
    `px-1.5 py-0.5 rounded-md text-[11px] leading-none font-semibold border transition-colors ${active ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-900/85 border-gray-600/50 text-gray-300 hover:text-white"}`

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-indigo-950/40 border border-indigo-500/25 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺️</span>
          <div>
            <div className="text-sm font-semibold text-white">Live Distress Map</div>
            <div className="text-[11px] text-gray-400">
              {pinCount > 0 ? `${pinCount} of ${leads.length} deals mapped` : "Search an area to drop deal pins"}
              {geoProgress && geoProgress.done < geoProgress.total ? " · mapping…" : ""}
              {zoneCount != null ? ` · ${zoneCount} in zone` : ""}
            </div>
          </div>
        </div>
        <button onClick={() => setCollapsed((c) => !c)} className="text-xs text-indigo-300 hover:text-indigo-200 px-2 py-1 rounded-lg hover:bg-white/5">
          {collapsed ? "Show map ▾" : "Hide map ▴"}
        </button>
      </div>

      {!collapsed && (
        <div className="relative">
          {/* Address assessment bar */}
          <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2 w-[min(340px,calc(100%-90px))]">
            <div className="flex gap-1.5">
              <input value={addrInput} onChange={(e) => setAddrInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") assess() }}
                placeholder="Check an address — is it a deal?"
                className="flex-1 bg-gray-900/95 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 shadow-lg" />
              <button onClick={assess} disabled={assessing || !addrInput.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-3 rounded-lg shadow-lg">{assessing ? "…" : "Check"}</button>
            </div>
            {assessment && (
              <div className={`rounded-lg px-3 py-2 text-xs shadow-lg border ${assessment.kind === "deal" ? "bg-emerald-950/95 border-emerald-500/40 text-emerald-100" : assessment.kind === "analyze" ? "bg-sky-950/95 border-sky-500/40 text-sky-100" : assessment.kind === "none" ? "bg-amber-950/95 border-amber-500/40 text-amber-100" : "bg-gray-900/95 border-gray-600/50 text-gray-200"}`}>
                <div className="font-semibold flex items-center gap-1">{assessment.kind === "deal" ? "✅" : assessment.kind === "analyze" ? "📊" : assessment.kind === "analyzing" ? "⏳" : assessment.kind === "none" ? "⚠️" : "❓"} {assessment.title}</div>
                {assessment.kind === "analyze" && assessment.data && (() => {
                  const { property: pr, value, analysis: an } = assessment.data
                  const VC: Record<string, string> = { Pursue: "text-emerald-300", Negotiate: "text-amber-300", Pass: "text-red-300", Underwrite: "text-sky-300" }
                  return (
                    <div className="mt-1.5 space-y-1">
                      <div className="text-sky-200/80">General deal analysis (not a distressed lead)</div>
                      <div className="text-sky-100">{pr.beds ?? "—"}bd/{pr.baths ?? "—"}ba · {pr.sqft ? `${pr.sqft} sqft` : "— sqft"}{pr.yearBuilt ? ` · ${pr.yearBuilt}` : ""}{pr.owner ? ` · ${pr.owner}` : ""}</div>
                      <div className={`font-bold ${VC[an.verdict.call] ?? "text-sky-200"}`}>{an.verdict.call === "Pursue" ? "✅" : an.verdict.call === "Negotiate" ? "🤝" : an.verdict.call === "Pass" ? "🛑" : "🔎"} {an.verdict.call} — {an.verdict.reason}</div>
                      {an.hasValue && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 bg-sky-900/40 rounded px-2 py-1">
                          <span className="text-sky-200/70">Value</span><span className="text-right">{fmtMoney(value)}</span>
                          <span className="text-sky-200/70">MAO</span><span className="text-right font-semibold">{fmtMoney(an.mao)}</span>
                          <span className="text-sky-200/70">{an.label}{an.label === "Flip profit" ? ` · ${an.roi}% ROI` : ""}</span><span className={`text-right font-bold ${an.profit > 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtMoney(an.profit)}</span>
                          <span className="text-sky-200/70">Equity</span><span className="text-right">{an.equityPercent}%</span>
                        </div>
                      )}
                      {!an.hasValue && <div className="text-amber-200/80">Couldn&apos;t find a value — try a more complete address.</div>}
                    </div>
                  )
                })()}
                {assessment.lead && (() => {
                  const da = analyzeDeal(assessment.lead!)
                  return (
                    <div className="mt-1.5 space-y-1">
                      <div className="text-emerald-200/90">Distressed: <span className="font-semibold text-red-200">✓ Yes — {da.distressType || "signal found"}</span></div>
                      {da.hasValue && (
                        <div className="flex items-center justify-between bg-emerald-900/40 rounded px-2 py-1">
                          <span className="text-emerald-200/80">{da.headlineLabel}{da.headlineLabel === "Flip profit" ? ` · ${da.roiPct}% ROI` : ""}</span>
                          <span className={`font-bold ${da.headlineProfit > 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtMoney(da.headlineProfit)}</span>
                        </div>
                      )}
                      {da.whyGood.slice(0, 4).map((s, i) => <div key={i} className="text-emerald-200/90">✓ {s}</div>)}
                      {!da.hasValue && <div className="text-amber-200/80">No value estimate — run Live Valuation to size profit & ROI.</div>}
                      <button onClick={() => onSelectLead?.(assessment.lead!.attomId)} className="text-emerald-300 hover:text-emerald-200 font-semibold">Open full analysis →</button>
                    </div>
                  )
                })()}
                {assessment.note && <div className="mt-1 text-amber-200/80">{assessment.note}</div>}
              </div>
            )}
          </div>

          {/* Toolbar — compact icon buttons (hover for names) */}
          <div className="absolute top-2 right-2 z-[1000] flex flex-col items-end gap-1 max-w-[50%]">
            <div className="flex items-center gap-1">
              <button onClick={() => setToolsOpen((v) => !v)} className={toolBtn(false)} title={toolsOpen ? "Hide tools" : "Show tools"}>{toolsOpen ? "✕" : "🛠"}</button>
              {toolsOpen && (
                <div className="flex flex-wrap gap-1 justify-end">
                  <button onClick={() => setMode("explore")} className={toolBtn(mode === "explore")} title="Explore (click anywhere to check it)">✋</button>
                  <button onClick={() => (mode === "draw" ? clearZone() : startDraw())} className={toolBtn(mode === "draw")} title={mode === "draw" ? "Cancel drawing" : "Draw a farm zone"}>{mode === "draw" ? "✕✏️" : "✏️"}</button>
                  <button onClick={() => setMode(mode === "route" ? "explore" : "route")} className={toolBtn(mode === "route")} title="Plan a driving route">🧭</button>
                  <button onClick={() => setShowComps((v) => !v)} className={toolBtn(showComps)} title="Comparable sales">🏷️</button>
                  <button onClick={() => setShowHeat((v) => !v)} className={toolBtn(showHeat)} title="Heat map (profit/equity/score)">🔥</button>
                  <button onClick={() => setBaseLayer((b) => (b === "street" ? "satellite" : "street"))} className={toolBtn(baseLayer === "satellite")} title="Satellite / street view">🛰</button>
                  <button onClick={() => setShowZones((v) => !v)} className={toolBtn(showZones)} title="Saved farm zones">📁</button>
                  <button onClick={toggleDriving} className={toolBtn(driving)} title="Driving for Dollars (GPS)">🚗</button>
                  <button onClick={() => setShowDriveList((v) => !v)} className={toolBtn(showDriveList)} title="Logged houses">📋{driveLeads.length ? driveLeads.length : ""}</button>
                  <button onClick={() => setShowBuyBox((v) => !v)} className={toolBtn(buyBox.enabled || showBuyBox)} title="My buy-box filter">🎯{buyBox.enabled ? "✓" : ""}</button>
                  <button onClick={() => setNewOnly((v) => !v)} className={toolBtn(newOnly)} title="New leads only">🆕{newCount ? newCount : ""}</button>
                  <button onClick={() => setPredOnly((v) => !v)} className={toolBtn(predOnly)} title="Predicted pre-foreclosures only (our forecast)">🔮</button>
                  <button onClick={() => setPipelineView((v) => !v)} className={toolBtn(pipelineView)} title="Pipeline view (color by CRM stage)">🗂</button>
                  <button onClick={() => setShowMarket((v) => !v)} className={toolBtn(showMarket)} title="Area market snapshot">📊</button>
                  {onRefresh && <button onClick={() => setAutoRefresh((v) => !v)} className={toolBtn(autoRefresh)} title="Auto-refresh every 15 min">🔄{autoRefresh ? "✓" : ""}</button>}
                </div>
              )}
            </div>
            {gpsError && <div className="bg-red-950/90 border border-red-500/40 rounded-lg px-2.5 py-1 text-[10px] text-red-200 shadow-lg max-w-[220px]">{gpsError}</div>}

            {/* Pipeline legend */}
            {pipelineView && (
              <div className="flex flex-wrap gap-1.5 bg-gray-900/90 border border-gray-700/50 rounded-lg p-1.5 shadow-lg max-w-[260px]">
                {CRM_STAGES.map((s) => <span key={s.id} className="flex items-center gap-1 text-[9px] text-gray-300"><span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
              </div>
            )}

            {/* Market snapshot */}
            {showMarket && (
              <div className="bg-gray-900/95 border border-gray-700/60 rounded-lg p-2.5 shadow-xl w-56 text-[11px]">
                <div className="text-[10px] text-gray-500 mb-1.5">📊 Area snapshot ({snapshot.count} deals)</div>
                <div className="grid grid-cols-2 gap-y-1">
                  <span className="text-gray-500">Median value</span><span className="text-white text-right font-semibold">{snapshot.medianValue ? fmtMoney(snapshot.medianValue) : "—"}</span>
                  <span className="text-gray-500">Median $/sqft</span><span className="text-white text-right font-semibold">{snapshot.medianPsf ? `$${snapshot.medianPsf}` : "—"}</span>
                  <span className="text-gray-500">Median equity</span><span className="text-emerald-300 text-right font-semibold">{snapshot.medianEquityPct != null ? `${snapshot.medianEquityPct}%` : "—"}</span>
                  <span className="text-gray-500">HOT deals</span><span className="text-red-300 text-right font-semibold">{snapshot.hot}</span>
                  <span className="text-gray-500">Avg score</span><span className="text-white text-right font-semibold">{snapshot.avgScore}</span>
                </div>
                <div className="text-[9px] text-gray-600 mt-1.5 pt-1.5 border-t border-gray-700/50">Median $/sqft auto-fills ARV on leads with no value.</div>
              </div>
            )}

            {/* Buy-box panel */}
            {showBuyBox && (
              <div className="bg-gray-900/95 border border-gray-700/60 rounded-lg p-2.5 shadow-xl w-60 space-y-2">
                <label className="flex items-center justify-between text-[11px] text-white font-semibold">
                  <span>🎯 My buy-box filter</span>
                  <input type="checkbox" checked={buyBox.enabled} onChange={(e) => { const b = { ...buyBox, enabled: e.target.checked }; setBuyBox(b); saveBuyBox(b) }} className="accent-indigo-500" />
                </label>
                {([["minScore", "Min score"], ["minEquityPct", "Min equity %"], ["minProfit", "Min profit $"], ["maxPrice", "Max price $ (0=any)"]] as [keyof BuyBox, string][]).map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-400">{label}</span>
                    <input type="number" value={buyBox[k] as number} onChange={(e) => { const b = { ...buyBox, [k]: Number(e.target.value) || 0 }; setBuyBox(b); saveBuyBox(b) }}
                      className="w-20 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-white text-right focus:outline-none focus:border-indigo-500" />
                  </div>
                ))}
                <label className="flex items-center justify-between text-[10px] text-gray-400">
                  <span>Absentee owners only</span>
                  <input type="checkbox" checked={buyBox.absenteeOnly} onChange={(e) => { const b = { ...buyBox, absenteeOnly: e.target.checked }; setBuyBox(b); saveBuyBox(b) }} className="accent-indigo-500" />
                </label>
                <div className="text-[9px] text-gray-600">Non-matching deals fade to grey dots so your matches pop.</div>
              </div>
            )}
            {/* Heat metric selector */}
            {showHeat && (
              <div className="flex gap-1 bg-gray-900/90 border border-gray-700/50 rounded-lg p-1 shadow-lg">
                <span className="text-[10px] text-gray-500 self-center px-1">Heat by:</span>
                {(["profit", "equity", "score"] as HeatMetric[]).map((m) => (
                  <button key={m} onClick={() => setHeatMetric(m)} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${heatMetric === m ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"}`}>{HEAT_LABEL[m]}</button>
                ))}
              </div>
            )}
            {/* Save zone + saved zones panel */}
            {canSaveZone && (
              <button onClick={saveZone} className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow-lg">💾 Save this zone as a farm</button>
            )}
            {showZones && (
              <div className="bg-gray-900/95 border border-gray-700/60 rounded-lg p-2 shadow-xl w-56 max-h-48 overflow-y-auto">
                <div className="text-[10px] text-gray-500 mb-1 px-1">Saved farm zones</div>
                {savedZones.length === 0 ? (
                  <div className="text-[11px] text-gray-600 px-1 py-2">None yet. Draw a zone, then “Save this zone”.</div>
                ) : savedZones.map((z) => (
                  <div key={z.id} className="flex items-center justify-between gap-1.5 px-1 py-1 hover:bg-white/5 rounded">
                    <button onClick={() => loadSavedZone(z)} className="text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold truncate flex-1 text-left">{z.name}</button>
                    <button onClick={() => toggleZoneAlert(z)} title="Text me when new HOT deals land here" className={`text-[11px] shrink-0 ${alerts.zones[z.id] ? "text-amber-300" : "text-gray-600 hover:text-amber-300"}`}>{alerts.zones[z.id] ? "🔔" : "🔕"}</button>
                    <button onClick={() => deleteSavedZone(z.id)} className="text-[11px] text-gray-600 hover:text-red-400 shrink-0">✕</button>
                  </div>
                ))}
                {Object.keys(alerts.zones).length > 0 && (
                  <div className="text-[9.5px] text-gray-500 px-1 pt-1 mt-1 border-t border-gray-700/50">🔔 alerts text {alerts.phone || "—"} on new HOT deals</div>
                )}
              </div>
            )}

            {/* Logged houses panel (Driving for Dollars) */}
            {showDriveList && (
              <div className="bg-gray-900/95 border border-gray-700/60 rounded-lg p-2 shadow-xl w-60 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between mb-1 px-1">
                  <span className="text-[10px] text-gray-500">Logged houses ({driveLeads.length})</span>
                  <div className="flex gap-2">
                    <button onClick={exportDriveLeads} disabled={!driveLeads.length} className="text-[10px] text-indigo-300 hover:text-indigo-200 disabled:opacity-40">Export CSV</button>
                  </div>
                </div>
                {driveLeads.length === 0 ? (
                  <div className="text-[11px] text-gray-600 px-1 py-2">Tap “🚗 Drive”, then “Log this house” as you drive for dollars.</div>
                ) : driveLeads.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-1.5 px-1 py-1 hover:bg-white/5 rounded">
                    <button onClick={() => { mapRef.current?.flyTo([d.lat, d.lng], 17, { duration: 0.5 }) }} className="text-[11px] text-gray-200 hover:text-white truncate flex-1 text-left">{d.address || `${d.lat.toFixed(4)}, ${d.lng.toFixed(4)}`}{d.note ? ` · ${d.note}` : ""}</button>
                    <button onClick={() => deleteDriveLead(d.id)} className="text-[11px] text-gray-600 hover:text-red-400 shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mode hint (draw only — route has its own bar) */}
          {mode === "draw" && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/95 border border-indigo-500/40 rounded-lg px-3 py-1.5 text-[11px] text-indigo-200 shadow-lg">
              Click to drop points around your farm area; double-click to finish.
            </div>
          )}

          {/* Route bar */}
          {mode === "route" && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-gray-900/95 border border-indigo-500/40 rounded-xl px-3 py-2 shadow-xl">
              <span className="text-xs text-indigo-200 font-semibold">{route.length} stop{route.length === 1 ? "" : "s"}</span>
              <button onClick={openRoute} disabled={!route.length} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-semibold px-3 py-1 rounded-lg">Open in Google Maps</button>
              <button onClick={() => setRoute([])} disabled={!route.length} className="text-[11px] text-gray-400 hover:text-white disabled:opacity-40">Clear</button>
            </div>
          )}

          {/* Driving for Dollars — log button */}
          {driving && mode !== "route" && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-gray-900/95 border border-blue-500/40 rounded-xl px-3 py-2 shadow-xl">
              <span className="text-xs text-blue-200 font-semibold">🚗 Driving</span>
              <button onClick={logHouse} className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold px-3 py-1 rounded-lg">+ Log this house</button>
            </div>
          )}

          {/* Deal-alert banner */}
          {alertBanner && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 bg-amber-950/95 border border-amber-500/50 rounded-xl px-3 py-2 shadow-xl max-w-[80%]">
              <span className="text-[11px] text-amber-100 font-semibold">{alertBanner}</span>
              <button onClick={() => setAlertBanner(null)} className="text-[11px] text-amber-300 hover:text-amber-100 shrink-0">✕</button>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 right-3 z-[1000] bg-gray-900/90 border border-gray-700/50 rounded-lg px-2.5 py-2 text-[10px] text-gray-300 shadow-lg space-y-1">
            {(Object.keys(URGENCY_COLOR) as Urgency[]).map((u) => (
              <div key={u} className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: URGENCY_COLOR[u] }} />
                <span>{URGENCY_LABEL[u]}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: PREDICT_COLOR, border: "1.5px dashed #fff" }} />
              <span>🔮 Predicted pre-foreclosure (our forecast)</span>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-700/50 mt-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: "#a78bfa", background: "transparent" }} />
              <span>Absentee · pin size = score · bubbles cluster</span>
            </div>
            <div className="text-gray-500 pt-0.5">💡 Click a pin for the deal — or any spot to check its address</div>
          </div>

          <div ref={containerRef} className="w-full h-[460px] bg-slate-950" />
        </div>
      )}

      <style jsx global>{`
        .ap-pulse-pin { animation: apPulse 1.4s ease-in-out infinite; }
        @keyframes apPulse { 0%,100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.25; } }
        .leaflet-container { background: #0b1220; font-family: inherit; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #1f2937; color: #e5e7eb; }
        .leaflet-popup-content { margin: 10px 12px; }
        .ap-score-label { background: rgba(17,24,39,.92); color: #fff; border: 1px solid rgba(255,255,255,.25); border-radius: 6px; font-weight: 700; font-size: 11px; padding: 1px 5px; box-shadow: 0 1px 4px rgba(0,0,0,.5); }
        .ap-score-label::before { border-top-color: rgba(17,24,39,.92) !important; }
      `}</style>
    </div>
  )
}
