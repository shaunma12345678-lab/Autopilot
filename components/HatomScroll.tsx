"use client"

import React, { useRef, useMemo, useEffect, useState, useCallback } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Stars, Sparkles } from "@react-three/drei"
import * as THREE from "three"
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing"
import { BlendFunction } from "postprocessing"
import { gsap } from "gsap"

/* ─── WebGL Error Boundary — prevents tab crash on GPU OOM ── */
class WebGLErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { crashed: boolean; errorMsg: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { crashed: false, errorMsg: "" }
  }
  static getDerivedStateFromError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return { crashed: true, errorMsg: msg }
  }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0a0118", color: "#9d72ff",
          fontFamily: "monospace", fontSize: "0.8rem", padding: "2rem",
        }}>
          <p style={{ opacity: 0.5, marginBottom: "0.5rem" }}>Scene error — please screenshot and report:</p>
          <pre style={{ color: "#ff6b6b", whiteSpace: "pre-wrap", maxWidth: "80vw", textAlign: "left", opacity: 0.9 }}>
            {this.state.errorMsg || "Unknown error"}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

/* ─── Scene narrative ──────────────────────────────────────── */
const SCENES = [
  {
    label: "CHAPTER 01 — BEFORE",
    title: "You're running\non empty.",
    body: "14-hour days. Marketing that doesn't move the needle. Tools that don't talk to each other. Every week, a repeat of the last.",
  },
  {
    label: "CHAPTER 02 — THE SIGNAL",
    title: "Something different\nis coming.",
    body: "Not another dashboard. Not another tool to manage. A system that thinks, decides, and acts — while you sleep.",
  },
  {
    label: "CHAPTER 03 — ACTIVATION",
    title: "8 agents.\nOnline. Now.",
    body: "The instant you onboard, AutoPilot begins. Eight specialized AI agents come alive simultaneously and start working on your business.",
  },
  {
    label: "CHAPTER 04 — CONTENT",
    title: "Your voice.\nEverywhere. Always.",
    body: "47 on-brand posts per month. Every review answered in under 5 minutes. Present every day on every platform — without you touching it.",
  },
  {
    label: "CHAPTER 05 — GROWTH",
    title: "Your pipeline\nnever runs dry.",
    body: "50 personalized outreach sequences monthly. 4 SEO posts ranking for local keywords. New customers find you while you serve the ones you have.",
  },
  {
    label: "CHAPTER 06 — REVENUE",
    title: "Close more.\nSupport everyone.",
    body: "Scripts and proposals in 60 seconds. Every customer query answered instantly. No lead slips. No customer left behind.",
  },
  {
    label: "CHAPTER 07 — INTELLIGENCE",
    title: "Your business\nthinks for itself.",
    body: "Monthly P&L in plain English. Cash flow predictions. Three specific actions. Your brand voice powering every single agent, every day.",
  },
  {
    label: "CHAPTER 08 — AUTOPILOT",
    title: "This is what\nafter looks like.",
    body: "4.2 hours saved every single day. 3.8× more reviews in 90 days. $8,400 average monthly agency revenue. The transformation is complete.",
  },
]

/* ─── Agent colors ─────────────────────────────────────────── */
const AGENT_COLORS = [
  "#6366f1", "#10b981", "#8b5cf6", "#06b6d4",
  "#f59e0b", "#ec4899", "#f97316", "#14b8a6",
]

/* ─── Camera waypoints — starts high so mountains fill backdrop ─── */
const CAM_POS = [
  new THREE.Vector3(0,    15.5, 28.0),  // Ch1 — high vista, full mountain range
  new THREE.Vector3(2.2,  11.5, 22.5),  // Ch2 — drifting right, descending
  new THREE.Vector3(0,     8.0, 16.5),  // Ch3 — valley level, mountains fading
  new THREE.Vector3( 4.8,  5.5, 12.0),  // Ch4 — right angle, city + crystal
  new THREE.Vector3(-4.8,  5.5, 12.0),  // Ch5 — left angle
  new THREE.Vector3(0,     8.5, 16.0),  // Ch6 — backed up, panoramic
  new THREE.Vector3( 1.8,  5.0,  9.5),  // Ch7 — close crystal, city surrounds
  new THREE.Vector3(0,     7.0, 28.0),  // Ch8 — final wide panorama
]

/* ─── Per-chapter light colors ─────────────────────────────── */
const LIGHT_COLORS = [
  new THREE.Color("#1a0858"),
  new THREE.Color("#2d1275"),
  new THREE.Color("#ffffff"),
  new THREE.Color("#6366f1"),
  new THREE.Color("#8b5cf6"),
  new THREE.Color("#06b6d4"),
  new THREE.Color("#f59e0b"),
  new THREE.Color("#6366f1"),
]

/* ─── Satellite positions ──────────────────────────────────── */
const SAT_POS: [number, number, number][] = AGENT_COLORS.map((_, i) => {
  const angle = (i / AGENT_COLORS.length) * Math.PI * 2
  const r = 2.9
  return [Math.cos(angle) * r, Math.sin(angle * 2) * 0.5, Math.sin(angle) * r]
})

/* ─── Ring configs ─────────────────────────────────────────── */
const RINGS = [
  { rotation: [Math.PI / 2, 0, 0] as [number, number, number],            r: 1.65, color: "#6366f1", speed:  0.42 },
  { rotation: [Math.PI / 5, Math.PI / 3, 0] as [number, number, number],  r: 2.05, color: "#8b5cf6", speed: -0.30 },
  { rotation: [-Math.PI / 4, Math.PI / 4, 0] as [number, number, number], r: 2.40, color: "#06b6d4", speed:  0.54 },
]

const AGENT_REVEAL_P = AGENT_COLORS.map((_, i) => 0.22 + (i / 8) * 0.55)

/* ─── Module-level mutable bridges ────────────────────────── */
const _prog     = { current: 0 }
const _sceneI   = { current: 0 }
const _progLast = { current: 0 }
const _scrollVel = { current: 0 }
const _holdInt  = { current: 0 }  // 0=scrolling, 1=fully paused
/* pointer hold: ramps to 1.0 when mouse/touch held, back to 0 on release */
const _pointerHeld    = { current: false }
const _pointerHoldInt = { current: 0 }
const _mountainBlend  = { current: 1.0 }  // 1=mountains visible, 0=faded out

/* ═══════════════════════════════════════════════════════════
   CRYSTALLINE CONSCIOUSNESS SHADERS
   Signature innovation: flat-shaded IcosahedronGeometry that
   scatters → assembles → crystallizes → network → blazes
═══════════════════════════════════════════════════════════ */

const CRYSTAL_VERT = /* glsl */`
  attribute float aRand;
  attribute vec3  aScatterDir;
  uniform float   uTime;
  uniform float   uProgress;
  uniform float   uHold;

  varying vec3  vNormal;
  varying vec3  vWorldPosition;
  varying float vRand;
  varying float vFacetId;

  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vRand     = aRand;
    vFacetId  = floor(dot(normalize(position), vec3(0.577, 0.577, 0.577)) * 4.0) / 4.0;

    /* ── Stage weights ── */
    float scatterFac = 1.0 - smoothstep(0.02, 0.28, uProgress);
    float crystalFac = smoothstep(0.16, 0.42, uProgress);
    float blazeFac   = smoothstep(0.84, 1.00, uProgress);

    /* ── Hold: facets crack open — spread outward 14% on full hold ── */
    float crackOpen = uHold * 0.14 * aRand;

    vec3 pos = position;

    /* SCATTER */
    pos += aScatterDir * aRand * 8.0 * scatterFac;

    /* SHARP FACET DISPLACEMENT — angular planes, not smooth */
    float facetWave = sin(vFacetId * 12.56 + uTime * 0.42) * 0.5 + 0.5;
    pos += normal * facetWave * 0.28 * crystalFac;

    /* BLAZE */
    pos += normalize(position) * aRand * 5.0 * blazeFac;

    /* CRACK OPEN on hold */
    pos += normalize(position) * crackOpen;

    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position    = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const CRYSTAL_FRAG = /* glsl */`
  precision highp float;
  varying vec3  vNormal;
  varying vec3  vWorldPosition;
  varying float vRand;
  varying float vFacetId;
  uniform float uTime;
  uniform vec3  uCamPos;
  uniform float uOpacity;
  uniform float uProgress;
  uniform float uHold;
  uniform vec3  uHoldColor;   /* chapter accent color injected on hold */

  void main() {
    vec3  viewDir = normalize(uCamPos - vWorldPosition);
    vec3  N       = normalize(vNormal);
    float NdotV   = max(0.0, dot(N, viewDir));

    /* ── Obsidian mirror base — almost pure black face-on ── */
    float blackFace = pow(NdotV, 1.8);
    vec3  mirrorBase = vec3(0.012, 0.008, 0.025) * (1.0 - blackFace * 0.85);

    /* ── Physical metal-like Fresnel edge glow ── */
    float fresnel = pow(1.0 - NdotV, 4.2);

    /* ── Per-chapter edge color ── */
    vec3 c0 = vec3(0.20, 0.04, 0.85);   /* Ch1 — indigo */
    vec3 c1 = vec3(0.04, 0.55, 1.00);   /* Ch2-3 — electric blue */
    vec3 c2 = vec3(0.00, 0.95, 0.75);   /* Ch4-5 — cyan-teal */
    vec3 c3 = vec3(0.95, 0.55, 0.05);   /* Ch6-7 — amber */
    vec3 c4 = vec3(0.75, 0.10, 1.00);   /* Ch8 — violet */
    vec3 edgeCol;
    if      (uProgress < 0.25) edgeCol = mix(c0, c1, smoothstep(0.00, 0.25, uProgress));
    else if (uProgress < 0.50) edgeCol = mix(c1, c2, smoothstep(0.25, 0.50, uProgress));
    else if (uProgress < 0.75) edgeCol = mix(c2, c3, smoothstep(0.50, 0.75, uProgress));
    else                       edgeCol = mix(c3, c4, smoothstep(0.75, 1.00, uProgress));

    /* ── Iridescent thin-film at edges — rainbow shimmer ── */
    float iriPhase = NdotV * 6.0 + uTime * 0.16;
    vec3  iriCol   = 0.5 + 0.5 * cos(6.28318*(vec3(0.0,0.333,0.666)+iriPhase*0.6));
    float iriMix   = pow(1.0 - NdotV, 3.0) * 0.7;
    edgeCol        = mix(edgeCol, iriCol, iriMix * smoothstep(0.12, 0.45, uProgress));

    /* ── Facet energy cracks — bright lines between facet groups ── */
    float crackSharp = abs(sin(vFacetId * 31.4 + uTime * 0.8));
    float crackLine  = pow(crackSharp, 18.0);  /* very sharp bright lines at facet edges */
    vec3  crackCol   = edgeCol * 2.8;

    /* ── Hard specular glints — like light catching a diamond face ── */
    vec3  l1  = normalize(vec3(2.0, 3.5, 4.0));
    float sp1 = pow(max(dot(N, normalize(l1+viewDir)),0.0), 420.0);
    vec3  l2  = normalize(vec3(-3.0, 2.0, 1.5));
    float sp2 = pow(max(dot(N, normalize(l2+viewDir)),0.0), 320.0);
    vec3  l3  = normalize(vec3(0.0, -2.0, 3.5));
    float sp3 = pow(max(dot(N, normalize(l3+viewDir)),0.0), 280.0);

    /* ── Caustic interior light leaking through facets ── */
    float ca = sin(vWorldPosition.x*5.2+uTime*0.62)*sin(vWorldPosition.y*4.8-uTime*0.44)*sin(vWorldPosition.z*5.0+uTime*0.52);
    float caustic = pow(max(0.0,ca), 2.4) * 1.2 * smoothstep(0.20, 0.50, uProgress);

    /* ── HOLD: color universe shift + crack blaze ── */
    float holdPulse = 0.5 + 0.5*sin(uTime*6.0 + vRand*6.28);
    /* Edge blazes with the hold color (chapter accent) */
    edgeCol = mix(edgeCol, uHoldColor, uHold * 0.72);
    /* Cracks ignite */
    crackCol += uHoldColor * uHold * holdPulse * 4.0;
    /* Caustic beams fire */
    float holdCaustic = caustic + pow(max(0.0,ca),1.8)*uHold*2.5;

    /* ── Compose ── */
    vec3 col = mirrorBase;
    col += edgeCol   * fresnel * 2.4;
    col += crackCol  * crackLine * smoothstep(0.14, 0.40, uProgress);
    col += edgeCol   * holdCaustic;
    col += vec3(1.0) * (sp1*1.8 + sp2*1.2 + sp3*0.9);
    col += uHoldColor * uHold * fresnel * 1.6;

    /* ── Alpha — opaque facets, blazing edges ── */
    float faceAlpha  = 0.82 * smoothstep(0.12, 0.38, uProgress);
    float edgeAlpha  = fresnel * 0.18;
    float crackAlpha = crackLine * 0.25 * smoothstep(0.14,0.40,uProgress);
    float specAlpha  = (sp1 + sp2*0.6 + sp3*0.4) * 0.5;
    float alpha      = (faceAlpha + edgeAlpha + crackAlpha + specAlpha) * uOpacity;
    alpha            = clamp(alpha + uHold*0.08, 0.0, 1.0);

    gl_FragColor = vec4(col, alpha);
  }
`

/* ══════════════════════════════════════════════════════════
   INNER PLASMA CORE — visible glowing centre through the shell
══════════════════════════════════════════════════════════ */
const CORE_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uHold;

  float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2d(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash2(i),hash2(i+vec2(1,0)),u.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u.x),u.y);
  }
  float fbm2(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*n2d(p);p=p*2.1+vec2(1.7,9.2);a*=0.5;}return v;}

  void main() {
    vNormal   = normalize(normalMatrix * normal);
    vUv       = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;

    /* Plasma surface turbulence */
    float d1 = (fbm2(vUv * 5.0 + vec2(uTime * 0.24, uTime * 0.18)) - 0.5) * 0.30;
    float d2 = (fbm2(vUv * 9.5 - vec2(uTime * 0.34, uTime * 0.26)) - 0.5) * 0.14;
    float d3 = (fbm2(vUv * 18.0 + vec2(uTime * 0.55)) - 0.5) * 0.06;
    /* Hold amplifies plasma turbulence */
    float disp = (d1 + d2 + d3) * (1.0 + uHold * 0.55);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * disp, 1.0);
  }
`

const CORE_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uCamPos;
  uniform float uOpacity;
  uniform float uProgress;
  uniform float uHold;

  float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2d(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash2(i),hash2(i+vec2(1,0)),u.x),mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u.x),u.y);
  }
  float fbm2(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*n2d(p);p=p*2.1+vec2(1.7,9.2);a*=0.5;}return v;}

  void main() {
    vec3  viewDir = normalize(uCamPos - vWorldPos);
    vec3  N       = normalize(vNormal);
    float NdotV   = max(0.0, dot(N, viewDir));
    float fresnel = pow(1.0 - NdotV, 3.5);

    /* Multi-octave plasma */
    float p1 = fbm2(vUv * 6.0 + vec2(uTime * 0.22, uTime * 0.17));
    float p2 = fbm2(vUv * 11.0 - vec2(uTime * 0.30, uTime * 0.25));
    float p3 = fbm2(vUv * 22.0 + vec2(uTime * 0.48));
    float plasma = p1 * 0.55 + p2 * 0.30 + p3 * 0.15;

    /* Stage-tracked core color: violet → cyan → electric pink on hold */
    vec3 cv0 = vec3(0.50, 0.05, 0.95);
    vec3 cv1 = vec3(0.06, 0.65, 1.00);
    vec3 cv2 = vec3(0.95, 0.35, 1.00);
    float phase = sin(uTime * 0.6 + plasma * 3.14) * 0.5 + 0.5;
    vec3  core  = mix(mix(cv0, cv1, plasma), cv2, phase * 0.4 + uHold * 0.5);

    /* Bright inner volume — forward-facing faces glow brighter */
    core += vec3(0.65, 0.55, 1.0) * (1.0 - NdotV * NdotV) * 0.9;
    /* Rim light from edge */
    core += vec3(0.40, 0.85, 1.0) * fresnel * 1.8;
    /* Hotspot at centre */
    core += vec3(1.0, 0.95, 1.0) * pow(1.0 - NdotV, 9.0) * 1.5;

    /* Specular from key light */
    vec3  lDir  = normalize(vec3(2.0, 3.5, 4.0));
    vec3  hDir  = normalize(lDir + viewDir);
    float spec  = pow(max(dot(N, hDir), 0.0), 220.0);
    core       += vec3(1.0) * spec * 1.2;

    /* Hold activation — core blazes, colour erupts */
    float holdPulse = 0.5 + 0.5 * sin(uTime * 6.5);
    core += vec3(0.85, 0.40, 1.0) * uHold * holdPulse * 2.2;
    core += vec3(0.30, 0.80, 1.0) * uHold * (1.0 - NdotV) * 1.4;
    core *= 1.0 + uHold * 0.7;

    /* Heartbeat pulse */
    float beat = 0.88 + sin(uTime * 2.4) * 0.12;
    core *= beat;

    /* Core is mostly opaque (visible from outside through glass shell) */
    float alpha = (0.78 + fresnel * 0.22 + uHold * 0.18) * uOpacity;
    gl_FragColor = vec4(core, alpha);
  }
`

/* ══════════════════════════════════════════════════════════
   MID STRUCTURAL LAYER — geometric interior, semi-transparent
   Uses same vertex shader as outer (CRYSTAL_VERT) since geometry
   has identical aRand / aScatterDir attributes.
══════════════════════════════════════════════════════════ */
const MID_FRAG = /* glsl */`
  precision highp float;
  varying vec3  vNormal;
  varying vec3  vWorldPosition;
  varying float vRand;
  uniform float uTime;
  uniform vec3  uCamPos;
  uniform float uOpacity;
  uniform float uProgress;
  uniform float uHold;

  void main() {
    vec3  viewDir = normalize(uCamPos - vWorldPosition);
    vec3  N       = normalize(vNormal);
    float NdotV   = max(0.0, dot(N, viewDir));
    float fresnel = pow(1.0 - NdotV, 4.0);

    /* Mid-layer palette: shows the internal crystal structure colour */
    vec3 m0 = vec3(0.18, 0.04, 0.60);
    vec3 m1 = vec3(0.04, 0.55, 1.00);
    vec3 base = mix(m0, m1, uProgress);

    /* Thin-film iridescence — slightly different phase than outer shell
       creates visible colour depth difference between layers */
    float iriPhase = NdotV * 7.0 + uTime * 0.20;
    vec3  iri = 0.5 + 0.5 * cos(6.28318 * (vec3(0.166, 0.500, 0.833) + iriPhase * 0.45));
    base = mix(base, iri, 0.42 * smoothstep(0.14, 0.46, uProgress));

    /* Energy channel lattice — geometric flow paths */
    float ex = sin(vWorldPosition.x * 5.2 + uTime * 0.82);
    float ey = sin(vWorldPosition.y * 4.8 + uTime * 1.08);
    float ez = sin(vWorldPosition.z * 5.0 + uTime * 0.74);
    float energy = pow(max(0.0, ex * ey * ez), 2.2);
    vec3  eCol   = mix(vec3(0.65, 0.18, 1.0), vec3(0.18, 0.88, 1.0), uProgress);
    base += eCol * energy * 1.4;

    /* Specular on inner surfaces */
    vec3  lDir = normalize(vec3(2.0, 3.5, 4.0));
    vec3  hDir = normalize(lDir + viewDir);
    float spec = pow(max(dot(N, hDir), 0.0), 140.0);
    base += vec3(0.9, 0.95, 1.0) * spec * 0.9;

    /* Hold: energy channels blaze, mid-layer becomes more visible */
    base += eCol * energy * uHold * 3.0;
    base += vec3(0.35, 0.75, 1.0) * uHold * (1.0 - NdotV) * 0.8;
    base += iri * uHold * fresnel * 0.7;

    /* Rim */
    base += vec3(0.55, 0.22, 1.0) * fresnel * 1.0;

    /* Semi-transparent: enough opacity to show structure, enough transparency
       to see the core through it.
       Face-on: ~22% (shows interior structure without blocking core view)
       Edge-on: ~80% (bright facet edges) */
    float reveal = smoothstep(0.06, 0.32, uProgress);
    float alpha  = (0.22 + fresnel * 0.58 + energy * 0.12) * uOpacity * reveal;
    alpha       += uHold * 0.10;
    alpha        = clamp(alpha, 0.0, 0.92);

    gl_FragColor = vec4(base, alpha);
  }
`

/* ── Wireframe network overlay — data pulse streams ── */
const WIRE_VERT = /* glsl */`
  uniform float uTime;
  uniform float uProgress;
  varying float vEdgePulse;
  varying float vAlong;

  void main() {
    float phase = dot(position, vec3(0.23, 0.18, 0.29));
    vEdgePulse  = 0.5 + 0.5 * sin(phase * 14.0 - uTime * 3.2);
    vAlong      = phase;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const WIRE_FRAG = /* glsl */`
  precision mediump float;
  uniform float uTime;
  uniform float uProgress;
  uniform float uOpacity;
  varying float vEdgePulse;
  varying float vAlong;

  void main() {
    float netReveal = smoothstep(0.44, 0.62, uProgress) * (1.0 - smoothstep(0.88, 1.00, uProgress));
    vec3  col       = mix(vec3(0.38, 0.12, 1.00), vec3(0.08, 0.88, 1.00), vEdgePulse);
    float a         = (0.12 + vEdgePulse * 0.68) * netReveal * uOpacity;
    gl_FragColor    = vec4(col, a);
  }
`

/* ── Purple city aurora — overhead atmospheric glow ── */
const AURORA_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const AURORA_FRAG = /* glsl */`
  precision mediump float;
  varying vec2  vUv;
  uniform float uTime;
  uniform float uProgress;

  void main() {
    vec2  center = vUv - 0.5;
    float dist   = length(center * vec2(1.0, 0.6));
    float glow   = pow(1.0 - smoothstep(0.0, 0.5, dist), 2.2);

    /* Animated shimmer bands */
    float band1  = 0.55 + 0.45 * sin(center.x * 12.0 - uTime * 0.9 + center.y * 6.0);
    float band2  = 0.5  + 0.5  * sin(center.x * 7.0  + uTime * 0.6 - center.y * 4.0);
    float shimmer = band1 * band2;

    /* Color: deep violet → electric violet → cyan at higher progress */
    vec3  col0 = vec3(0.30, 0.05, 0.75);
    vec3  col1 = vec3(0.12, 0.48, 1.00);
    vec3  col  = mix(col0, col1, uProgress * 0.55);

    float alpha = glow * shimmer * 0.22 * smoothstep(0.0, 0.06, uProgress) * (1.0 - dist * 0.8);
    gl_FragColor = vec4(col, alpha);
  }
`

/* ═══════════════════════════════════════════════════════════
   SHOCKWAVE RING — emits outward from crystal on hold
═══════════════════════════════════════════════════════════ */

const SHOCK_VERT = /* glsl */`
  varying vec2 vUv;
  uniform float uScale;
  void main(){
    vUv = uv;
    vec3 pos = position * uScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`
const SHOCK_FRAG = /* glsl */`
  precision mediump float;
  varying vec2  vUv;
  uniform float uHold;
  uniform float uWave;   /* 0→1 wave front expansion */
  uniform vec3  uColor;

  void main(){
    vec2  uv   = vUv - 0.5;
    float dist = length(uv) * 2.0;   /* 0 at center, 1 at ring edge */
    /* Ring: bright at the wave front, fades behind it */
    float ring = smoothstep(uWave - 0.08, uWave, dist)
               * smoothstep(uWave + 0.06, uWave, dist);
    float alpha = ring * uHold * 0.85;
    gl_FragColor = vec4(uColor + 0.4, alpha);
  }
`

/* ─── God ray shaft shader ─────────────────────────────── */
const GODRAY_FRAG = /* glsl */`
  precision mediump float;
  varying vec2  vUv;
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColor;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }

  void main(){
    /* Radial god rays from center-top */
    vec2  center = vec2(0.5, 0.0);
    vec2  dir    = vUv - center;
    float angle  = atan(dir.x, dir.y);
    float dist   = length(dir);

    /* Ray shafts via angular noise */
    float rays = noise(vec2(angle * 4.0 + uTime * 0.12, dist * 3.0));
    rays = pow(rays, 2.5);

    /* Fade: bright near center, invisible at edges */
    float radFade = smoothstep(0.9, 0.0, dist);
    float topFade = smoothstep(0.0, 0.35, 1.0 - vUv.y);  /* only upward shafts */

    float alpha = rays * radFade * topFade * uIntensity * 0.38;
    gl_FragColor = vec4(uColor * 1.6, alpha);
  }
`

/* ═══════════════════════════════════════════════════════════
   MOUNTAIN TERRAIN SHADERS
   Ridged FBM terrain — dark silhouette peaks with atmospheric
   rim glow that transitions to city as progress increases.
   Geometry: custom BufferGeometry (x/z=terrain, y displaced in shader)
   Valley corridor carved at |x|<85 and z>-120 for city/crystal zone.
═══════════════════════════════════════════════════════════ */

const MOUNTAIN_VERT = /* glsl */`
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying float vHeight;
  varying float vSlope;
  uniform float uTime;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float ridge(float n){ return 1.0-abs(n*2.0-1.0); }
  float ridgedFBM(vec2 p){
    float v=0.0,a=0.55,prev=1.0;
    for(int i=0;i<4;i++){float n=ridge(noise(p));v+=a*n*prev;prev=n;p=p*2.18+vec2(1.7,9.2);a*=0.5;}
    return v;
  }
  float fbm(vec2 p){
    float v=0.0,a=0.5;
    for(int i=0;i<3;i++){v+=a*noise(p);p=p*2.1+vec2(3.2,7.4);a*=0.5;}
    return v;
  }
  float heightAt(vec2 xz){
    /* Normalize terrain coords [-190..190, -220..-20] → [0..1] */
    vec2 p = (xz + vec2(190.0, 220.0)) / vec2(380.0, 200.0);
    float h = ridgedFBM(p * 3.8) * 48.0
            + fbm(p * 8.5 + vec2(2.3, 1.1)) * 12.0
            + fbm(p * 22.0 + vec2(5.1)) * 3.0;
    /* Valley: flat near city (|x|<85 and z>-120), mountains elsewhere */
    float valleyX = smoothstep(0.0, 85.0, abs(xz.x));
    float valleyZ = 1.0 - smoothstep(-120.0, -20.0, xz.z);
    h *= mix(0.03, 1.0, max(valleyX, valleyZ));
    return max(0.0, h);
  }

  void main(){
    float h = heightAt(position.xz);
    vHeight  = h;
    vec3 disp = position + vec3(0.0, h, 0.0);
    vWorldPos = (modelMatrix * vec4(disp, 1.0)).xyz;

    /* Finite-difference normals for accurate lighting */
    float eps = 3.5;
    float hL = heightAt(position.xz + vec2(-eps, 0.0));
    float hR = heightAt(position.xz + vec2( eps, 0.0));
    float hD = heightAt(position.xz + vec2(0.0,-eps));
    float hU = heightAt(position.xz + vec2(0.0, eps));
    vec3  n   = normalize(vec3(hL-hR, 2.0*eps, hD-hU));
    vNormal   = normalize(normalMatrix * n);
    vSlope    = 1.0 - n.y;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(disp, 1.0);
  }
`

const MOUNTAIN_FRAG = /* glsl */`
  precision highp float;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying float vHeight;
  varying float vSlope;
  uniform float uTime;
  uniform float uFade;
  uniform vec3  uAtmColor;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

  void main(){
    vec3 N = normalize(vNormal);

    /* Base rock: near-black deep purple stone */
    vec3 rockBase = mix(vec3(0.02,0.01,0.06), vec3(0.07,0.04,0.16), smoothstep(0.0,22.0,vHeight));
    vec3 rockHigh = mix(rockBase, vec3(0.12,0.07,0.24), smoothstep(22.0,44.0,vHeight));
    vec3 col = rockHigh;

    /* Snow — high peaks with low slope */
    float snowFac = smoothstep(26.0, 36.0, vHeight) * smoothstep(0.52, 0.22, vSlope);
    col = mix(col, vec3(0.80, 0.86, 1.00), snowFac * 0.72);

    /* Atmospheric rim glow — edge where terrain meets sky */
    float rimFac = pow(max(0.0, 1.0 - abs(dot(N, vec3(0.0,1.0,0.0)))), 3.0);
    col += uAtmColor * rimFac * 1.8;

    /* Snow shimmer — occasional star-like specular on peaks */
    float shimmerSeed = hash(floor(vWorldPos.xz * 0.1));
    float shimmer = step(0.96, shimmerSeed) * snowFac * (0.5 + 0.5*sin(uTime*2.5+shimmerSeed*12.0));
    col += vec3(0.75, 0.88, 1.0) * shimmer * 0.9;

    /* Depth atmospheric haze */
    float dist    = length(vWorldPos.xz);
    float hazeFac = smoothstep(60.0, 210.0, dist);
    col = mix(col, uAtmColor * 0.28, hazeFac * 0.7);

    /* Subtle directional light from above-right */
    float diffuse = max(0.0, dot(N, normalize(vec3(1.0, 2.5, 1.5))));
    col += uAtmColor * 0.18 * diffuse;

    float alpha = uFade * (1.0 - hazeFac * 0.45);
    gl_FragColor = vec4(col, alpha);
  }
`

/* Atmospheric mist — drifting fog between mountain peaks */
const MIST_FRAG = /* glsl */`
  precision mediump float;
  varying vec2  vUv;
  uniform float uTime;
  uniform float uFade;
  uniform vec3  uColor;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<3;i++){v+=a*noise(p);p=p*2.1+vec2(1.7,9.2);a*=0.5;}return v;}

  void main(){
    float n1  = fbm(vUv * 2.6 + vec2(uTime*0.05, uTime*0.03));
    float n2  = fbm(vUv * 5.2 - vec2(uTime*0.04, 0.0));
    float mist = n1 * 0.62 + n2 * 0.38;

    float ex = smoothstep(0.0,0.14,vUv.x)*smoothstep(1.0,0.86,vUv.x);
    float ey = smoothstep(0.0,0.10,vUv.y)*smoothstep(1.0,0.90,vUv.y);
    float depth = smoothstep(0.0, 0.4, vUv.y);  // denser deeper in the range

    float alpha = mist * ex * ey * depth * uFade * 0.28;
    gl_FragColor = vec4(uColor, alpha);
  }
`

/* ─── Remaining shaders (unchanged) ───────────────────────── */

const PART_VERT = /* glsl */`
  attribute vec3  aChaos;
  attribute vec3  aOrbit;
  attribute float aScale;
  uniform float   uProgress;
  uniform float   uTime;

  void main() {
    float t   = smoothstep(0.0, 1.0, uProgress);
    vec3  pos = mix(aChaos, aOrbit, t);
    pos.y    += sin(uTime*0.9 + pos.x*2.1) * 0.04 * (1.0 - t*0.8);
    vec4 mv   = modelViewMatrix * vec4(pos, 1.0);
    gl_Position  = projectionMatrix * mv;
    gl_PointSize = aScale * (260.0 / -mv.z);
  }
`

const PART_FRAG = /* glsl */`
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = (1.0 - smoothstep(0.25, 0.5, d)) * uOpacity;
    gl_FragColor = vec4(0.58, 0.42, 1.0, a);
  }
`

const CITY_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const CITY_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFade;

  void main() {
    /* Solid purple floor base */
    vec3 baseCol = vec3(0.07, 0.00, 0.22);

    /* Grid lines at building spacing */
    vec2  uvGrid = vUv * 32.0;
    vec2  g      = fract(uvGrid);
    float d      = min(min(g.x, 1.0-g.x), min(g.y, 1.0-g.y));
    float line   = 1.0 - smoothstep(0.0, 0.055, d);

    /* Animated pulse */
    float p1 = 0.55 + 0.45 * sin(uTime * 0.9 + vUv.x * 14.0 - vUv.y * 9.0);
    float p2 = 0.50 + 0.50 * sin(uTime * 0.40 + vUv.y * 6.0 + vUv.x * 4.0);

    /* Neon purple grid lines — brighter, sharper */
    vec3 lineCol = mix(vec3(0.62, 0.18, 1.00), vec3(0.88, 0.48, 1.00), p1);

    /* Edge fade */
    float edgeFade = smoothstep(0.0, 0.12, min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y)));

    vec3 col   = baseCol + lineCol * line * 1.6 * p1;
    col       += vec3(0.18, 0.03, 0.48) * p2 * 0.30;

    /* Mostly opaque — this IS the purple floor */
    float alpha = (0.88 + line * 0.12) * edgeFade * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`

/* ── Purple floor glow — additive halo over the base plane ── */
const GLOW_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GLOW_FRAG = /* glsl */`
  precision mediump float;
  varying vec2  vUv;
  uniform float uTime;
  uniform float uFade;

  void main() {
    vec2  center = vUv - 0.5;
    float dist   = length(center);

    /* Radial purple glow — brightest at center, fades to edges */
    float glow   = pow(1.0 - smoothstep(0.0, 0.5, dist), 1.5);

    /* Ripple rings radiating outward */
    float ripple = 0.5 + 0.5 * sin(dist * 22.0 - uTime * 1.5);

    /* Fine grid overlay matching building footprints */
    vec2  uvGrid   = vUv * 34.0;
    vec2  gf       = fract(uvGrid);
    float dg       = min(min(gf.x, 1.0-gf.x), min(gf.y, 1.0-gf.y));
    float gridLine = 1.0 - smoothstep(0.0, 0.07, dg);

    /* Purple neon color */
    vec3 col = mix(vec3(0.42, 0.06, 1.00), vec3(0.72, 0.28, 1.00), ripple * 0.35 + gridLine * 0.45);

    float alpha = (glow * 0.32 + gridLine * glow * 0.50 + ripple * glow * 0.10) * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`

const HELIX_VERT = /* glsl */`
  attribute vec3  aColor;
  attribute float aPhase;
  attribute float aHelixId;
  uniform float   uTime;
  uniform float   uProgress;
  varying vec3    vColor;
  varying float   vAlpha;

  void main() {
    vColor = aColor;
    float travel = mod(aPhase - uTime * 1.3, 6.2832);
    float pulse  = 1.0 - smoothstep(0.0, 1.4, abs(travel - 3.14159));
    float threshold = aHelixId * 0.055;
    float reveal    = smoothstep(threshold, threshold + 0.10, uProgress);
    vAlpha = (0.12 + pulse * 0.88) * reveal;
    float dir  = mod(aHelixId, 2.0) < 0.5 ? 1.0 : -1.0;
    float rotY = uTime * 0.20 * dir + aHelixId * 2.0944;
    float cosR = cos(rotY), sinR = sin(rotY);
    vec3  pos  = position;
    float nx   = pos.x * cosR - pos.z * sinR;
    float nz   = pos.x * sinR + pos.z * cosR;
    pos.x = nx; pos.z = nz;
    vec4  mvPos  = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (1.6 + pulse * 4.5) * (240.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`

const HELIX_FRAG = /* glsl */`
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor + 0.35 * vAlpha, a * vAlpha);
  }
`

const BG_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`

const BG_FRAG = /* glsl */`
  precision highp float;
  varying vec2  vUv;
  uniform float uTime;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform float uMountainBlend;
  uniform vec3  uAtmColor;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.0+vec2(1.7,9.2);a*=0.5;}return v;}

  void main() {
    float t   = uTime * 0.04;
    float n1  = fbm(vUv * 2.5 + vec2(t, t*0.7));
    float n2  = fbm(vUv * 4.5 - vec2(t*0.6, t));
    vec3  col = mix(uColorA, uColorA + uColorB * 0.65, n1 * 0.5 + n2 * 0.25);

    /* ── Stars — visible in upper hemisphere during mountain phase ── */
    float starHeight = smoothstep(0.44, 0.62, vUv.y);
    vec2  starGrid   = vUv * 150.0;
    float starSeed   = hash(floor(starGrid));
    float twinkle    = 0.5 + 0.5 * sin(uTime * (2.0 + starSeed * 5.0) + starSeed * 6.283);
    float starMask   = step(0.964, starSeed) * uMountainBlend * starHeight * twinkle;
    col += vec3(0.80, 0.88, 1.00) * starMask * 0.95;

    /* ── Shooting star — rare bright streak ── */
    float ssSeed = hash(floor(vUv * 14.0 + vec2(uTime * 0.04)));
    float ss = step(0.997, ssSeed) * uMountainBlend * starHeight;
    col += vec3(0.90, 0.95, 1.0) * ss * 1.8;

    /* ── Aurora curtains — animated during mountain phase ── */
    float aur1 = sin(vUv.x * 8.5 + uTime * 0.38) * sin(vUv.y * 4.8 + uTime * 0.22);
    float aur2 = sin(vUv.x * 5.8 - uTime * 0.30) * cos(vUv.y * 3.9 + uTime * 0.19);
    vec3  aurHue = mix(vec3(0.14,0.03,0.70), vec3(0.04,0.48,0.88), vUv.y);
    col += aurHue * max(0.0, aur1) * uMountainBlend * 0.11;
    col += aurHue * max(0.0, aur2) * uMountainBlend * 0.07;

    /* ── Horizon atmospheric glow ── */
    float horizFac = pow(max(0.0, 1.0 - abs(vUv.y - 0.46) * 4.2), 2.5);
    col += uAtmColor * horizFac * 0.22;

    /* ── Radial center brightness ── */
    float rad = 1.0 - length(vUv - 0.5) * 1.55;
    col += uColorB * max(0.0, rad * rad) * 0.22;

    gl_FragColor = vec4(col, 1.0);
  }
`

/* ═══════════════════════════════════════════════════════════
   HELIX STREAMS
═══════════════════════════════════════════════════════════ */

const HELIX_COUNT = 3
const HELIX_PTS   = 300
const HELIX_TOTAL = HELIX_COUNT * HELIX_PTS
const HELIX_COLORS = [
  new THREE.Color(AGENT_COLORS[0]),
  new THREE.Color(AGENT_COLORS[2]),
  new THREE.Color(AGENT_COLORS[3]),
]

function HelixStreams() {
  const { geo, mat } = useMemo(() => {
    const positions = new Float32Array(HELIX_TOTAL * 3)
    const colors    = new Float32Array(HELIX_TOTAL * 3)
    const phases    = new Float32Array(HELIX_TOTAL)
    const ids       = new Float32Array(HELIX_TOTAL)

    for (let h = 0; h < HELIX_COUNT; h++) {
      const col = HELIX_COLORS[h]
      for (let i = 0; i < HELIX_PTS; i++) {
        const idx    = h * HELIX_PTS + i
        const t      = i / HELIX_PTS
        const angle  = t * Math.PI * 8
        const radius = 1.70 + Math.sin(t * Math.PI) * 0.20
        positions[idx*3  ] = Math.cos(angle) * radius
        positions[idx*3+1] = (t - 0.5) * 4.0
        positions[idx*3+2] = Math.sin(angle) * radius
        const bright = 0.65 + 0.35 * Math.sin(t * Math.PI)
        colors[idx*3  ] = col.r * bright
        colors[idx*3+1] = col.g * bright
        colors[idx*3+2] = col.b * bright
        phases[idx] = t * Math.PI * 2
        ids[idx]    = h
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('aColor',   new THREE.Float32BufferAttribute(colors,    3))
    g.setAttribute('aPhase',   new THREE.Float32BufferAttribute(phases,    1))
    g.setAttribute('aHelixId', new THREE.Float32BufferAttribute(ids,       1))
    const m = new THREE.ShaderMaterial({
      vertexShader:   HELIX_VERT,
      fragmentShader: HELIX_FRAG,
      uniforms: { uTime: { value: 0 }, uProgress: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    return { geo: g, mat: m }
  }, [])

  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value     = clock.getElapsedTime()
    mat.uniforms.uProgress.value = _prog.current
  })
  return <points geometry={geo} material={mat} />
}

/* ═══════════════════════════════════════════════════════════
   SCENE BACKGROUND — vivid purple atmosphere
═══════════════════════════════════════════════════════════ */

/* Per-chapter sky palettes — each chapter has a distinct dramatic color identity */
const BG_PALETTES: Array<[THREE.Color, THREE.Color]> = [
  [new THREE.Color(0x010008), new THREE.Color(0x0d0440)],  // Ch1 BEFORE — near void, hint of indigo
  [new THREE.Color(0x020012), new THREE.Color(0x1e0c80)],  // Ch2 SIGNAL — deep indigo surge
  [new THREE.Color(0x050010), new THREE.Color(0x5a189a)],  // Ch3 ACTIVATION — vivid violet explosion
  [new THREE.Color(0x020012), new THREE.Color(0x1a2090)],  // Ch4 CONTENT — violet-blue
  [new THREE.Color(0x010215), new THREE.Color(0x0a50b8)],  // Ch5 GROWTH — electric cyan-blue
  [new THREE.Color(0x020015), new THREE.Color(0x0836a0)],  // Ch6 REVENUE — deep sapphire
  [new THREE.Color(0x080005), new THREE.Color(0x6a1a80)],  // Ch7 INTELLIGENCE — warm purple-magenta
  [new THREE.Color(0x010110), new THREE.Color(0x2d1075)],  // Ch8 AUTOPILOT — final deep violet
]

function SceneBackground() {
  const matRef = useRef<THREE.ShaderMaterial | null>(null)
  const colA   = useRef(new THREE.Color())
  const colB   = useRef(new THREE.Color())
  const atmRef = useRef(new THREE.Color())

  const bgMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   BG_VERT,
    fragmentShader: BG_FRAG,
    uniforms: {
      uTime:          { value: 0 },
      uColorA:        { value: new THREE.Color(0x010008) },
      uColorB:        { value: new THREE.Color(0x0d0440) },
      uMountainBlend: { value: 1.0 },
      uAtmColor:      { value: new THREE.Color(0x0d0440) },
    },
    depthWrite: false, depthTest: false, side: THREE.BackSide,
  }), [])

  useEffect(() => { matRef.current = bgMat; return () => bgMat.dispose() }, [bgMat])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const si   = _sceneI.current
    const frac = THREE.MathUtils.clamp(_prog.current * SCENES.length - si, 0, 1)
    const [a0, b0] = BG_PALETTES[si]
    const [a1, b1] = BG_PALETTES[Math.min(si + 1, BG_PALETTES.length - 1)]
    colA.current.lerpColors(a0, a1, frac)
    colB.current.lerpColors(b0, b1, frac)
    atmRef.current.lerpColors(b0, b1, frac)
    bgMat.uniforms.uTime.value             = clock.getElapsedTime()
    bgMat.uniforms.uMountainBlend.value    = _mountainBlend.current
    bgMat.uniforms.uColorA.value.lerp(colA.current, 0.04)
    bgMat.uniforms.uColorB.value.lerp(colB.current, 0.04)
    bgMat.uniforms.uAtmColor.value.lerp(atmRef.current, 0.04)
  })

  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[80, 32, 32]} />
      <primitive object={bgMat} attach="material" />
    </mesh>
  )
}

/* ═══════════════════════════════════════════════════════════
   MOUNTAIN TERRAIN — dark ridged peaks behind the city
   Fades from progress 0.28 → 0.62 as city takes over.
═══════════════════════════════════════════════════════════ */

function MountainTerrain() {
  const atmBuf        = useRef(new THREE.Color())
  const terrainMeshRef = useRef<THREE.Mesh>(null)
  const mistMeshRef    = useRef<THREE.Mesh>(null)

  const geo = useMemo(() => {
    const W = 380, D = 200, segW = 96, segD = 60
    const vc = (segW + 1) * (segD + 1)
    const pos = new Float32Array(vc * 3)
    const uvs = new Float32Array(vc * 2)
    const idx: number[] = []
    for (let iz = 0; iz <= segD; iz++) {
      for (let ix = 0; ix <= segW; ix++) {
        const vi = iz * (segW + 1) + ix
        pos[vi*3  ] = (ix / segW - 0.5) * W
        pos[vi*3+1] = 0
        pos[vi*3+2] = (iz / segD - 0.5) * D - 120   // offset back: z ∈ [-220, -20]
        uvs[vi*2  ] = ix / segW
        uvs[vi*2+1] = iz / segD
      }
    }
    for (let iz = 0; iz < segD; iz++) {
      for (let ix = 0; ix < segW; ix++) {
        const a = iz*(segW+1)+ix, b=a+1, c=a+(segW+1), d=c+1
        idx.push(a,b,c, b,d,c)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2))
    g.setIndex(idx)
    return g
  }, [])

  const mistGeo = useMemo(() => new THREE.PlaneGeometry(380, 200), [])

  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   MOUNTAIN_VERT,
    fragmentShader: MOUNTAIN_FRAG,
    uniforms: {
      uTime:     { value: 0 },
      uFade:     { value: 1.0 },
      uAtmColor: { value: new THREE.Color(0x0d0440) },
    },
    transparent: true,
    side: THREE.FrontSide,
  }), [])

  const mistMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   BG_VERT,
    fragmentShader: MIST_FRAG,
    uniforms: {
      uTime:  { value: 0 },
      uFade:  { value: 1.0 },
      uColor: { value: new THREE.Color(0x2d0c88) },
    },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [])

  useEffect(() => () => { geo.dispose(); mat.dispose(); mistGeo.dispose(); mistMat.dispose() },
    [geo, mat, mistGeo, mistMat])

  useFrame(({ clock }) => {
    const t    = clock.getElapsedTime()
    const si   = _sceneI.current
    const frac = THREE.MathUtils.clamp(_prog.current * SCENES.length - si, 0, 1)
    const [, b0] = BG_PALETTES[si]
    const [, b1] = BG_PALETTES[Math.min(si + 1, BG_PALETTES.length - 1)]
    atmBuf.current.lerpColors(b0, b1, frac)

    mat.uniforms.uTime.value  = t
    mat.uniforms.uFade.value  = _mountainBlend.current
    mat.uniforms.uAtmColor.value.lerp(atmBuf.current, 0.05)

    mistMat.uniforms.uTime.value  = t
    mistMat.uniforms.uFade.value  = _mountainBlend.current * 0.85
    mistMat.uniforms.uColor.value.lerp(atmBuf.current, 0.04)

    /* Mountains sink down as they fade out — dramatic descent */
    const sinkY = -8 - (1.0 - _mountainBlend.current) * 16
    if (terrainMeshRef.current) terrainMeshRef.current.position.y = sinkY
    if (mistMeshRef.current)    mistMeshRef.current.position.y    = 14 - (1.0 - _mountainBlend.current) * 16
  })

  return (
    <>
      {/* Terrain mesh — base at y=-8, peaks up to y≈40 */}
      <mesh ref={terrainMeshRef} geometry={geo} material={mat} position={[0, -8, 0]} />
      {/* Mist layer — atmospheric haze between peaks at mid-height */}
      <mesh
        ref={mistMeshRef} geometry={mistGeo} material={mistMat}
        position={[0, 14, -120]} rotation={[-Math.PI / 2, 0, 0]}
      />
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   CITY — 32×32 grid, deep black with purple atmosphere
═══════════════════════════════════════════════════════════ */

const CITY_SIZE  = 32
const CITY_SPACE = 0.88
const CITY_Y     = -6.5
const CITY_COUNT = CITY_SIZE * CITY_SIZE

function CityScene() {
  const buildMeshRef  = useRef<THREE.InstancedMesh>(null)
  const buildMatRef   = useRef<THREE.MeshStandardMaterial>(null)
  const buildGlowRef  = useRef<THREE.InstancedMesh>(null)
  const buildGlowMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const gridMatRef    = useRef<THREE.LineBasicMaterial>(null)

  const cityShader = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   CITY_VERT,
    fragmentShader: CITY_FRAG,
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [])

  const glowMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [])

  const buildData = useMemo(() => {
    /* Buildings pure black — capped so max world y ≈ −1.5, keeping crystal above city */
    const palette = [
      new THREE.Color("#060016"),
      new THREE.Color("#04000e"),
      new THREE.Color("#08001c"),
      new THREE.Color("#050012"),
      new THREE.Color("#030009"),
    ]
    const out: { h: number; color: THREE.Color }[] = []
    for (let row = 0; row < CITY_SIZE; row++) {
      for (let col = 0; col < CITY_SIZE; col++) {
        const dx    = (col / (CITY_SIZE - 1)) * 2 - 1
        const dz    = (row / (CITY_SIZE - 1)) * 2 - 1
        const dist  = Math.sqrt(dx * dx + dz * dz)
        const boost = Math.max(0, 1 - dist * 0.52)
        const isTall = Math.random() > 0.68
        /* max h ≈ 0.5 + 3.5 + 1.0 = 5.0 → world max y = −6.5+5.0 = −1.5 */
        const h = isTall ? 0.5 + boost * 3.5 + Math.random() * 1.0 : 0.04 + Math.random() * 0.20
        out.push({ h, color: palette[Math.floor(Math.random() * palette.length)] })
      }
    }
    return out
  }, [])

  const gridGeo = useMemo(() => {
    const pts: number[] = []
    const half = (CITY_SIZE / 2) * CITY_SPACE
    for (let i = 0; i <= CITY_SIZE; i++) {
      const x = (i - CITY_SIZE / 2) * CITY_SPACE
      pts.push(x, CITY_Y, -half, x, CITY_Y, half)
      pts.push(-half, CITY_Y, x, half, CITY_Y, x)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])

  useEffect(() => {
    const mesh     = buildMeshRef.current
    const glowMesh = buildGlowRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    buildData.forEach((d, i) => {
      const row = Math.floor(i / CITY_SIZE)
      const col = i % CITY_SIZE
      const x = (col - CITY_SIZE / 2) * CITY_SPACE
      const z = (row - CITY_SIZE / 2) * CITY_SPACE
      dummy.position.set(x, CITY_Y + d.h / 2, z)
      dummy.scale.set(0.40, d.h, 0.40)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, d.color)
      /* Glow outline: slightly bigger box, same center */
      if (glowMesh) {
        dummy.scale.set(0.46, d.h + 0.08, 0.46)
        dummy.updateMatrix()
        glowMesh.setMatrixAt(i, dummy.matrix)
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (glowMesh) glowMesh.instanceMatrix.needsUpdate = true
  }, [buildData])

  useEffect(() => () => { cityShader.dispose(); gridGeo.dispose(); glowMat.dispose() }, [cityShader, gridGeo, glowMat])

  useFrame(({ clock }) => {
    const t    = clock.getElapsedTime()
    const fade = THREE.MathUtils.smoothstep(_prog.current, 0.02, 0.12)
    cityShader.uniforms.uTime.value = t
    cityShader.uniforms.uFade.value = fade
    glowMat.uniforms.uTime.value    = t
    glowMat.uniforms.uFade.value    = fade
    if (buildMatRef.current)     buildMatRef.current.opacity     = fade * 0.98
    if (buildGlowMatRef.current) buildGlowMatRef.current.opacity = fade * 0.45
    if (gridMatRef.current)      gridMatRef.current.opacity      = fade * 0.32 * (0.7 + 0.3 * Math.sin(t * 0.55))
  })

  return (
    <>
      {/* Solid purple floor */}
      <mesh position={[0, CITY_Y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CITY_SIZE * CITY_SPACE + 8, CITY_SIZE * CITY_SPACE + 8]} />
        <primitive object={cityShader} attach="material" />
      </mesh>
      {/* Additive purple glow — outlines building bases */}
      <mesh position={[0, CITY_Y + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CITY_SIZE * CITY_SPACE + 20, CITY_SIZE * CITY_SPACE + 20]} />
        <primitive object={glowMat} attach="material" />
      </mesh>
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial ref={gridMatRef} color="#6622e8" transparent opacity={0} />
      </lineSegments>
      {/* Purple outline glow — slightly oversized boxes, additive blending */}
      <instancedMesh ref={buildGlowRef} args={[undefined, undefined, CITY_COUNT]} renderOrder={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial ref={buildGlowMatRef} color="#6018cc" transparent opacity={0}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      {/* Black building bodies — render after glow so they occlude it, leaving edge rim */}
      <instancedMesh ref={buildMeshRef} args={[undefined, undefined, CITY_COUNT]} renderOrder={2}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial ref={buildMatRef} transparent opacity={0} vertexColors metalness={0.92} roughness={0.08} />
      </instancedMesh>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   WINDOW LIGHTS — violet-dominant palette
═══════════════════════════════════════════════════════════ */

function WindowLights() {
  const matRef = useRef<THREE.PointsMaterial>(null)

  const geo = useMemo(() => {
    const count     = 2400
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const row  = Math.floor(Math.random() * CITY_SIZE)
      const col  = Math.floor(Math.random() * CITY_SIZE)
      /* Cap at max building height (5.0) so windows don't float above buildings */
      const h    = Math.random() * 5.0 * (0.2 + 0.8 * Math.random())
      const off  = 0.20
      const side = Math.floor(Math.random() * 4)
      positions[i*3  ] = (col - CITY_SIZE/2) * CITY_SPACE + (side === 0 ? off : side === 1 ? -off : (Math.random()-0.5)*0.38)
      positions[i*3+1] = CITY_Y + h
      positions[i*3+2] = (row - CITY_SIZE/2) * CITY_SPACE + (side === 2 ? off : side === 3 ? -off : (Math.random()-0.5)*0.38)

      /* 50% lavender-white, 28% deep violet, 14% electric violet, 8% magenta */
      const t = Math.random()
      if (t < 0.50)      { colors[i*3] = 0.78; colors[i*3+1] = 0.65; colors[i*3+2] = 1.00 }
      else if (t < 0.78) { colors[i*3] = 0.40; colors[i*3+1] = 0.08; colors[i*3+2] = 0.92 }
      else if (t < 0.92) { colors[i*3] = 0.55; colors[i*3+1] = 0.22; colors[i*3+2] = 1.00 }
      else               { colors[i*3] = 0.88; colors[i*3+1] = 0.04; colors[i*3+2] = 0.72 }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute("color",    new THREE.Float32BufferAttribute(colors,    3))
    return g
  }, [])

  useEffect(() => () => { geo.dispose() }, [geo])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const fade = THREE.MathUtils.smoothstep(_prog.current, 0.02, 0.12)
    matRef.current.opacity = fade * 0.95 * (0.82 + 0.18 * Math.sin(clock.getElapsedTime() * 1.1))
  })

  return (
    <points geometry={geo}>
      <pointsMaterial
        ref={matRef} size={0.16} vertexColors transparent opacity={0}
        blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation
      />
    </points>
  )
}

/* ═══════════════════════════════════════════════════════════
   FLOOR REFLECTION — wet-mirror plane beneath the city
═══════════════════════════════════════════════════════════ */

const REFLECT_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFade;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }

  void main(){
    /* Wet floor warp — slight wavy distortion like puddled rain */
    float warp  = (noise(vUv*7.5 + vec2(uTime*0.08, 0.0)) - 0.5) * 0.022;
    float warp2 = (noise(vUv*12.0 - vec2(0.0, uTime*0.06)) - 0.5) * 0.012;
    vec2 r = vec2(vUv.x + warp, 1.0 - vUv.y + warp2);  /* flip Y = reflection */

    /* City grid lines */
    vec2  grid = fract(r * 32.0);
    float d    = min(min(grid.x,1.0-grid.x), min(grid.y,1.0-grid.y));
    float line = 1.0 - smoothstep(0.0, 0.055, d);

    /* Reflected window dots */
    float wseed = hash(floor(r * 64.0) + vec2(13.7, 5.3));
    float wh    = hash(floor(r * 64.0) + vec2(0.1, 22.4));
    float win   = step(0.91, wseed);

    /* Animated grid pulse — matches city shader */
    float p1 = 0.55 + 0.45*sin(uTime*0.9  + r.x*14.0 - r.y*9.0);
    float p2 = 0.50 + 0.50*sin(uTime*0.40 + r.y*6.0  + r.x*4.0);

    vec3 gridCol = mix(vec3(0.62,0.18,1.00), vec3(0.88,0.48,1.00), p1);
    vec3 winCol  = mix(vec3(0.78,0.65,1.00), vec3(0.55,0.22,1.00), wh);
    vec3 col     = vec3(0.04,0.00,0.12);
    col         += gridCol * line * 1.4 * p1;
    col         += winCol  * win  * 0.9;
    col         += vec3(0.18,0.03,0.48) * p2 * 0.18;

    /* Radial fade — reflection strongest directly below crystal */
    float dist    = length(vUv - 0.5);
    float radFade = smoothstep(0.54, 0.0, dist);

    float alpha = (0.04 + line*0.28 + win*0.20) * radFade * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`

function ReflectionPlane() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   CITY_VERT,
    fragmentShader: REFLECT_FRAG,
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [])

  useEffect(() => () => mat.dispose(), [mat])

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.getElapsedTime()
    mat.uniforms.uFade.value = THREE.MathUtils.smoothstep(_prog.current, 0.04, 0.20) * 0.68
  })

  return (
    <mesh position={[0, CITY_Y - 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CITY_SIZE * CITY_SPACE + 14, CITY_SIZE * CITY_SPACE + 14]} />
      <primitive object={mat} attach="material" />
    </mesh>
  )
}

/* ═══════════════════════════════════════════════════════════
   JOURNEY SCENE — Crystalline Consciousness at center
═══════════════════════════════════════════════════════════ */

const PARTICLE_COUNT = 900

function JourneyScene() {
  const { camera, scene } = useThree()

  /* Purple exponential fog — makes city feel like infinite background */
  useEffect(() => {
    scene.fog = new THREE.FogExp2(0x0a0118, 0.016)
    return () => { scene.fog = null }
  }, [scene])

  const crystalRef   = useRef<THREE.Mesh>(null)
  const coreRef      = useRef<THREE.Mesh>(null)
  const midRef       = useRef<THREE.Mesh>(null)
  const wireRef      = useRef<THREE.LineSegments>(null)
  const satGroupRef  = useRef<THREE.Group>(null)
  const shockRef     = useRef<THREE.Mesh>(null)
  const godRayRef    = useRef<THREE.Mesh>(null)
  const cityRiseRef  = useRef<THREE.Group>(null)
  const shockWave    = useRef(0)        /* 0→1 wave expansion progress */
  const prevHold     = useRef(0)        /* detects hold rising edge */
  const satRefs    = useRef<THREE.Mesh[]>([])
  const satSprRefs = useRef<THREE.Sprite[]>([])
  const ring0      = useRef<THREE.Mesh>(null)
  const ring1      = useRef<THREE.Mesh>(null)
  const ring2      = useRef<THREE.Mesh>(null)
  const ringRefs   = [ring0, ring1, ring2]
  const ptLight    = useRef<THREE.PointLight>(null)
  const accentLight = useRef<THREE.PointLight>(null)
  const tempCam    = useRef(new THREE.Vector3())
  const tempColor  = useRef(new THREE.Color())
  const fogColor   = useRef(new THREE.Color())
  const lookTarget = useRef(new THREE.Vector3())

  /* ── Crystalline Consciousness geometry ── */
  const crystalGeo = useMemo(() => {
    /* subdivision 1 = 80 large flat facets — angular black shard look */
    const base = new THREE.IcosahedronGeometry(1.4, 1)
    const geo  = base.toNonIndexed()
    geo.computeVertexNormals()
    base.dispose()

    const count      = geo.attributes.position.count  // 960 vertices
    const rand       = new Float32Array(count)
    const scatterDir = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      rand[i] = Math.random()
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      scatterDir[i*3  ] = Math.sin(phi) * Math.cos(theta)
      scatterDir[i*3+1] = Math.cos(phi)
      scatterDir[i*3+2] = Math.sin(phi) * Math.sin(theta)
    }
    geo.setAttribute('aRand',       new THREE.Float32BufferAttribute(rand,       1))
    geo.setAttribute('aScatterDir', new THREE.Float32BufferAttribute(scatterDir, 3))
    return geo
  }, [])

  /* Inner plasma core — visible glowing sphere inside the crystal */
  const coreGeo = useMemo(() => new THREE.SphereGeometry(0.54, 80, 80), [])

  /* Mid structural layer — non-indexed icosahedron with same scatter attrs */
  const midGeo = useMemo(() => {
    const base = new THREE.IcosahedronGeometry(1.08, 1)
    const geo  = base.toNonIndexed()
    geo.computeVertexNormals()
    base.dispose()
    const count      = geo.attributes.position.count
    const rand       = new Float32Array(count)
    const scatterDir = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      rand[i] = Math.random()
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      scatterDir[i*3  ] = Math.sin(phi) * Math.cos(theta)
      scatterDir[i*3+1] = Math.cos(phi)
      scatterDir[i*3+2] = Math.sin(phi) * Math.sin(theta)
    }
    geo.setAttribute('aRand',       new THREE.Float32BufferAttribute(rand,       1))
    geo.setAttribute('aScatterDir', new THREE.Float32BufferAttribute(scatterDir, 3))
    return geo
  }, [])

  /* EdgesGeometry: clean crystalline wireframe, slightly larger */
  const wireGeo = useMemo(() => {
    const base  = new THREE.IcosahedronGeometry(1.58, 2)
    const edges = new THREE.EdgesGeometry(base)
    base.dispose()
    return edges
  }, [])

  /* Aurora plane above the city */
  const auroraGeo = useMemo(() => new THREE.PlaneGeometry(55, 55), [])
  const auroraMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   AURORA_VERT,
    fragmentShader: AURORA_FRAG,
    uniforms: { uTime: { value: 0 }, uProgress: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [])

  const crystalMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   CRYSTAL_VERT,
    fragmentShader: CRYSTAL_FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uCamPos:    { value: new THREE.Vector3() },
      uOpacity:   { value: 0 },
      uProgress:  { value: 0 },
      uHold:      { value: 0 },
      uHoldColor: { value: new THREE.Color("#6366f1") },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [])

  /* Inner plasma core material */
  const coreMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   CORE_VERT,
    fragmentShader: CORE_FRAG,
    uniforms: {
      uTime:     { value: 0 },
      uCamPos:   { value: new THREE.Vector3() },
      uOpacity:  { value: 0 },
      uProgress: { value: 0 },
      uHold:     { value: 0 },
    },
    transparent: true, depthWrite: false, side: THREE.FrontSide,
  }), [])

  /* Mid structural layer material (reuses outer vert shader — same attributes) */
  const midMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   CRYSTAL_VERT,
    fragmentShader: MID_FRAG,
    uniforms: {
      uTime:     { value: 0 },
      uCamPos:   { value: new THREE.Vector3() },
      uOpacity:  { value: 0 },
      uProgress: { value: 0 },
      uHold:     { value: 0 },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), [])

  const wireMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   WIRE_VERT,
    fragmentShader: WIRE_FRAG,
    uniforms: {
      uTime:     { value: 0 },
      uProgress: { value: 0 },
      uOpacity:  { value: 1 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [])

  /* Shockwave ring — emits on hold rising edge */
  const shockMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   SHOCK_VERT,
    fragmentShader: SHOCK_FRAG,
    uniforms: {
      uHold:  { value: 0 },
      uWave:  { value: 0 },
      uScale: { value: 1.0 },
      uColor: { value: new THREE.Color("#6366f1") },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [])

  /* God ray cone above crystal */
  const godRayMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   BG_VERT,
    fragmentShader: GODRAY_FRAG,
    uniforms: {
      uTime:      { value: 0 },
      uIntensity: { value: 0 },
      uColor:     { value: new THREE.Color("#6366f1") },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [])

  const glowTex = useMemo(() => {
    if (typeof window === "undefined") return null
    try {
      const c = document.createElement("canvas")
      c.width = c.height = 64
      const ctx = c.getContext("2d")
      if (!ctx) return null
      const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      grd.addColorStop(0,   "rgba(255,255,255,1)")
      grd.addColorStop(0.4, "rgba(200,160,255,0.5)")
      grd.addColorStop(1,   "rgba(140,80,255,0)")
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, 64, 64)
      return new THREE.CanvasTexture(c)
    } catch { return null }
  }, [])

  const { partGeo, partMat } = useMemo(() => {
    const chaos = new Float32Array(PARTICLE_COUNT * 3)
    const orbit = new Float32Array(PARTICLE_COUNT * 3)
    const base  = new Float32Array(PARTICLE_COUNT * 3)
    const scale = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const r  = 2.5 + Math.random() * 5.0
      chaos[i*3]   = Math.sin(ph) * Math.cos(th) * r
      chaos[i*3+1] = Math.cos(ph) * r * 0.45
      chaos[i*3+2] = Math.sin(ph) * Math.sin(th) * r
      const ring = Math.floor(Math.random() * 3)
      const rad  = [2.0, 2.65, 3.3][ring]
      const a    = Math.random() * Math.PI * 2
      orbit[i*3]   = Math.cos(a) * rad
      orbit[i*3+1] = (Math.random() - 0.5) * 0.4
      orbit[i*3+2] = Math.sin(a) * rad
      base[i*3] = orbit[i*3]; base[i*3+1] = orbit[i*3+1]; base[i*3+2] = orbit[i*3+2]
      scale[i]  = 0.5 + Math.random() * 1.8
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.Float32BufferAttribute(base,  3))
    geo.setAttribute("aChaos",   new THREE.Float32BufferAttribute(chaos, 3))
    geo.setAttribute("aOrbit",   new THREE.Float32BufferAttribute(orbit, 3))
    geo.setAttribute("aScale",   new THREE.Float32BufferAttribute(scale, 1))
    const mat = new THREE.ShaderMaterial({
      vertexShader:   PART_VERT,
      fragmentShader: PART_FRAG,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 0.55 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    return { partGeo: geo, partMat: mat }
  }, [])

  const lineGeo = useMemo(() => {
    const pts: number[] = []
    SAT_POS.forEach(([x, y, z]) => pts.push(0, 0, 0, x, y, z))
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: "#4f46e5", transparent: true, opacity: 0 }), [])

  useEffect(() => () => {
    crystalGeo.dispose(); crystalMat.dispose()
    coreGeo.dispose();    coreMat.dispose()
    midGeo.dispose();     midMat.dispose()
    wireGeo.dispose();    wireMat.dispose()
    auroraGeo.dispose();  auroraMat.dispose()
    partGeo.dispose();    partMat.dispose()
    lineGeo.dispose();    lineMat.dispose()
    shockMat.dispose();   godRayMat.dispose()
    glowTex?.dispose()
  }, [crystalGeo, crystalMat, coreGeo, coreMat, midGeo, midMat, wireGeo, wireMat, auroraGeo, auroraMat, partGeo, partMat, lineGeo, lineMat, shockMat, godRayMat, glowTex])

  useFrame(({ clock }) => {
    const t  = clock.getElapsedTime()
    const p  = _prog.current
    const si = _sceneI.current

    /* ── Mountain blend — fades out as city takes over ── */
    const targetMB = 1.0 - THREE.MathUtils.smoothstep(p, 0.25, 0.62)
    _mountainBlend.current = THREE.MathUtils.lerp(_mountainBlend.current, targetMB, 0.032)

    /* ── City rise — buildings emerge from below as city fades in ── */
    if (cityRiseRef.current) {
      const rise = THREE.MathUtils.smoothstep(p, 0.01, 0.22)
      cityRiseRef.current.position.y = THREE.MathUtils.lerp(cityRiseRef.current.position.y, -9 * (1.0 - rise), 0.06)
    }

    /* ── Fog color sync with BG palette ── */
    if (scene.fog instanceof THREE.FogExp2) {
      const [a0] = BG_PALETTES[si]
      const [a1] = BG_PALETTES[Math.min(si + 1, BG_PALETTES.length - 1)]
      const frac = THREE.MathUtils.clamp(p * SCENES.length - si, 0, 1)
      fogColor.current.lerpColors(a0, a1, frac)
      const fogTarget = fogColor.current
      scene.fog.color.lerp(fogTarget, 0.03)
      scene.fog.density = 0.015 + _mountainBlend.current * 0.007
    }

    /* ── Hold detection: scroll velocity + pointer/touch hold ── */
    const progDelta  = Math.abs(p - _progLast.current)
    _scrollVel.current = THREE.MathUtils.lerp(_scrollVel.current, progDelta * 90, 0.06)
    _progLast.current  = p
    const targetScrollHold = _scrollVel.current < 0.003 ? 1.0 : 0.0
    _holdInt.current = THREE.MathUtils.lerp(_holdInt.current, targetScrollHold, 0.022)
    /* Pointer hold: fast ramp up when held, slower decay on release */
    _pointerHoldInt.current = THREE.MathUtils.lerp(
      _pointerHoldInt.current,
      _pointerHeld.current ? 1.0 : 0.0,
      _pointerHeld.current ? 0.045 : 0.022
    )
    /* Combined hold: max of scroll-pause and pointer-held */
    const combinedHold = Math.max(_holdInt.current, _pointerHoldInt.current)

    /* ── Camera path ── */
    const rawIdx = p * (CAM_POS.length - 1)
    const idx0   = Math.floor(rawIdx)
    const idx1   = Math.min(idx0 + 1, CAM_POS.length - 1)
    tempCam.current.lerpVectors(CAM_POS[idx0], CAM_POS[idx1], rawIdx - idx0)
    camera.position.lerp(tempCam.current, 0.055)

    /* Look at midpoint between city and crystal — city at bottom, crystal at top */
    const lookY = THREE.MathUtils.lerp(-0.5, 1.5, THREE.MathUtils.smoothstep(p, 0.0, 0.85))
    lookTarget.current.set(0, lookY, 0)
    camera.lookAt(lookTarget.current)

    /* ── Crystal ── */
    const burstFac    = Math.max(0, 1.0 - Math.abs(p - 0.25) * 38)
    const baseOpacity = THREE.MathUtils.smoothstep(p, 0.05, 0.28)
    const crystalOp   = Math.max(baseOpacity, burstFac)

    /* Scale + rotation shared across all three crystal layers */
    const crystalScale = 0.05 + baseOpacity * 1.15 + burstFac * 1.9
    const crystalRotY  = crystalRef.current ? crystalRef.current.rotation.y + 0.0045 : 0
    const crystalRotX  = Math.sin(t * 0.28) * 0.13

    /* ── Hold color: cycles through chapter accent colors ── */
    const holdColIdx = Math.floor(p * AGENT_COLORS.length) % AGENT_COLORS.length
    tempColor.current.set(AGENT_COLORS[holdColIdx])
    crystalMat.uniforms.uHoldColor.value.lerp(tempColor.current, 0.08)

    /* ── Shockwave: fire on hold rising edge, expand to radius 3.5 ── */
    if (combinedHold > 0.5 && prevHold.current < 0.5) {
      shockWave.current = 0.01  /* trigger new wave */
    }
    prevHold.current = combinedHold
    if (shockWave.current > 0) {
      shockWave.current = Math.min(shockWave.current + 0.018, 1.2)
    }
    shockMat.uniforms.uHold.value  = combinedHold
    shockMat.uniforms.uWave.value  = shockWave.current
    shockMat.uniforms.uScale.value = 3.5 + shockWave.current * 0.5
    shockMat.uniforms.uColor.value.lerp(tempColor.current, 0.12)

    /* ── God rays: intensity ramps with hold and crystal opacity ── */
    const godIntensity = crystalOp * (0.35 + combinedHold * 0.65)
    godRayMat.uniforms.uTime.value      = t
    godRayMat.uniforms.uIntensity.value = THREE.MathUtils.lerp(godRayMat.uniforms.uIntensity.value, godIntensity, 0.04)
    godRayMat.uniforms.uColor.value.lerp(tempColor.current, 0.06)

    /* ── Outer glass shell ── */
    crystalMat.uniforms.uTime.value     = t
    crystalMat.uniforms.uProgress.value = p
    crystalMat.uniforms.uOpacity.value  = crystalOp
    crystalMat.uniforms.uHold.value     = combinedHold
    crystalMat.uniforms.uCamPos.value.copy(camera.position)

    if (crystalRef.current) {
      crystalRef.current.scale.setScalar(crystalScale)
      crystalRef.current.rotation.y = crystalRotY
      crystalRef.current.rotation.x = crystalRotX
    }

    /* ── Mid structural layer ── */
    midMat.uniforms.uTime.value     = t
    midMat.uniforms.uProgress.value = p
    midMat.uniforms.uOpacity.value  = crystalOp
    midMat.uniforms.uHold.value     = combinedHold
    midMat.uniforms.uCamPos.value.copy(camera.position)

    if (midRef.current) {
      midRef.current.scale.setScalar(crystalScale)
      midRef.current.rotation.y = crystalRotY * 1.08   // slightly counter-rotated
      midRef.current.rotation.x = crystalRotX * 0.85
    }

    /* ── Inner plasma core ── */
    coreMat.uniforms.uTime.value     = t
    coreMat.uniforms.uProgress.value = p
    coreMat.uniforms.uOpacity.value  = THREE.MathUtils.smoothstep(p, 0.08, 0.30)
    coreMat.uniforms.uHold.value     = combinedHold
    coreMat.uniforms.uCamPos.value.copy(camera.position)

    if (coreRef.current) {
      /* Core scale: slightly pulsing, grows on hold */
      const coreBase  = crystalScale * 0.78
      const corePulse = 1.0 + Math.sin(t * 2.4) * 0.025 + combinedHold * 0.12
      coreRef.current.scale.setScalar(coreBase * corePulse)
      coreRef.current.rotation.y = crystalRotY * -0.55
      coreRef.current.rotation.x = crystalRotX * -0.45
    }

    /* ── Wireframe edges ── */
    wireMat.uniforms.uTime.value     = t
    wireMat.uniforms.uProgress.value = p
    if (wireRef.current && crystalRef.current) {
      wireRef.current.scale.copy(crystalRef.current.scale)
      wireRef.current.rotation.y = crystalRef.current.rotation.y * 0.88
      wireRef.current.rotation.x = crystalRef.current.rotation.x
    }

    /* ── Aurora ── */
    auroraMat.uniforms.uTime.value     = t
    auroraMat.uniforms.uProgress.value = p

    /* ── Particles ── */
    partMat.uniforms.uTime.value     = t
    partMat.uniforms.uProgress.value = THREE.MathUtils.smoothstep(p, 0.05, 0.55)

    /* ── Satellites ── */
    const activeAgentIdx = si >= 2 ? (si === 7 ? -2 : si - 2) : -1
    if (satGroupRef.current) {
      satGroupRef.current.rotation.y = t * 0.065
      satRefs.current.forEach((mesh, i) => {
        if (!mesh) return
        const revealP  = AGENT_REVEAL_P[i]
        const visible  = THREE.MathUtils.smoothstep(p, revealP, revealP + 0.05)
        const isActive = activeAgentIdx === -2 || activeAgentIdx === i
        mesh.scale.setScalar(visible * (isActive ? 1.85 : 1.0))
        const spr = satSprRefs.current[i]
        if (spr?.material) {
          ;(spr.material as THREE.SpriteMaterial).opacity = visible * (isActive ? 0.78 : 0.28)
        }
      })
    }

    lineMat.opacity = THREE.MathUtils.smoothstep(p, 0.50, 0.66) * 0.22 * (0.65 + 0.35 * Math.sin(t * 1.6))

    const ringThresholds = [0.375, 0.50, 0.625]
    ringRefs.forEach((ref, i) => {
      if (!ref.current) return
      ref.current.rotation.z = t * RINGS[i].speed
      ;(ref.current.material as THREE.MeshStandardMaterial).opacity =
        THREE.MathUtils.smoothstep(p, ringThresholds[i], ringThresholds[i] + 0.04) * 0.40
    })

    if (ptLight.current) {
      const c0   = LIGHT_COLORS[si] ?? LIGHT_COLORS[0]
      const c1   = LIGHT_COLORS[Math.min(si + 1, LIGHT_COLORS.length - 1)]
      const frac = THREE.MathUtils.clamp(p * SCENES.length - si, 0, 1)
      ptLight.current.color.lerpColors(c0, c1, frac)
      /* On hold, inner core light bleeds through the glass shell */
      ptLight.current.intensity = 2.5 + burstFac * 5.0 + combinedHold * 4.0
    }

    if (accentLight.current && si >= 2) {
      tempColor.current.set(AGENT_COLORS[Math.min(si - 2, 7)])
      accentLight.current.color.lerp(tempColor.current, 0.06)
      accentLight.current.intensity = THREE.MathUtils.smoothstep(p, 0.28, 0.45) * 2.0
        + combinedHold * 2.5
    }
  })

  return (
    <>
      <SceneBackground />
      <Stars radius={65} depth={50} count={2500} factor={4.2} saturation={0.6} fade speed={0.28} />
      <Sparkles count={120} size={1.5} scale={8} speed={0.12} color="#a855f7" noise={1.0} />
      <HelixStreams />
      <MountainTerrain />
      {/* City group — rises from below as progress increases */}
      <group ref={cityRiseRef}>
        <CityScene />
        <WindowLights />
        <ReflectionPlane />
      </group>

      {/* Purple city aurora — ceiling atmosphere */}
      <mesh geometry={auroraGeo} material={auroraMat} position={[0, 9, -4]} rotation={[Math.PI / 2, 0, 0]} />

      {/* Central object group — elevated above city (CITY_Y=-6.5, max building ~-1.5) */}
      <group position={[0, 3.5, 0]}>
        {/* Layer 1 — Inner plasma core (renders first, visible through all outer layers) */}
        <mesh ref={coreRef} geometry={coreGeo} material={coreMat} renderOrder={10} />

        {/* Layer 2 — Mid structural crystal (visible interior geometry) */}
        <mesh ref={midRef} geometry={midGeo} material={midMat} renderOrder={11} />

        {/* Layer 3 — Outer glass shell (edge-fresnel transparent, shows layers inside) */}
        <mesh ref={crystalRef} geometry={crystalGeo} material={crystalMat} renderOrder={12} />

        {/* Wireframe edge overlay — data network */}
        <lineSegments ref={wireRef} geometry={wireGeo} material={wireMat} renderOrder={13} />

        {/* Orbital rings */}
        {RINGS.map((cfg, i) => (
          <mesh key={i} ref={ringRefs[i]} rotation={cfg.rotation}>
            <torusGeometry args={[cfg.r, 0.012, 16, 128]} />
            <meshStandardMaterial color={cfg.color} emissive={cfg.color} emissiveIntensity={1.2} transparent opacity={0} metalness={0.3} roughness={0.1} />
          </mesh>
        ))}

        <points geometry={partGeo} material={partMat} />

        {/* Shockwave ring — horizontal plane, expands outward on hold rising edge */}
        <mesh ref={shockRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={15}>
          <planeGeometry args={[1, 1, 1, 1]} />
          <primitive object={shockMat} attach="material" />
        </mesh>

        {/* God rays — vertical plane, volumetric shafts above crystal on hold */}
        <mesh ref={godRayRef} position={[0, 5.5, -0.5]} scale={[18, 24, 1]} renderOrder={14}>
          <planeGeometry args={[1, 1]} />
          <primitive object={godRayMat} attach="material" />
        </mesh>

        {/* Agent satellite group */}
        <group ref={satGroupRef}>
          <lineSegments geometry={lineGeo} material={lineMat} />
          {SAT_POS.map((pos, i) => (
            <group key={i} position={pos}>
              <mesh ref={(el) => { if (el) satRefs.current[i] = el as unknown as THREE.Mesh }} scale={[0, 0, 0]}>
                <sphereGeometry args={[0.13, 16, 16]} />
                <meshStandardMaterial color={AGENT_COLORS[i]} emissive={AGENT_COLORS[i]} emissiveIntensity={0.8} metalness={0.4} roughness={0.15} />
              </mesh>
              <sprite ref={(el) => { if (el) satSprRefs.current[i] = el }} scale={[1.1, 1.1, 1.1]}>
                <spriteMaterial
                  map={glowTex} color={AGENT_COLORS[i]}
                  transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false}
                />
              </sprite>
            </group>
          ))}
        </group>
      </group>

      {/* Lighting — key + purple city ambient + accent */}
      <ambientLight intensity={0.06} />
      <pointLight ref={ptLight}     position={[4, 4, 4]}     intensity={2.5}  color="#9d72ff" />
      <pointLight                   position={[-4, -3, -3]}  intensity={0.80} color="#7c3aed" />
      <pointLight                   position={[0, 0, 6]}     intensity={0.28} color="#ffffff" />
      <pointLight ref={accentLight} position={[0, 3, 5]}     intensity={0}    color="#6366f1" />
      {/* City outline lights — 2 floor + 2 mid (reduced from 11 for GPU budget) */}
      <pointLight position={[ 0, -5.0,-12]} intensity={4.8} color="#3010a8" distance={30} />
      <pointLight position={[ 9, -5.0,  9]} intensity={3.6} color="#6030d0" distance={24} />
      <pointLight position={[ 0, -3.0,-10]} intensity={3.8} color="#5520c8" distance={26} />
      <pointLight position={[ 6, -3.0,  6]} intensity={3.2} color="#6828d8" distance={20} />
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   HATOMSCROLL — Hatom-style full-screen experience
═══════════════════════════════════════════════════════════ */

function DynamicPostFX() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        luminanceThreshold={0.14}
        luminanceSmoothing={0.82}
        intensity={2.8}
        blendFunction={BlendFunction.ADD}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette eskil={false} offset={0.12} darkness={0.95} />
    </EffectComposer>
  )
}

/* ─── Film grain overlay ────────────────────────────────────── */
function FilmGrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = 256
    canvas.height = 256
    const ctx = canvas.getContext("2d")!
    let raf: number, last = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 55) return   // ~18fps — imperceptible flicker rate
      last = now
      const img = ctx.createImageData(256, 256)
      const buf = img.data
      for (let i = 0; i < buf.length; i += 4) {
        const v = (Math.random() * 255) | 0
        buf[i] = buf[i + 1] = buf[i + 2] = v
        buf[i + 3] = 22
      }
      ctx.putImageData(img, 0, 0)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <canvas
      ref={canvasRef}
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         8,
        width:          "100vw",
        height:         "100vh",
        pointerEvents:  "none",
        mixBlendMode:   "screen",
        opacity:        0.038,
        imageRendering: "pixelated",
      } as React.CSSProperties}
    />
  )
}

/* ─── Magnetic CTA wrapper ──────────────────────────────────── */
function MagneticCTA({ href, children, style, className }: { href: string; children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null)

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx   = e.clientX - (rect.left + rect.width  / 2)
    const dy   = e.clientY - (rect.top  + rect.height / 2)
    gsap.to(el, { x: dx * 0.32, y: dy * 0.32, duration: 0.35, ease: "power2.out" })
  }

  const onLeave = () => {
    gsap.to(ref.current, { x: 0, y: 0, duration: 0.65, ease: "elastic.out(1, 0.45)" })
  }

  return (
    <a
      ref={ref}
      href={href}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      style={{ display: "inline-block", willChange: "transform", ...style }}
    >
      {children}
    </a>
  )
}

/* ─── Post-story data ───────────────────────────────────────── */
const RESULT_STATS = [
  { value: "4.2h",   label: "Saved every single day",  color: "#6366f1" },
  { value: "3.8×",  label: "More reviews in 90 days", color: "#8b5cf6" },
  { value: "$8,400", label: "Avg. monthly revenue",    color: "#06b6d4" },
  { value: "500+",   label: "Businesses transformed",  color: "#10b981" },
]
const PRICING_PLANS = [
  { name: "Starter",    price: "$297", features: ["3 AI Agents", "Content + Reputation", "Monthly Reports", "Email Support"],                                      color: "#6366f1", popular: false },
  { name: "Growth",     price: "$597", features: ["6 AI Agents", "Full Suite + SEO", "Weekly Reports", "Priority Support", "Brand Voice Training"],               color: "#8b5cf6", popular: true  },
  { name: "Enterprise", price: "$997", features: ["All 8 AI Agents", "Custom Brand Voice", "Daily Reports", "Dedicated Manager", "White Label"],                  color: "#06b6d4", popular: false },
]

export default function HatomScroll() {
  const scrollRef      = useRef<HTMLDivElement>(null)
  const lastIdxRef     = useRef(-1)
  const lastPostRef    = useRef(-1)
  const postResultsRef = useRef<HTMLDivElement | null>(null)
  const postPricingRef = useRef<HTMLDivElement | null>(null)
  const postCtaRef     = useRef<HTMLDivElement | null>(null)

  const [sceneIdx,    setSceneIdx]    = useState(0)
  const [count,       setCount]       = useState(0)
  const [loaded,      setLoaded]      = useState(false)
  const [dismissed,   setDismissed]   = useState(false)
  const [hidden,      setHidden]      = useState(false)
  const [muted,       setMuted]       = useState(false)
  const [postSection, setPostSection] = useState(-1)

  /* ── Per-section text refs for GSAP entrance animations ── */
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([])
  const bodyRefs  = useRef<(HTMLParagraphElement | null)[]>([])
  const badgeRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    return () => {
      document.documentElement.style.overflow = ""
      document.body.style.overflow = ""
    }
  }, [])

  /* Pointer/touch hold detection — drives crystal activation state */
  useEffect(() => {
    const onDown = () => { _pointerHeld.current = true }
    const onUp   = () => { _pointerHeld.current = false }
    window.addEventListener("mousedown",  onDown, { passive: true })
    window.addEventListener("mouseup",    onUp,   { passive: true })
    window.addEventListener("touchstart", onDown, { passive: true })
    window.addEventListener("touchend",   onUp,   { passive: true })
    window.addEventListener("touchcancel",onUp,   { passive: true })
    return () => {
      window.removeEventListener("mousedown",   onDown)
      window.removeEventListener("mouseup",     onUp)
      window.removeEventListener("touchstart",  onDown)
      window.removeEventListener("touchend",    onUp)
      window.removeEventListener("touchcancel", onUp)
    }
  }, [])

  useEffect(() => {
    let n = 0
    const id = setInterval(() => {
      n += Math.random() * 5 + 2
      if (n >= 100) { n = 100; clearInterval(id); setLoaded(true) }
      setCount(Math.floor(n))
    }, 55)
    return () => clearInterval(id)
  }, [])

  const dismiss = useCallback(() => {
    if (!loaded || dismissed) return
    setDismissed(true)
    setTimeout(() => setHidden(true), 680)
    import("@/lib/audio").then(({ audioEngine }) => {
      if (!audioEngine) return
      audioEngine.init()
      audioEngine.startAmbient()
    })
  }, [loaded, dismissed])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(dismiss, 700)
    return () => clearTimeout(t)
  }, [loaded, dismiss])

  /* ── GSAP text entrance on chapter change ── */
  useEffect(() => {
    const title = titleRefs.current[sceneIdx]
    const body  = bodyRefs.current[sceneIdx]
    const badge = badgeRefs.current[sceneIdx]
    if (!title) return
    gsap.killTweensOf([title, body, badge].filter(Boolean))
    gsap.fromTo(badge,
      { opacity: 0, y: 7 },
      { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" }
    )
    gsap.fromTo(title,
      { opacity: 0, y: 20, filter: "blur(5px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.65, ease: "power3.out", delay: 0.07 }
    )
    gsap.fromTo(body,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.65, ease: "power3.out", delay: 0.2 }
    )
  }, [sceneIdx])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const onScroll = () => {
      const { scrollTop, clientHeight } = container
      /* Story progress: 0→1 over the first (SCENES.length-1) screens */
      const storyMax = (SCENES.length - 1) * clientHeight
      const p   = storyMax > 0 ? Math.min(scrollTop / storyMax, 1.0) : 0
      _prog.current   = p
      const idx = Math.min(Math.floor(p * SCENES.length), SCENES.length - 1)
      _sceneI.current = idx
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx
        setSceneIdx(idx)
        import("@/lib/audio").then(({ audioEngine }) => audioEngine?.playBeat(idx))
      }
      /* Post-story sections — track which panel is active */
      const postStart = SCENES.length * clientHeight
      if (scrollTop >= postStart) {
        const pi = Math.min(Math.floor((scrollTop - postStart) / clientHeight), 2)
        if (pi !== lastPostRef.current) {
          lastPostRef.current = pi
          setPostSection(pi)
        }
      } else if (lastPostRef.current !== -1) {
        lastPostRef.current = -1
        setPostSection(-1)
      }
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [])

  const jumpToChapter = useCallback((i: number) => {
    const container = scrollRef.current
    if (!container) return
    /* Each chapter starts at i * clientHeight */
    container.scrollTo({ top: i * container.clientHeight, behavior: "smooth" })
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault()
        jumpToChapter(Math.min(_sceneI.current + 1, SCENES.length - 1))
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault()
        jumpToChapter(Math.max(_sceneI.current - 1, 0))
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [jumpToChapter])

  /* ── GSAP post-section entrance animations ── */
  useEffect(() => {
    if (postSection === 0 && postResultsRef.current) {
      const cards = postResultsRef.current.querySelectorAll(".ap-stat")
      gsap.fromTo(cards, { opacity: 0, y: 50, scale: 0.88 },
        { opacity: 1, y: 0, scale: 1, duration: 0.75, stagger: 0.11, ease: "power3.out" })
      const h = postResultsRef.current.querySelector(".ap-post-h")
      if (h) gsap.fromTo(h, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" })
    }
    if (postSection === 1 && postPricingRef.current) {
      const cards = postPricingRef.current.querySelectorAll(".ap-plan")
      gsap.fromTo(cards, { opacity: 0, y: 60, scale: 0.92 },
        { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.13, ease: "power3.out" })
    }
    if (postSection === 2 && postCtaRef.current) {
      const els = postCtaRef.current.querySelectorAll(".ap-cta-el")
      gsap.fromTo(els, { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.75, stagger: 0.15, ease: "power3.out" })
    }
  }, [postSection])

  const toggleMute = useCallback(() => {
    import("@/lib/audio").then(({ audioEngine }) => {
      if (!audioEngine) return
      const nowMuted = audioEngine.toggle()
      setMuted(!nowMuted)
    })
  }, [])

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <style>{`
        html, body { overflow: hidden !important; margin: 0; padding: 0; }
        @keyframes ap-blink { 0%,100%{opacity:.22} 50%{opacity:.7} }
        #ap-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ══ LOADER ══ */}
      {!hidden && (
        <div
          onClick={dismiss}
          style={{
            position: "absolute", inset: 0, zIndex: 9999,
            background: "#000",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            cursor: loaded ? "pointer" : "default",
            opacity: dismissed ? 0 : 1,
            transition: "opacity 0.65s ease",
            pointerEvents: dismissed ? "none" : "auto",
          }}
        >
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(8rem, 28vw, 26rem)",
            color: "rgba(120,60,255,0.06)",
            lineHeight: 1, userSelect: "none", pointerEvents: "none",
          }}>
            {count}
          </div>
          <p style={{
            position: "absolute", top: "3.8194vw", left: "50%", transform: "translateX(-50%)",
            margin: 0, fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(0.55rem, 0.85vw, 0.9rem)",
            color: "rgba(160,100,255,0.35)",
            letterSpacing: "0.32em", textTransform: "uppercase", whiteSpace: "nowrap",
          }}>
            Loading {SCENES.length} chapters
          </p>
          <p style={{
            margin: 0, position: "relative", zIndex: 1,
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(1.2rem, 3vw, 3.5rem)",
            color: loaded ? "#7c3aed" : "rgba(160,100,255,0.35)",
            letterSpacing: "0.18em", textTransform: "uppercase",
            transition: "color 0.9s",
          }}>
            AutoPilot
          </p>
          <p style={{
            position: "absolute", bottom: "3.8194vw", left: "50%", transform: "translateX(-50%)",
            margin: 0, fontSize: "clamp(0.45rem, 0.62vw, 0.68rem)",
            color: loaded ? "rgba(160,100,255,0.3)" : "transparent",
            letterSpacing: "0.32em", textTransform: "uppercase", whiteSpace: "nowrap",
            transition: "color 0.6s",
          }}>
            AI Business Operating System
          </p>
        </div>
      )}

      {/* ══ WEBGL ══ */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <WebGLErrorBoundary>
          <Canvas
            camera={{ position: [0, 15.5, 28.0], fov: 50 }}
            dpr={[1, 2]}
            gl={{ antialias: false, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
            style={{ width: "100%", height: "100%" }}
          >
            <JourneyScene />
            <DynamicPostFX />
          </Canvas>
        </WebGLErrorBoundary>
      </div>

      {/* Softer vignette — let the purple city breathe at edges */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "radial-gradient(ellipse 82% 82% at 50% 50%, transparent 35%, rgba(0,0,0,0.50) 100%)",
      }} />

      {/* ══ HEADER ══ */}
      <header style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "3.8194vw", pointerEvents: "none",
      }}>
        <span style={{
          fontFamily: "'OCMikola', sans-serif",
          fontSize: "clamp(0.9rem, 1.2vw, 1.5rem)",
          color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase",
        }}>AutoPilot</span>
        <MagneticCTA href="/signup" style={{
          pointerEvents: "auto",
          fontFamily: "'OCMikola', sans-serif",
          fontSize: "clamp(0.5rem, 0.7vw, 0.75rem)",
          color: "#9d72ff", letterSpacing: "0.28em", textTransform: "uppercase",
          textDecoration: "none", borderBottom: "1px solid rgba(157,114,255,0.35)",
          paddingBottom: "0.15em",
        }}>
          Start Free →
        </MagneticCTA>
      </header>

      {/* ══ PAGINATION DOTS — 2px, top center ══ */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        zIndex: 20, display: "flex", alignItems: "flex-start",
        paddingTop: "3.8194vw",
      }}>
        {SCENES.map((s, i) => {
          const isActive = i === sceneIdx
          return (
            <button
              key={i}
              onClick={() => jumpToChapter(i)}
              aria-label={s.label}
              title={s.label.split(" — ")[1]}
              style={{
                width: "52px", height: "52px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              <div style={{
                width: "2px", height: "2px", borderRadius: "50%", flexShrink: 0,
                background: isActive ? "#9d72ff" : "rgba(255,255,255,0.25)",
                boxShadow: isActive ? "0 0 8px #9d72ff, 0 0 22px rgba(157,114,255,0.6)" : "none",
                transition: "background 0.4s, box-shadow 0.4s",
              }} />
            </button>
          )
        })}
      </div>

      {/* ══ FIXED SCROLL CONTAINER ══ */}
      <div
        id="ap-scroll"
        ref={scrollRef}
        style={{
          position: "absolute", inset: 0,
          overflowY: "scroll", overflowX: "hidden",
          zIndex: 2, scrollbarWidth: "none",
        } as React.CSSProperties}
      >
        {SCENES.map((s, i) => {
          const isLeft  = i % 2 === 0
          const col     = AGENT_COLORS[i] ?? "#7c3aed"
          const caption = s.label.split(" — ")[1]

          return (
            <section key={i} style={{ height: "100vh", position: "relative", pointerEvents: "none" }}>
              <div style={{
                position: "absolute", top: "50%", transform: "translateY(-50%)",
                ...(isLeft ? { left: "10.625vw" } : { right: "8.1944vw" }),
                maxWidth: "34vw", pointerEvents: "auto",
              }}>
                {/* Phase caption badge */}
                <div
                  ref={(el) => { badgeRefs.current[i] = el }}
                  style={{
                    display: "inline-block",
                    background: col, color: "#000",
                    fontFamily: "'OCMikola', sans-serif",
                    fontSize: "clamp(0.5rem, 0.65vw, 0.72rem)",
                    fontWeight: 700, letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    padding: "0.45em 1.15em 0.38em",
                    marginBottom: "2vw",
                  }}
                >
                  {caption}
                </div>

                {/* Title */}
                <h2
                  ref={(el) => { titleRefs.current[i] = el }}
                  style={{
                    fontFamily: "'OCMikola', sans-serif",
                    fontSize: "clamp(1.6rem, 2.9166vw, 4.2rem)",
                    textTransform: "uppercase",
                    letterSpacing: "-0.025em", lineHeight: 0.92,
                    color: "#fff", margin: "0 0 1.8vw 0", whiteSpace: "pre-line",
                  }}
                >
                  {s.title.toUpperCase()}
                </h2>

                {/* Body */}
                <p
                  ref={(el) => { bodyRefs.current[i] = el }}
                  style={{
                    fontSize: "clamp(0.72rem, 0.9722vw, 1rem)",
                    color: "rgba(255,255,255,0.45)", lineHeight: 1.75, margin: 0,
                    ...(isLeft ? {} : { textAlign: "right" as const }),
                  }}
                >
                  {s.body}
                </p>

                {i === SCENES.length - 1 && (
                  <MagneticCTA href="/signup" style={{
                    marginTop: "2.8vw",
                    padding: "1.1em 3.2em",
                    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                    color: "#fff", fontFamily: "'OCMikola', sans-serif",
                    fontSize: "clamp(0.55rem, 0.75vw, 0.82rem)",
                    letterSpacing: "0.28em", textTransform: "uppercase",
                    textDecoration: "none",
                    boxShadow: "0 0 40px rgba(124,58,237,0.42)",
                  }}>
                    Start Free
                  </MagneticCTA>
                )}
              </div>

              {/* Ghosted chapter number */}
              <div style={{
                position: "absolute", bottom: "4.5vw",
                ...(isLeft ? { right: "8.1944vw" } : { left: "10.625vw" }),
                fontFamily: "'OCMikola', sans-serif",
                fontSize: "clamp(5rem, 12vw, 13rem)",
                color: "rgba(157,114,255,0.04)",
                lineHeight: 1, letterSpacing: "-0.04em",
                userSelect: "none", pointerEvents: "none",
              }}>
                0{i + 1}
              </div>

              {i === 0 && (
                <div style={{
                  position: "absolute", bottom: "3.8194vw", left: "50%", transform: "translateX(-50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "0.7vw",
                  pointerEvents: "none",
                }}>
                  <p style={{
                    margin: 0, fontSize: "clamp(0.45rem, 0.58vw, 0.62rem)",
                    letterSpacing: "0.35em", textTransform: "uppercase",
                    color: "rgba(157,114,255,0.4)",
                  }}>
                    Scroll to discover
                  </p>
                  <svg width="8" height="13" viewBox="0 0 8 13" fill="none"
                    style={{ animation: "ap-blink 1.8s ease-in-out infinite" }}>
                    <path d="M4 0v9M1 6.5L4 10l3-3.5" stroke="rgba(157,114,255,0.4)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </section>
          )
        })}

        {/* ══════════════════════════════════════════════════════
            POST-STORY: RESULTS
        ══════════════════════════════════════════════════════ */}
        <section
          ref={postResultsRef}
          style={{
            height: "100vh", position: "relative",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "0 8vw",
            background: "linear-gradient(180deg, rgba(2,0,16,0) 0%, rgba(4,0,20,0.96) 18%, rgba(4,0,20,0.98) 100%)",
          }}
        >
          <p className="ap-post-h" style={{
            margin: "0 0 1.2vw", fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(0.5rem, 0.7vw, 0.78rem)", letterSpacing: "0.35em",
            textTransform: "uppercase", color: "rgba(157,114,255,0.5)", opacity: 0,
          }}>
            The transformation — by the numbers
          </p>
          <h2 className="ap-post-h" style={{
            margin: "0 0 5vw", fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(2rem, 4.5vw, 5.5rem)", textTransform: "uppercase",
            letterSpacing: "-0.03em", lineHeight: 0.9, color: "#fff", opacity: 0,
            textAlign: "center",
          }}>
            What happens after<br />
            <span style={{ color: "#9d72ff" }}>AutoPilot.</span>
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: "2vw", width: "100%", maxWidth: "1400px",
          }}>
            {RESULT_STATS.map((s, i) => (
              <div key={i} className="ap-stat" style={{
                opacity: 0,
                padding: "3vw 2vw",
                border: `1px solid ${s.color}22`,
                background: `linear-gradient(135deg, ${s.color}0a 0%, transparent 60%)`,
                display: "flex", flexDirection: "column", gap: "1vw",
              }}>
                <span style={{
                  fontFamily: "'OCMikola', sans-serif",
                  fontSize: "clamp(2.2rem, 4.8vw, 6rem)",
                  color: s.color, lineHeight: 1,
                  letterSpacing: "-0.04em",
                  textShadow: `0 0 40px ${s.color}88`,
                }}>{s.value}</span>
                <span style={{
                  fontSize: "clamp(0.62rem, 0.85vw, 0.95rem)",
                  color: "rgba(255,255,255,0.42)", lineHeight: 1.5,
                }}>{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            POST-STORY: PRICING
        ══════════════════════════════════════════════════════ */}
        <section
          ref={postPricingRef}
          style={{
            height: "100vh", position: "relative",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "0 8vw",
            background: "rgba(4,0,20,0.98)",
          }}
        >
          <p style={{
            margin: "0 0 1.2vw", fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(0.5rem, 0.7vw, 0.78rem)", letterSpacing: "0.35em",
            textTransform: "uppercase", color: "rgba(157,114,255,0.5)",
          }}>
            Choose your altitude
          </p>
          <h2 style={{
            margin: "0 0 4vw", fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(1.8rem, 3.8vw, 4.5rem)", textTransform: "uppercase",
            letterSpacing: "-0.03em", lineHeight: 0.9, color: "#fff",
            textAlign: "center",
          }}>
            Simple pricing.<br />
            <span style={{ color: "#9d72ff" }}>Extraordinary results.</span>
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3,1fr)",
            gap: "2vw", width: "100%", maxWidth: "1200px",
          }}>
            {PRICING_PLANS.map((plan, i) => (
              <div key={i} className="ap-plan" style={{
                opacity: 0,
                padding: "3vw 2.2vw",
                border: `1px solid ${plan.popular ? plan.color : plan.color + "33"}`,
                background: plan.popular
                  ? `linear-gradient(145deg, ${plan.color}18 0%, ${plan.color}08 100%)`
                  : "linear-gradient(145deg, rgba(255,255,255,0.03) 0%, transparent 100%)",
                position: "relative",
              }}>
                {plan.popular && (
                  <div style={{
                    position: "absolute", top: "-1px", left: "50%", transform: "translateX(-50%)",
                    background: plan.color, color: "#000",
                    fontFamily: "'OCMikola', sans-serif",
                    fontSize: "clamp(0.42rem, 0.56vw, 0.62rem)",
                    letterSpacing: "0.28em", textTransform: "uppercase",
                    padding: "0.3em 1.2em", whiteSpace: "nowrap",
                  }}>Most Popular</div>
                )}
                <p style={{
                  margin: "0 0 0.8vw", fontFamily: "'OCMikola', sans-serif",
                  fontSize: "clamp(0.62rem, 0.85vw, 0.95rem)", letterSpacing: "0.2em",
                  textTransform: "uppercase", color: plan.color,
                }}>{plan.name}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.3em", marginBottom: "2vw" }}>
                  <span style={{
                    fontFamily: "'OCMikola', sans-serif",
                    fontSize: "clamp(2rem, 3.8vw, 4.5rem)", color: "#fff",
                    letterSpacing: "-0.04em", lineHeight: 1,
                  }}>{plan.price}</span>
                  <span style={{ fontSize: "clamp(0.7rem, 0.9vw, 1rem)", color: "rgba(255,255,255,0.3)" }}>/mo</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2.5vw", display: "flex", flexDirection: "column", gap: "0.9vw" }}>
                  {plan.features.map((f, fi) => (
                    <li key={fi} style={{
                      fontSize: "clamp(0.6rem, 0.8vw, 0.9rem)",
                      color: "rgba(255,255,255,0.48)", display: "flex", gap: "0.7em",
                    }}>
                      <span style={{ color: plan.color, flexShrink: 0 }}>→</span>{f}
                    </li>
                  ))}
                </ul>
                <MagneticCTA href="/signup" style={{
                  display: "block", textAlign: "center",
                  padding: "0.9em 0",
                  background: plan.popular ? plan.color : "transparent",
                  border: `1px solid ${plan.color}`,
                  color: plan.popular ? "#000" : plan.color,
                  fontFamily: "'OCMikola', sans-serif",
                  fontSize: "clamp(0.5rem, 0.68vw, 0.75rem)",
                  letterSpacing: "0.25em", textTransform: "uppercase",
                  textDecoration: "none",
                }}>
                  Start Free
                </MagneticCTA>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            POST-STORY: CTA
        ══════════════════════════════════════════════════════ */}
        <section
          ref={postCtaRef}
          style={{
            height: "100vh", position: "relative",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "0 8vw",
            background: "linear-gradient(180deg, rgba(4,0,20,0.98) 0%, rgba(1,0,8,1) 100%)",
          }}
        >
          {/* Ambient glow rings */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(124,58,237,0.12) 0%, transparent 70%)",
          }} />
          <p className="ap-cta-el" style={{
            opacity: 0, margin: "0 0 1.5vw",
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(0.5rem, 0.7vw, 0.78rem)", letterSpacing: "0.35em",
            textTransform: "uppercase", color: "rgba(157,114,255,0.5)",
          }}>
            500+ businesses already on autopilot
          </p>
          <h2 className="ap-cta-el" style={{
            opacity: 0, margin: "0 0 2vw",
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(2.5rem, 6.5vw, 8rem)", textTransform: "uppercase",
            letterSpacing: "-0.04em", lineHeight: 0.88, color: "#fff",
            textAlign: "center", whiteSpace: "pre-line",
          }}>
            {"Your autopilot\nis ready."}
          </h2>
          <p className="ap-cta-el" style={{
            opacity: 0, margin: "0 0 4vw",
            fontSize: "clamp(0.75rem, 1vw, 1.1rem)",
            color: "rgba(255,255,255,0.38)", maxWidth: "420px",
            textAlign: "center", lineHeight: 1.75,
          }}>
            Start free. See results in 7 days. No credit card required.
          </p>
          <MagneticCTA href="/signup" style={{ opacity: 0 }} className="ap-cta-el">
            <div style={{
              padding: "1.3em 4.5em",
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9d22e5 100%)",
              color: "#fff", fontFamily: "'OCMikola', sans-serif",
              fontSize: "clamp(0.6rem, 0.82vw, 0.9rem)",
              letterSpacing: "0.28em", textTransform: "uppercase",
              boxShadow: "0 0 60px rgba(124,58,237,0.55), 0 0 120px rgba(124,58,237,0.25)",
              transition: "box-shadow 0.3s",
            }}>
              Start Free →
            </div>
          </MagneticCTA>
        </section>

      </div>

      {/* Post-story 3D dimmer — subtle backdrop so text stays readable */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "rgba(0,0,0,0.55)",
        opacity: postSection >= 0 ? 1 : 0,
        transition: "opacity 1.0s ease",
      }} />

      {/* ══ PROGRESS BAR ══ */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", zIndex: 20, background: "rgba(157,114,255,0.1)" }}>
        <div style={{
          height: "100%",
          width: `${((sceneIdx + 1) / SCENES.length) * 100}%`,
          background: `linear-gradient(90deg, #4f46e5, ${AGENT_COLORS[Math.min(sceneIdx, 7)]})`,
          boxShadow: `0 0 6px ${AGENT_COLORS[Math.min(sceneIdx, 7)]}`,
          transition: "width 0.7s ease",
        }} />
      </div>

      {/* ══ MUTE BUTTON ══ */}
      <button
        onClick={toggleMute}
        style={{
          position: "absolute", bottom: "3.8194vw", right: "3.8194vw", zIndex: 20,
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "0.6vw",
          color: muted ? "rgba(255,255,255,0.18)" : "rgba(157,114,255,0.6)",
          fontSize: "clamp(0.45rem, 0.58vw, 0.62rem)",
          letterSpacing: "0.25em", textTransform: "uppercase",
          fontFamily: "'OCMikola', sans-serif", transition: "color 0.3s",
        }}
      >
        {muted ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
        {muted ? "Muted" : "Sound"}
      </button>

      {/* ══ FILM GRAIN ══ */}
      <FilmGrain />
    </div>
  )
}
