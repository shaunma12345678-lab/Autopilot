"use client"

import { useRef, useMemo, useEffect, useState, useCallback } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Stars, Sparkles } from "@react-three/drei"
import * as THREE from "three"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

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

/* ─── Agent data ───────────────────────────────────────────── */
const AGENT_COLORS = [
  "#6366f1", "#10b981", "#8b5cf6", "#06b6d4",
  "#f59e0b", "#ec4899", "#f97316", "#14b8a6",
]

const AGENT_INFO = [
  { name: "Content Agent",    stat: "47 posts/month",   desc: "Instagram · Facebook · LinkedIn · Google" },
  { name: "Reputation Agent", stat: "< 5 min response", desc: "Every review answered automatically"      },
  { name: "Lead Gen Agent",   stat: "50 sequences/mo",  desc: "Cold email + LinkedIn outreach"           },
  { name: "SEO Agent",        stat: "4 posts/month",    desc: "Local keywords that actually rank"        },
  { name: "Sales Agent",      stat: "60-sec toolkit",   desc: "Scripts · objections · proposals"        },
  { name: "Support Agent",    stat: "24/7 replies",     desc: "Answers from your FAQ, auto-escalates"   },
  { name: "Financial Agent",  stat: "Monthly P&L",      desc: "Plain English with 3 action items"       },
  { name: "Brand Voice",      stat: "All 8 agents",     desc: "Custom AI profile for each client"       },
]

/* ─── Camera positions per scene ───────────────────────────── */
const CAM_POS = [
  new THREE.Vector3(0,    2.5,  14.0),  // S0: before — wide, city in fog
  new THREE.Vector3(0,    1.5,  10.0),  // S1: signal — approaching, city wakes
  new THREE.Vector3(0,   -0.5,   5.5),  // S2: activation — inside, orb ignites
  new THREE.Vector3(3.5,  1.5,   9.5),  // S3: content — side angle, city lit
  new THREE.Vector3(-3.5, 1.5,  10.0),  // S4: growth — opposite tower, full spread
  new THREE.Vector3(0,    4.5,  12.0),  // S5: revenue — elevated, entire city
  new THREE.Vector3(2.0,  0.5,   7.5),  // S6: intelligence — street level
  new THREE.Vector3(0,    2.0,  18.0),  // S7: autopilot — cosmic pullback
]

/* ─── Scene light colors ───────────────────────────────────── */
const LIGHT_COLORS = [
  new THREE.Color("#1a1a4a"),
  new THREE.Color("#2d2060"),
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
  { rotation: [Math.PI / 2, 0, 0] as [number, number, number],          r: 1.65, color: "#6366f1", speed:  0.42 },
  { rotation: [Math.PI / 5, Math.PI / 3, 0] as [number, number, number],r: 2.05, color: "#8b5cf6", speed: -0.30 },
  { rotation: [-Math.PI / 4, Math.PI / 4, 0] as [number, number, number],r:2.40, color: "#06b6d4", speed:  0.54 },
]

/* ─── Agent reveal thresholds ──────────────────────────────── */
const AGENT_REVEAL_P = AGENT_COLORS.map((_, i) => 0.22 + (i / 8) * 0.55)

/* ─── Module-level mutable state (GSAP ↔ R3F bridge) ──────── */
const _prog   = { current: 0 }
const _sceneI = { current: 0 }

/* ═══════════════════════════════════════════════════════════
   SHADERS
═══════════════════════════════════════════════════════════ */

const ORB_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uMorph;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*n2(p);p*=2.1;p+=vec2(1.7,9.2);a*=0.5;}return v;}

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    float disp = (fbm(vUv * 3.5 + vec2(uTime*0.18, uTime*0.13)) - 0.5) * 2.0;
    vec3 displaced = position + normal * disp * uMorph * 0.40;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

const ORB_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uCamPos;
  uniform float uOpacity;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.1+vec2(1.7,9.2);a*=0.5;}return v;}

  void main() {
    vec3 viewDir = normalize(uCamPos - vWorldPosition);
    float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.0);
    float n  = fbm(vUv * 4.5 + vec2(uTime*0.12, uTime*0.08));
    float pulse = sin(uTime*1.8)*0.07 + 0.93;
    vec3 core  = vec3(0.31,0.29,0.95)*(0.18+n*0.82)*pulse;
    vec3 rim   = vec3(0.56,0.42,1.00)*fresnel*1.6;
    vec3 white = vec3(1.0,0.96,1.0)*pow(fresnel,4.0)*0.85;
    gl_FragColor = vec4(core+rim+white, (0.48+fresnel*0.52)*uOpacity);
  }
`

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
    gl_FragColor = vec4(0.58, 0.52, 1.0, a);
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
    vec2 uvScaled = vUv * 24.0;
    vec2 g = fract(uvScaled);
    float d = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
    float line = 1.0 - smoothstep(0.0, 0.048, d);
    float pulse = 0.55 + 0.45 * sin(uTime * 1.1 + vUv.x * 12.0 - vUv.y * 8.0);
    vec3 gridCol = mix(vec3(0.14, 0.10, 0.48), vec3(0.5, 0.42, 1.0), line * pulse);
    float edgeFade = smoothstep(0.0, 0.15, min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y)));
    float alpha = line * pulse * edgeFade * uFade;
    gl_FragColor = vec4(gridCol, alpha);
  }
`

/* ═══════════════════════════════════════════════════════════
   HELIX DATA STREAMS — signature visual
   Three interlocked helixes carrying "data pulses" around the orb
═══════════════════════════════════════════════════════════ */

const HELIX_COUNT  = 3
const HELIX_PTS    = 300
const HELIX_TOTAL  = HELIX_COUNT * HELIX_PTS

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

    /* Travelling pulse along the helix */
    float travel = mod(aPhase - uTime * 1.3, 6.2832);
    float pulse  = 1.0 - smoothstep(0.0, 1.4, abs(travel - 3.14159));

    /* Per-helix reveal threshold */
    float threshold = aHelixId * 0.055;
    float reveal    = smoothstep(threshold, threshold + 0.10, uProgress);

    vAlpha = (0.12 + pulse * 0.88) * reveal;

    /* Rotate each helix at different speed/direction */
    float dir  = mod(aHelixId, 2.0) < 0.5 ? 1.0 : -1.0;
    float rotY = uTime * 0.20 * dir + aHelixId * 2.0944; /* 120° apart */
    float cosR = cos(rotY), sinR = sin(rotY);
    vec3  pos  = position;
    float nx   = pos.x * cosR - pos.z * sinR;
    float nz   = pos.x * sinR + pos.z * cosR;
    pos.x = nx; pos.z = nz;

    vec4  mvPos      = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize     = (1.6 + pulse * 4.5) * (240.0 / -mvPos.z);
    gl_Position      = projectionMatrix * mvPos;
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

const HELIX_COLORS = [
  new THREE.Color(AGENT_COLORS[0]), // indigo
  new THREE.Color(AGENT_COLORS[2]), // violet
  new THREE.Color(AGENT_COLORS[3]), // cyan
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
        const angle  = t * Math.PI * 8      // 4 full rotations
        const radius = 1.70 + Math.sin(t * Math.PI) * 0.20
        const y      = (t - 0.5) * 4.0

        positions[idx*3  ] = Math.cos(angle) * radius
        positions[idx*3+1] = y
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
      uniforms: {
        uTime:     { value: 0 },
        uProgress: { value: 0 },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
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
   SCENE BACKGROUND — per-scene atmospheric color shader
═══════════════════════════════════════════════════════════ */

const BG_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`

const BG_FRAG = /* glsl */`
  precision highp float;
  varying vec2  vUv;
  uniform float uTime;
  uniform vec3  uColorA;  /* deep background */
  uniform vec3  uColorB;  /* accent nebula */
  uniform float uBlend;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
  }
  float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.0+vec2(1.7,9.2);a*=0.5;}return v;}

  void main() {
    float t  = uTime * 0.04;
    float n1 = fbm(vUv * 2.5 + vec2(t, t*0.7));
    float n2 = fbm(vUv * 4.5 - vec2(t*0.6, t));
    vec3  col = mix(uColorA, uColorA + uColorB * 0.55, n1 * 0.5 + n2 * 0.25);
    /* Radial vignette — brighter at center */
    float rad = 1.0 - length(vUv - 0.5) * 1.6;
    col      += uColorB * max(0.0, rad * rad) * 0.18;
    gl_FragColor = vec4(col, 1.0);
  }
`

/* Per-scene palette pairs [dark, accent] */
const BG_PALETTES: Array<[THREE.Color, THREE.Color]> = [
  [new THREE.Color(0x010110), new THREE.Color(0x1a1055)], // 0 — dormant: deep void
  [new THREE.Color(0x010115), new THREE.Color(0x2d1a7a)], // 1 — signal: violet deepens
  [new THREE.Color(0x050210), new THREE.Color(0x5a1a8a)], // 2 — ignition: magenta burst
  [new THREE.Color(0x010112), new THREE.Color(0x1a2880)], // 3 — content: deep blue
  [new THREE.Color(0x010112), new THREE.Color(0x2a1870)], // 4 — growth: indigo
  [new THREE.Color(0x010213), new THREE.Color(0x083060)], // 5 — revenue: ocean blue
  [new THREE.Color(0x020111), new THREE.Color(0x3a1040)], // 6 — intelligence: deep rose
  [new THREE.Color(0x010112), new THREE.Color(0x0e0e55)], // 7 — autopilot: cosmic
]

function SceneBackground() {
  const matRef = useRef<THREE.ShaderMaterial | null>(null)
  const colA   = useRef(new THREE.Color())
  const colB   = useRef(new THREE.Color())

  const bgMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   BG_VERT,
    fragmentShader: BG_FRAG,
    uniforms: {
      uTime:   { value: 0 },
      uColorA: { value: new THREE.Color(0x010110) },
      uColorB: { value: new THREE.Color(0x1a1055) },
      uBlend:  { value: 0 },
    },
    depthWrite: false,
    depthTest:  false,
    side: THREE.BackSide,
  }), [])

  useEffect(() => { matRef.current = bgMat; return () => bgMat.dispose() }, [bgMat])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    bgMat.uniforms.uTime.value = clock.getElapsedTime()

    const si  = _sceneI.current
    const [a0, b0] = BG_PALETTES[si]
    const [a1, b1] = BG_PALETTES[Math.min(si + 1, BG_PALETTES.length - 1)]
    const frac = THREE.MathUtils.clamp(_prog.current * SCENES.length - si, 0, 1)

    colA.current.lerpColors(a0, a1, frac)
    colB.current.lerpColors(b0, b1, frac)
    bgMat.uniforms.uColorA.value.lerp(colA.current, 0.04)
    bgMat.uniforms.uColorB.value.lerp(colB.current, 0.04)
  })

  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[80, 32, 32]} />
      <primitive object={bgMat} attach="material" />
    </mesh>
  )
}

/* ═══════════════════════════════════════════════════════════
   CITY COMPONENT
═══════════════════════════════════════════════════════════ */

const CITY_SIZE  = 24
const CITY_SPACE = 1.05
const CITY_Y     = -5.0
const CITY_COUNT = CITY_SIZE * CITY_SIZE

function CityScene() {
  const buildMeshRef = useRef<THREE.InstancedMesh>(null)
  const buildMatRef  = useRef<THREE.MeshBasicMaterial>(null)
  const gridMatRef   = useRef<THREE.LineBasicMaterial>(null)

  const cityShader = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   CITY_VERT,
    fragmentShader: CITY_FRAG,
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
    transparent: true,
    depthWrite:  false,
    side: THREE.DoubleSide,
  }), [])

  const buildData = useMemo(() => {
    const out: { h: number; color: THREE.Color }[] = []
    const colA    = new THREE.Color("#4f46e5")
    const colB    = new THREE.Color("#818cf8")
    const colC    = new THREE.Color("#06b6d4")
    const colD    = new THREE.Color("#7c3aed")
    const colDark = new THREE.Color("#0c0b22")
    for (let row = 0; row < CITY_SIZE; row++) {
      for (let col = 0; col < CITY_SIZE; col++) {
        const dx   = (col / (CITY_SIZE - 1)) * 2 - 1
        const dz   = (row / (CITY_SIZE - 1)) * 2 - 1
        const dist = Math.sqrt(dx * dx + dz * dz)
        const boost = Math.max(0, 1 - dist * 0.75)
        const isTall = Math.random() > 0.78
        const h = isTall
          ? 0.6 + boost * 3.2 + Math.random() * 1.0
          : 0.04 + Math.random() * 0.22
        const t    = Math.min(1, h / 4.2)
        const base = colDark.clone().lerp([colA, colB, colC, colD][Math.floor(Math.random() * 4)], t * 0.9 + 0.1)
        out.push({ h, color: base })
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
    const mesh = buildMeshRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    buildData.forEach((d, i) => {
      const row = Math.floor(i / CITY_SIZE)
      const col = i % CITY_SIZE
      const x   = (col - CITY_SIZE / 2) * CITY_SPACE
      const z   = (row - CITY_SIZE / 2) * CITY_SPACE
      dummy.position.set(x, CITY_Y + d.h / 2, z)
      dummy.scale.set(0.42, d.h, 0.42)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, d.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [buildData])

  useEffect(() => () => { cityShader.dispose(); gridGeo.dispose() }, [cityShader, gridGeo])

  useFrame(({ clock }) => {
    const t    = clock.getElapsedTime()
    const fade = THREE.MathUtils.smoothstep(_prog.current, 0.06, 0.22)
    cityShader.uniforms.uTime.value = t
    cityShader.uniforms.uFade.value = fade
    if (buildMatRef.current) buildMatRef.current.opacity = fade * 0.88
    if (gridMatRef.current)  gridMatRef.current.opacity  = fade * 0.25 * (0.7 + 0.3 * Math.sin(t * 0.55))
  })

  return (
    <>
      <mesh position={[0, CITY_Y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CITY_SIZE * CITY_SPACE + 5, CITY_SIZE * CITY_SPACE + 5]} />
        <primitive object={cityShader} attach="material" />
      </mesh>
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial ref={gridMatRef} color="#5855d8" transparent opacity={0} />
      </lineSegments>
      <instancedMesh ref={buildMeshRef} args={[undefined, undefined, CITY_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial ref={buildMatRef} transparent opacity={0} vertexColors />
      </instancedMesh>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   WINDOW LIGHTS — glowing dots on building faces
═══════════════════════════════════════════════════════════ */

function WindowLights() {
  const matRef = useRef<THREE.PointsMaterial>(null)

  const geo = useMemo(() => {
    const count     = 900
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const row  = Math.floor(Math.random() * CITY_SIZE)
      const col  = Math.floor(Math.random() * CITY_SIZE)
      const x    = (col - CITY_SIZE / 2) * CITY_SPACE
      const z    = (row - CITY_SIZE / 2) * CITY_SPACE
      const h    = Math.random() * 4.5 * (0.3 + 0.7 * Math.random())
      const off  = 0.21
      const side = Math.floor(Math.random() * 4)

      positions[i*3]   = x + (side === 0 ? off : side === 1 ? -off : (Math.random()-0.5)*0.40)
      positions[i*3+1] = CITY_Y + h
      positions[i*3+2] = z + (side === 2 ? off : side === 3 ? -off : (Math.random()-0.5)*0.40)

      const t = Math.random()
      if (t < 0.55) {
        colors[i*3] = 0.98; colors[i*3+1] = 0.88; colors[i*3+2] = 0.60 // warm amber
      } else if (t < 0.80) {
        colors[i*3] = 0.75; colors[i*3+1] = 0.85; colors[i*3+2] = 1.00 // cool blue
      } else {
        colors[i*3] = 0.65; colors[i*3+1] = 0.50; colors[i*3+2] = 1.00 // indigo
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute("color",    new THREE.Float32BufferAttribute(colors,    3))
    return g
  }, [])

  useEffect(() => () => { geo.dispose() }, [geo])

  useFrame(({ clock }) => {
    if (!matRef.current) return
    const fade = THREE.MathUtils.smoothstep(_prog.current, 0.06, 0.22)
    matRef.current.opacity = fade * 0.70 * (0.88 + 0.12 * Math.sin(clock.getElapsedTime() * 1.1))
  })

  return (
    <points geometry={geo}>
      <pointsMaterial
        ref={matRef}
        size={0.09}
        vertexColors
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

/* ═══════════════════════════════════════════════════════════
   JOURNEY SCENE
═══════════════════════════════════════════════════════════ */

const PARTICLE_COUNT = 1200

function JourneyScene() {
  const { camera } = useThree()

  const orbRef      = useRef<THREE.Mesh>(null)
  const satGroupRef = useRef<THREE.Group>(null)
  const satRefs     = useRef<THREE.Mesh[]>([])
  const satSprRefs  = useRef<THREE.Sprite[]>([])
  const ring0       = useRef<THREE.Mesh>(null)
  const ring1       = useRef<THREE.Mesh>(null)
  const ring2       = useRef<THREE.Mesh>(null)
  const ringRefs    = [ring0, ring1, ring2]
  const ptLight     = useRef<THREE.PointLight>(null)
  const accentLight = useRef<THREE.PointLight>(null)
  const tempCam     = useRef(new THREE.Vector3())
  const tempColor   = useRef(new THREE.Color())

  const orbMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   ORB_VERT,
    fragmentShader: ORB_FRAG,
    uniforms: {
      uTime:    { value: 0 },
      uCamPos:  { value: new THREE.Vector3() },
      uOpacity: { value: 0 },
      uMorph:   { value: 0 },
    },
    transparent: true,
    depthWrite:  false,
  }), [])

  const halo0 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#6366f1", transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const halo1 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#818cf8", transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const halo2 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#c4b5fd", transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }), [])

  /* Soft circular glow texture — eliminates the square sprite artifact */
  const glowTex = useMemo(() => {
    if (typeof window === "undefined") return null
    const c   = document.createElement("canvas")
    c.width   = c.height = 64
    const ctx = c.getContext("2d")!
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0,   "rgba(255,255,255,1)")
    grd.addColorStop(0.4, "rgba(255,255,255,0.5)")
    grd.addColorStop(1,   "rgba(255,255,255,0)")
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
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
      scale[i] = 0.5 + Math.random() * 1.8
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
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
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
    orbMat.dispose(); halo0.dispose(); halo1.dispose(); halo2.dispose()
    partGeo.dispose(); partMat.dispose()
    lineGeo.dispose(); lineMat.dispose()
    glowTex?.dispose()
  }, [orbMat, halo0, halo1, halo2, partGeo, partMat, lineGeo, lineMat, glowTex])

  useFrame(({ clock }) => {
    const t  = clock.getElapsedTime()
    const p  = _prog.current
    const si = _sceneI.current

    orbMat.uniforms.uTime.value = t
    orbMat.uniforms.uCamPos.value.copy(camera.position)
    partMat.uniforms.uTime.value = t

    /* Camera path lerp */
    const rawIdx = p * (CAM_POS.length - 1)
    const idx0   = Math.floor(rawIdx)
    const idx1   = Math.min(idx0 + 1, CAM_POS.length - 1)
    tempCam.current.lerpVectors(CAM_POS[idx0], CAM_POS[idx1], rawIdx - idx0)
    camera.position.lerp(tempCam.current, 0.055)
    /* LookAt shifts from orb (0,0) to city level (-1.8) as scroll progresses */
    const lookY = THREE.MathUtils.lerp(0, -1.8, THREE.MathUtils.smoothstep(p, 0.2, 0.7))
    camera.lookAt(0, lookY, 0)

    /* Burst spike at scene 2 (p ≈ 0.25) */
    const burstFac = Math.max(0, 1.0 - Math.abs(p - 0.25) * 38)

    /* Orb */
    const baseOpacity = THREE.MathUtils.smoothstep(p, 0.05, 0.28)
    const orbOpacity  = Math.max(baseOpacity, burstFac)
    orbMat.uniforms.uOpacity.value = orbOpacity
    orbMat.uniforms.uMorph.value   = THREE.MathUtils.smoothstep(burstFac, 0.0, 0.55)
    if (orbRef.current) {
      orbRef.current.scale.setScalar(0.05 + baseOpacity * 1.15 + burstFac * 1.9)
      orbRef.current.rotation.y += 0.003
    }

    halo0.opacity = orbOpacity * 0.09
    halo1.opacity = orbOpacity * 0.055
    halo2.opacity = orbOpacity * 0.030

    partMat.uniforms.uProgress.value = THREE.MathUtils.smoothstep(p, 0.05, 0.55)

    /* Agent satellites — per-agent reveal + active spotlight */
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

    /* Connection lines */
    const lineBase = THREE.MathUtils.smoothstep(p, 0.50, 0.66) * 0.22
    lineMat.opacity = lineBase * (0.65 + 0.35 * Math.sin(t * 1.6))

    /* Rings progressive reveal */
    const ringThresholds = [0.375, 0.50, 0.625]
    ringRefs.forEach((ref, i) => {
      if (!ref.current) return
      ref.current.rotation.z = t * RINGS[i].speed
      ;(ref.current.material as THREE.MeshBasicMaterial).opacity =
        THREE.MathUtils.smoothstep(p, ringThresholds[i], ringThresholds[i] + 0.04) * 0.40
    })

    /* Scene lighting */
    if (ptLight.current) {
      const c0   = LIGHT_COLORS[si] ?? LIGHT_COLORS[0]
      const c1   = LIGHT_COLORS[Math.min(si + 1, LIGHT_COLORS.length - 1)]
      const frac = THREE.MathUtils.clamp(p * SCENES.length - si, 0, 1)
      ptLight.current.color.lerpColors(c0, c1, frac)
      ptLight.current.intensity = 2.2 + burstFac * 5.0
    }

    /* Accent light follows active agent color */
    if (accentLight.current && si >= 2) {
      const idx = Math.min(si - 2, 7)
      tempColor.current.set(AGENT_COLORS[idx])
      accentLight.current.color.lerp(tempColor.current, 0.06)
      accentLight.current.intensity = THREE.MathUtils.smoothstep(p, 0.28, 0.45) * 1.8
    }
  })

  return (
    <>
      <SceneBackground />
      <Stars radius={65} depth={50} count={2200} factor={3.5} saturation={0.4} fade speed={0.4} />
      <Sparkles count={90} size={1.3} scale={6} speed={0.15} color="#818cf8" noise={0.9} />
      <HelixStreams />

      <CityScene />
      <WindowLights />

      {/* Central orb */}
      <mesh ref={orbRef}>
        <sphereGeometry args={[1.2, 96, 96]} />
        <primitive object={orbMat} attach="material" />
      </mesh>

      {/* Glow halo layers — fake bloom via BackSide additive spheres */}
      <mesh><sphereGeometry args={[1.55, 32, 32]} /><primitive object={halo0} attach="material" /></mesh>
      <mesh><sphereGeometry args={[2.10, 32, 32]} /><primitive object={halo1} attach="material" /></mesh>
      <mesh><sphereGeometry args={[3.00, 32, 32]} /><primitive object={halo2} attach="material" /></mesh>

      {/* Orbital rings — progressive reveal */}
      {RINGS.map((cfg, i) => (
        <mesh key={i} ref={ringRefs[i]} rotation={cfg.rotation}>
          <torusGeometry args={[cfg.r, 0.012, 16, 128]} />
          <meshBasicMaterial color={cfg.color} transparent opacity={0} />
        </mesh>
      ))}

      <points geometry={partGeo} material={partMat} />

      {/* Agent satellite group */}
      <group ref={satGroupRef}>
        <lineSegments geometry={lineGeo} material={lineMat} />
        {SAT_POS.map((pos, i) => (
          <group key={i} position={pos}>
            <mesh
              ref={(el) => { if (el) satRefs.current[i] = el as unknown as THREE.Mesh }}
              scale={[0, 0, 0]}
            >
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshBasicMaterial color={AGENT_COLORS[i]} />
            </mesh>
            {/* Circular glow halo — NOT a square */}
            <sprite
              ref={(el) => { if (el) satSprRefs.current[i] = el }}
              scale={[1.1, 1.1, 1.1]}
            >
              <spriteMaterial
                map={glowTex}
                color={AGENT_COLORS[i]}
                transparent
                opacity={0}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        ))}
      </group>

      {/* Lighting */}
      <ambientLight intensity={0.07} />
      <pointLight ref={ptLight}     position={[4, 4, 4]}    intensity={2.2}  color="#818cf8" />
      <pointLight                   position={[-4, -3, -3]} intensity={0.75} color="#a78bfa" />
      <pointLight                   position={[0, 0, 6]}    intensity={0.30} color="#ffffff" />
      <pointLight ref={accentLight} position={[0, 3, 5]}    intensity={0}    color="#6366f1" />
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   HATOMSCROLL — Root component
═══════════════════════════════════════════════════════════ */

export default function HatomScroll() {
  const sectionRef  = useRef<HTMLDivElement>(null)
  const lastBeatRef = useRef(-1)
  const [sceneIdx, setSceneIdx] = useState(0)
  const [muted, setMuted]       = useState(false)

  const toggleMute = () => {
    import("@/lib/audio").then(({ audioEngine }) => {
      if (!audioEngine) return
      const nowMuted = audioEngine.toggle()
      setMuted(!nowMuted)
    })
  }

  /* Jump to a specific chapter by computing its scroll position within the section */
  const jumpToChapter = useCallback((i: number) => {
    const el = sectionRef.current
    if (!el) return
    const sectionTop  = el.getBoundingClientRect().top + window.scrollY
    const scrollRange = el.offsetHeight - window.innerHeight
    window.scrollTo({ top: sectionTop + (i / SCENES.length) * scrollRange, behavior: "smooth" })
  }, [])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      scrub: 1.5,
      onUpdate: (self) => {
        const p = self.progress
        _prog.current = p
        const idx = Math.min(Math.floor(p * SCENES.length), SCENES.length - 1)
        _sceneI.current = idx
        if (idx !== lastBeatRef.current) {
          lastBeatRef.current = idx
          setSceneIdx(idx)
          import("@/lib/audio").then(({ audioEngine }) => audioEngine?.playBeat(idx))
        }
      },
    })
    return () => trigger.kill()
  }, [])

  const scene        = SCENES[sceneIdx]
  const activeAgentI = sceneIdx >= 2 ? Math.min(sceneIdx - 2, 7) : -1
  const activeAgent  = activeAgentI >= 0 ? AGENT_INFO[activeAgentI] : null
  const activeColor  = activeAgentI >= 0 ? AGENT_COLORS[activeAgentI] : "#6366f1"

  return (
    <section ref={sectionRef} id="journey" style={{ height: "800vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden" style={{ background: "#030712" }}>

        {/* Canvas */}
        <div className="absolute inset-0">
          <Canvas
            camera={{ position: [0, 0, 13.5], fov: 46 }}
            gl={{ antialias: true, alpha: false }}
            style={{ width: "100%", height: "100%" }}
          >
            <JourneyScene />
          </Canvas>
        </div>

        {/* Vignette */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ background: "radial-gradient(ellipse 75% 75% at 50% 50%, transparent 30%, rgba(3,7,18,0.72) 100%)" }}
        />

        {/* ── TOP LEFT: Chapter label ── */}
        <div className="absolute top-8 left-8 md:left-14 z-20">
          <p
            key={`ch${sceneIdx}`}
            className="text-xs font-bold tracking-[0.3em] uppercase animate-fade-up mb-1.5"
            style={{ color: "rgba(124,58,237,0.70)" }}
          >
            {scene.label}
          </p>
          {activeAgent && (
            <div key={`ag${sceneIdx}`} className="flex items-center gap-2 animate-fade-up" style={{ animationDelay: "50ms" }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: activeColor, boxShadow: `0 0 5px ${activeColor}` }} />
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: activeColor }}>
                {activeAgent.name} — {activeAgent.stat}
              </p>
            </div>
          )}
        </div>

        {/* ── RIGHT: Chapter navigation dots ── */}
        <div className="absolute right-5 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-4">
          {SCENES.map((s, i) => {
            const col      = AGENT_COLORS[i] ?? "#6366f1"
            const isActive = i === sceneIdx
            const isPast   = i < sceneIdx
            return (
              <button
                key={i}
                onClick={() => jumpToChapter(i)}
                aria-label={s.label}
                className="relative flex items-center justify-end gap-2.5 group bg-transparent border-0 p-0 cursor-pointer"
              >
                {/* Hover tooltip */}
                <span
                  className="absolute right-6 text-[10px] font-bold tracking-widest uppercase whitespace-nowrap px-2 py-1 rounded pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-200"
                  style={{
                    color:            col,
                    background:       "rgba(0,0,0,0.80)",
                    border:           `1px solid ${col}30`,
                    backdropFilter:   "blur(8px)",
                  }}
                >
                  {s.label.split(" — ")[1]}
                </span>
                {/* Dot */}
                <div
                  className="rounded-full shrink-0 transition-all duration-500"
                  style={{
                    width:      isActive ? "11px" : "7px",
                    height:     isActive ? "11px" : "7px",
                    background: isActive
                      ? col
                      : isPast
                        ? `${col}60`
                        : "rgba(255,255,255,0.12)",
                    boxShadow: isActive ? `0 0 10px ${col}, 0 0 22px ${col}44` : "none",
                  }}
                />
              </button>
            )
          })}
        </div>

        {/* ── BOTTOM LEFT: Story text ── */}
        <div className="absolute bottom-20 left-8 md:left-14 z-20 max-w-lg pointer-events-none">
          <h2
            key={`t${sceneIdx}`}
            className="font-extrabold leading-[0.88] mb-5 animate-fade-up"
            style={{
              fontSize:      "clamp(2.4rem, 5vw, 4.5rem)",
              fontFamily:    "'OCMikola', sans-serif",
              whiteSpace:    "pre-line",
              letterSpacing: "-0.025em",
            }}
          >
            {scene.title}
          </h2>
          <p
            key={`b${sceneIdx}`}
            className="text-gray-400 leading-relaxed animate-fade-up"
            style={{ animationDelay: "80ms", fontSize: "clamp(0.875rem, 1.35vw, 1rem)", maxWidth: "360px" }}
          >
            {scene.body}
          </p>

          {/* Agent stat pill — integrated, not floating */}
          {activeAgent && sceneIdx >= 2 && (
            <div
              key={`stat${sceneIdx}`}
              className="mt-5 inline-flex items-center gap-3 animate-fade-up"
              style={{ animationDelay: "130ms" }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                style={{ background: activeColor, boxShadow: `0 0 6px ${activeColor}` }}
              />
              <span className="font-mono font-bold text-sm" style={{ color: activeColor }}>
                {activeAgent.stat}
              </span>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.28)" }}>
                · {activeAgent.desc}
              </span>
            </div>
          )}

          {sceneIdx === SCENES.length - 1 && (
            <a
              href="/signup"
              className="inline-flex items-center gap-3 mt-8 px-7 py-3.5 rounded-xl text-white font-bold text-sm hover:-translate-y-0.5 transition-transform animate-fade-up pointer-events-auto"
              style={{
                background:  "linear-gradient(135deg, #4f46e5, #7c3aed)",
                boxShadow:   "0 0 40px rgba(124,58,237,0.45)",
                animationDelay: "180ms",
              }}
            >
              Start free — no card required
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M7.5 2.5l4.5 4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>

        {/* ── BOTTOM RIGHT: Mute toggle + large scene number ── */}
        <button
          onClick={toggleMute}
          className="absolute bottom-24 right-8 md:right-14 z-30 flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase transition-opacity hover:opacity-100"
          style={{ color: muted ? "rgba(255,255,255,0.20)" : "rgba(124,58,237,0.65)" }}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          )}
          {muted ? "muted" : "sound on"}
        </button>

        <div className="absolute bottom-16 right-8 md:right-14 z-20 pointer-events-none select-none">
          <p
            key={`n${sceneIdx}`}
            className="font-extrabold animate-fade-up"
            style={{
              fontSize:      "clamp(5rem, 14vw, 11rem)",
              fontFamily:    "'OCMikola', sans-serif",
              lineHeight:    1,
              color:         "rgba(255,255,255,0.04)",
              letterSpacing: "-0.04em",
            }}
          >
            0{sceneIdx + 1}
          </p>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-px z-20" style={{ background: "rgba(124,58,237,0.12)" }}>
          <div
            className="h-full transition-all duration-700"
            style={{
              width:      `${((sceneIdx + 1) / SCENES.length) * 100}%`,
              background: `linear-gradient(90deg, #4f46e5, ${AGENT_COLORS[Math.min(sceneIdx, 7)]})`,
              boxShadow:  `0 0 8px ${AGENT_COLORS[Math.min(sceneIdx, 7)]}`,
            }}
          />
        </div>
      </div>
    </section>
  )
}
