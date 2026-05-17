"use client"

import { useRef, useMemo, useEffect, useState, useCallback } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Stars, Sparkles } from "@react-three/drei"
import * as THREE from "three"

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

/* ─── Camera positions ─────────────────────────────────────── */
const CAM_POS = [
  new THREE.Vector3(0,     10.5, 24.0),
  new THREE.Vector3(0,      5.5, 17.5),
  new THREE.Vector3(0,      0.5,  7.5),
  new THREE.Vector3( 4.8,   2.0,  9.5),
  new THREE.Vector3(-4.8,   2.0, 10.0),
  new THREE.Vector3(0,      6.0, 13.0),
  new THREE.Vector3( 1.8,   0.5,  6.0),
  new THREE.Vector3(0,      3.0, 26.0),
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
  { rotation: [Math.PI / 2, 0, 0] as [number, number, number],            r: 1.65, color: "#6366f1", speed:  0.42 },
  { rotation: [Math.PI / 5, Math.PI / 3, 0] as [number, number, number],  r: 2.05, color: "#8b5cf6", speed: -0.30 },
  { rotation: [-Math.PI / 4, Math.PI / 4, 0] as [number, number, number], r: 2.40, color: "#06b6d4", speed:  0.54 },
]

const AGENT_REVEAL_P = AGENT_COLORS.map((_, i) => 0.22 + (i / 8) * 0.55)

/* ─── Module-level mutable state (scroll ↔ R3F bridge) ─────── */
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
    vec2 uvScaled = vUv * 32.0;
    vec2 g = fract(uvScaled);
    float d = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
    float line = 1.0 - smoothstep(0.0, 0.044, d);
    float p1 = 0.55 + 0.45 * sin(uTime * 1.1 + vUv.x * 14.0 - vUv.y * 9.0);
    float p2 = 0.50 + 0.50 * sin(uTime * 0.42 + vUv.y * 6.0 + vUv.x * 4.0);
    vec3 col = mix(vec3(0.08, 0.04, 0.35), vec3(0.55, 0.38, 1.0), line * p1);
    col += vec3(0.02, 0.18, 0.55) * line * p2 * 0.40;
    float edgeFade = smoothstep(0.0, 0.14, min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y)));
    float alpha = line * (0.55 + p1 * 0.45) * edgeFade * uFade;
    gl_FragColor = vec4(col, alpha);
  }
`

/* ═══════════════════════════════════════════════════════════
   HELIX DATA STREAMS
═══════════════════════════════════════════════════════════ */

const HELIX_COUNT = 3
const HELIX_PTS   = 300
const HELIX_TOTAL = HELIX_COUNT * HELIX_PTS

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
      uniforms: { uTime: { value: 0 }, uProgress: { value: 0 } },
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
   SCENE BACKGROUND
═══════════════════════════════════════════════════════════ */

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
    float rad = 1.0 - length(vUv - 0.5) * 1.6;
    col      += uColorB * max(0.0, rad * rad) * 0.18;
    gl_FragColor = vec4(col, 1.0);
  }
`

const BG_PALETTES: Array<[THREE.Color, THREE.Color]> = [
  [new THREE.Color(0x010110), new THREE.Color(0x1a1055)],
  [new THREE.Color(0x010115), new THREE.Color(0x2d1a7a)],
  [new THREE.Color(0x050210), new THREE.Color(0x5a1a8a)],
  [new THREE.Color(0x010112), new THREE.Color(0x1a2880)],
  [new THREE.Color(0x010112), new THREE.Color(0x2a1870)],
  [new THREE.Color(0x010213), new THREE.Color(0x083060)],
  [new THREE.Color(0x020111), new THREE.Color(0x3a1040)],
  [new THREE.Color(0x010112), new THREE.Color(0x0e0e55)],
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
   CITY — 32×32 grid
═══════════════════════════════════════════════════════════ */

const CITY_SIZE  = 32
const CITY_SPACE = 0.88
const CITY_Y     = -4.5
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
    const palette = [
      new THREE.Color("#0c0730"), new THREE.Color("#18094c"),
      new THREE.Color("#220c60"), new THREE.Color("#0a0528"),
      new THREE.Color("#2e1275"), new THREE.Color("#050318"),
    ]
    const accentCyan   = new THREE.Color("#062845")
    const accentViolet = new THREE.Color("#1a0858")
    const base         = new THREE.Color("#030112")
    const out: { h: number; color: THREE.Color }[] = []

    for (let row = 0; row < CITY_SIZE; row++) {
      for (let col = 0; col < CITY_SIZE; col++) {
        const dx   = (col / (CITY_SIZE - 1)) * 2 - 1
        const dz   = (row / (CITY_SIZE - 1)) * 2 - 1
        const dist = Math.sqrt(dx * dx + dz * dz)
        const boost = Math.max(0, 1 - dist * 0.55)
        const isTall = Math.random() > 0.72
        const h = isTall ? 0.6 + boost * 5.0 + Math.random() * 2.5 : 0.04 + Math.random() * 0.22
        const t = Math.min(1, h / 8.0)
        const r = Math.random()
        const target = r < 0.08 ? accentCyan : r < 0.15 ? accentViolet : palette[Math.floor(Math.random() * palette.length)]
        out.push({ h, color: base.clone().lerp(target, t * 0.92 + 0.08) })
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
      dummy.position.set((col - CITY_SIZE / 2) * CITY_SPACE, CITY_Y + d.h / 2, (row - CITY_SIZE / 2) * CITY_SPACE)
      dummy.scale.set(0.40, d.h, 0.40)
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
    const fade = THREE.MathUtils.smoothstep(_prog.current, 0.02, 0.12)
    cityShader.uniforms.uTime.value = t
    cityShader.uniforms.uFade.value = fade
    if (buildMatRef.current) buildMatRef.current.opacity = fade * 0.95
    if (gridMatRef.current)  gridMatRef.current.opacity  = fade * 0.30 * (0.7 + 0.3 * Math.sin(t * 0.55))
  })

  return (
    <>
      <mesh position={[0, CITY_Y - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CITY_SIZE * CITY_SPACE + 8, CITY_SIZE * CITY_SPACE + 8]} />
        <primitive object={cityShader} attach="material" />
      </mesh>
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial ref={gridMatRef} color="#4a38d8" transparent opacity={0} />
      </lineSegments>
      <instancedMesh ref={buildMeshRef} args={[undefined, undefined, CITY_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial ref={buildMatRef} transparent opacity={0} vertexColors />
      </instancedMesh>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   WINDOW LIGHTS
═══════════════════════════════════════════════════════════ */

function WindowLights() {
  const matRef = useRef<THREE.PointsMaterial>(null)

  const geo = useMemo(() => {
    const count     = 1200
    const positions = new Float32Array(count * 3)
    const colors    = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const row  = Math.floor(Math.random() * CITY_SIZE)
      const col  = Math.floor(Math.random() * CITY_SIZE)
      const x    = (col - CITY_SIZE / 2) * CITY_SPACE
      const z    = (row - CITY_SIZE / 2) * CITY_SPACE
      const h    = Math.random() * 8.5 * (0.2 + 0.8 * Math.random())
      const off  = 0.20
      const side = Math.floor(Math.random() * 4)
      positions[i*3]   = x + (side === 0 ? off : side === 1 ? -off : (Math.random()-0.5)*0.38)
      positions[i*3+1] = CITY_Y + h
      positions[i*3+2] = z + (side === 2 ? off : side === 3 ? -off : (Math.random()-0.5)*0.38)
      const t = Math.random()
      if (t < 0.40)      { colors[i*3] = 0.90; colors[i*3+1] = 0.78; colors[i*3+2] = 1.00 }
      else if (t < 0.65) { colors[i*3] = 0.55; colors[i*3+1] = 0.20; colors[i*3+2] = 1.00 }
      else if (t < 0.82) { colors[i*3] = 0.06; colors[i*3+1] = 0.80; colors[i*3+2] = 1.00 }
      else               { colors[i*3] = 1.00; colors[i*3+1] = 0.12; colors[i*3+2] = 0.88 }
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
    matRef.current.opacity = fade * 0.72 * (0.88 + 0.12 * Math.sin(clock.getElapsedTime() * 1.1))
  })

  return (
    <points geometry={geo}>
      <pointsMaterial
        ref={matRef}
        size={0.10}
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
  const lookTarget  = useRef(new THREE.Vector3())

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

    const rawIdx = p * (CAM_POS.length - 1)
    const idx0   = Math.floor(rawIdx)
    const idx1   = Math.min(idx0 + 1, CAM_POS.length - 1)
    tempCam.current.lerpVectors(CAM_POS[idx0], CAM_POS[idx1], rawIdx - idx0)
    camera.position.lerp(tempCam.current, 0.055)

    let lookY: number
    if (p < 0.20) {
      lookY = THREE.MathUtils.lerp(-3.0, 0.0, p / 0.20)
    } else {
      lookY = THREE.MathUtils.lerp(0.0, -0.7, THREE.MathUtils.smoothstep(p, 0.35, 0.85))
    }
    lookTarget.current.set(0, lookY, 0)
    camera.lookAt(lookTarget.current)

    const burstFac   = Math.max(0, 1.0 - Math.abs(p - 0.25) * 38)
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
      ;(ref.current.material as THREE.MeshBasicMaterial).opacity =
        THREE.MathUtils.smoothstep(p, ringThresholds[i], ringThresholds[i] + 0.04) * 0.40
    })

    if (ptLight.current) {
      const c0   = LIGHT_COLORS[si] ?? LIGHT_COLORS[0]
      const c1   = LIGHT_COLORS[Math.min(si + 1, LIGHT_COLORS.length - 1)]
      const frac = THREE.MathUtils.clamp(p * SCENES.length - si, 0, 1)
      ptLight.current.color.lerpColors(c0, c1, frac)
      ptLight.current.intensity = 2.2 + burstFac * 5.0
    }

    if (accentLight.current && si >= 2) {
      tempColor.current.set(AGENT_COLORS[Math.min(si - 2, 7)])
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

      <mesh ref={orbRef}>
        <sphereGeometry args={[1.2, 96, 96]} />
        <primitive object={orbMat} attach="material" />
      </mesh>
      <mesh><sphereGeometry args={[1.55, 32, 32]} /><primitive object={halo0} attach="material" /></mesh>
      <mesh><sphereGeometry args={[2.10, 32, 32]} /><primitive object={halo1} attach="material" /></mesh>
      <mesh><sphereGeometry args={[3.00, 32, 32]} /><primitive object={halo2} attach="material" /></mesh>

      {RINGS.map((cfg, i) => (
        <mesh key={i} ref={ringRefs[i]} rotation={cfg.rotation}>
          <torusGeometry args={[cfg.r, 0.012, 16, 128]} />
          <meshBasicMaterial color={cfg.color} transparent opacity={0} />
        </mesh>
      ))}

      <points geometry={partGeo} material={partMat} />

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

      <ambientLight intensity={0.07} />
      <pointLight ref={ptLight}     position={[4, 4, 4]}    intensity={2.2}  color="#818cf8" />
      <pointLight                   position={[-4, -3, -3]} intensity={0.75} color="#a78bfa" />
      <pointLight                   position={[0, 0, 6]}    intensity={0.30} color="#ffffff" />
      <pointLight ref={accentLight} position={[0, 3, 5]}    intensity={0}    color="#6366f1" />
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   HATOMSCROLL — Hatom-style full-screen experience
   Fixed WebGL background + fixed scroll container
═══════════════════════════════════════════════════════════ */

export default function HatomScroll() {
  const scrollRef   = useRef<HTMLDivElement>(null)
  const lastIdxRef  = useRef(-1)
  const [sceneIdx, setSceneIdx]   = useState(0)
  const [count, setCount]         = useState(0)
  const [loaded, setLoaded]       = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [hidden, setHidden]       = useState(false)
  const [muted, setMuted]         = useState(false)

  /* Lock body scroll — we handle it ourselves */
  useEffect(() => {
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    return () => {
      document.documentElement.style.overflow = ""
      document.body.style.overflow = ""
    }
  }, [])

  /* Loader counter */
  useEffect(() => {
    let n = 0
    const id = setInterval(() => {
      n += Math.random() * 5 + 2
      if (n >= 100) { n = 100; clearInterval(id); setLoaded(true) }
      setCount(Math.floor(n))
    }, 55)
    return () => clearInterval(id)
  }, [])

  /* Dismiss loader with fade */
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

  /* Scroll tracking on fixed container */
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const p = scrollHeight > clientHeight ? scrollTop / (scrollHeight - clientHeight) : 0
      _prog.current = p
      const idx = Math.min(Math.floor(p * SCENES.length), SCENES.length - 1)
      _sceneI.current = idx
      if (idx !== lastIdxRef.current) {
        lastIdxRef.current = idx
        setSceneIdx(idx)
        import("@/lib/audio").then(({ audioEngine }) => audioEngine?.playBeat(idx))
      }
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => container.removeEventListener("scroll", onScroll)
  }, [])

  /* Jump to chapter */
  const jumpToChapter = useCallback((i: number) => {
    const container = scrollRef.current
    if (!container) return
    const total = container.scrollHeight - container.clientHeight
    container.scrollTo({ top: (i / SCENES.length) * total, behavior: "smooth" })
  }, [])

  /* Keyboard navigation */
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

  /* Mute toggle */
  const toggleMute = useCallback(() => {
    import("@/lib/audio").then(({ audioEngine }) => {
      if (!audioEngine) return
      const nowMuted = audioEngine.toggle()
      setMuted(!nowMuted)
    })
  }, [])

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>

      {/* ── Global styles ── */}
      <style>{`
        html, body { overflow: hidden !important; margin: 0; padding: 0; }
        @keyframes ap-blink { 0%,100%{opacity:.22} 50%{opacity:.65} }
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
          {/* Ghost counter */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(8rem, 28vw, 26rem)",
            color: "rgba(255,255,255,0.04)",
            lineHeight: 1, userSelect: "none", pointerEvents: "none",
          }}>
            {count}
          </div>

          {/* Top label */}
          <p style={{
            position: "absolute", top: "3.8194vw", left: "50%", transform: "translateX(-50%)",
            margin: 0,
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(0.55rem, 0.85vw, 0.9rem)",
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "0.32em", textTransform: "uppercase", whiteSpace: "nowrap",
          }}>
            Loading {SCENES.length} chapters
          </p>

          {/* Brand */}
          <p style={{
            margin: 0, position: "relative", zIndex: 1,
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(1.2rem, 3vw, 3.5rem)",
            color: loaded ? "#7c3aed" : "rgba(255,255,255,0.38)",
            letterSpacing: "0.18em", textTransform: "uppercase",
            transition: "color 0.9s",
          }}>
            AutoPilot
          </p>

          {/* Bottom hint */}
          <p style={{
            position: "absolute", bottom: "3.8194vw", left: "50%", transform: "translateX(-50%)",
            margin: 0,
            fontSize: "clamp(0.45rem, 0.62vw, 0.68rem)",
            color: loaded ? "rgba(255,255,255,0.22)" : "transparent",
            letterSpacing: "0.32em", textTransform: "uppercase", whiteSpace: "nowrap",
            transition: "color 0.6s",
          }}>
            AI Business Operating System
          </p>
        </div>
      )}

      {/* ══ WEBGL — fixed full-screen background ══ */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Canvas
          camera={{ position: [0, 10.5, 24.0], fov: 50 }}
          gl={{ antialias: true, alpha: false }}
          style={{ width: "100%", height: "100%" }}
        >
          <JourneyScene />
        </Canvas>
      </div>

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "radial-gradient(ellipse 75% 75% at 50% 50%, transparent 30%, rgba(0,0,0,0.62) 100%)",
      }} />

      {/* ══ HEADER ══ */}
      <header style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "3.8194vw",
        pointerEvents: "none",
      }}>
        <span style={{
          fontFamily: "'OCMikola', sans-serif",
          fontSize: "clamp(0.9rem, 1.2vw, 1.5rem)",
          color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          AutoPilot
        </span>
        <a
          href="/signup"
          style={{
            pointerEvents: "auto",
            fontFamily: "'OCMikola', sans-serif",
            fontSize: "clamp(0.5rem, 0.7vw, 0.75rem)",
            color: "#7c3aed", letterSpacing: "0.28em", textTransform: "uppercase",
            textDecoration: "none",
            borderBottom: "1px solid rgba(124,58,237,0.35)",
            paddingBottom: "0.15em",
          }}
        >
          Start Free →
        </a>
      </header>

      {/* ══ PAGINATION DOTS — hatom-style 2px, top center ══ */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex", alignItems: "flex-start",
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
                background: isActive ? "#7c3aed" : "rgba(255,255,255,0.28)",
                boxShadow: isActive ? "0 0 8px #7c3aed, 0 0 20px rgba(124,58,237,0.55)" : "none",
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
          zIndex: 2,
          scrollbarWidth: "none",
        } as React.CSSProperties}
      >
        {SCENES.map((s, i) => {
          const isLeft  = i % 2 === 0
          const col     = AGENT_COLORS[i] ?? "#7c3aed"
          const caption = s.label.split(" — ")[1]

          return (
            <section key={i} style={{ height: "100vh", position: "relative", pointerEvents: "none" }}>

              {/* ── Text content — alternating left / right ── */}
              <div style={{
                position: "absolute",
                top: "50%", transform: "translateY(-50%)",
                ...(isLeft ? { left: "10.625vw" } : { right: "8.1944vw" }),
                maxWidth: "34vw",
                pointerEvents: "auto",
              }}>
                {/* Phase caption badge */}
                <div style={{
                  display: "inline-block",
                  background: col,
                  color: "#000",
                  fontFamily: "'OCMikola', sans-serif",
                  fontSize: "clamp(0.5rem, 0.65vw, 0.72rem)",
                  fontWeight: 700,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  padding: "0.45em 1.15em 0.38em",
                  marginBottom: "2vw",
                }}>
                  {caption}
                </div>

                {/* Title */}
                <h2 style={{
                  fontFamily: "'OCMikola', sans-serif",
                  fontSize: "clamp(1.6rem, 2.9166vw, 4.2rem)",
                  textTransform: "uppercase",
                  letterSpacing: "-0.025em",
                  lineHeight: 0.92,
                  color: "#fff",
                  margin: "0 0 1.8vw 0",
                  whiteSpace: "pre-line",
                }}>
                  {s.title.toUpperCase()}
                </h2>

                {/* Body */}
                <p style={{
                  fontSize: "clamp(0.72rem, 0.9722vw, 1rem)",
                  color: "rgba(255,255,255,0.45)",
                  lineHeight: 1.75,
                  margin: 0,
                  ...(isLeft ? {} : { textAlign: "right" as const }),
                }}>
                  {s.body}
                </p>

                {/* CTA on final chapter */}
                {i === SCENES.length - 1 && (
                  <a
                    href="/signup"
                    style={{
                      display: "inline-block", marginTop: "2.8vw",
                      padding: "1.1em 3.2em",
                      background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                      color: "#fff",
                      fontFamily: "'OCMikola', sans-serif",
                      fontSize: "clamp(0.55rem, 0.75vw, 0.82rem)",
                      letterSpacing: "0.28em", textTransform: "uppercase",
                      textDecoration: "none",
                      boxShadow: "0 0 40px rgba(124,58,237,0.42)",
                    }}
                  >
                    Start Free
                  </a>
                )}
              </div>

              {/* Ghosted chapter number */}
              <div style={{
                position: "absolute",
                bottom: "4.5vw",
                ...(isLeft ? { right: "8.1944vw" } : { left: "10.625vw" }),
                fontFamily: "'OCMikola', sans-serif",
                fontSize: "clamp(5rem, 12vw, 13rem)",
                color: "rgba(255,255,255,0.03)",
                lineHeight: 1, letterSpacing: "-0.04em",
                userSelect: "none", pointerEvents: "none",
              }}>
                0{i + 1}
              </div>

              {/* Scroll prompt — first section only */}
              {i === 0 && (
                <div style={{
                  position: "absolute", bottom: "3.8194vw", left: "50%", transform: "translateX(-50%)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "0.7vw",
                  pointerEvents: "none",
                }}>
                  <p style={{
                    margin: 0, fontSize: "clamp(0.45rem, 0.58vw, 0.62rem)",
                    letterSpacing: "0.35em", textTransform: "uppercase",
                    color: "rgba(255,255,255,0.25)",
                  }}>
                    Scroll to discover
                  </p>
                  <svg
                    width="8" height="13" viewBox="0 0 8 13" fill="none"
                    style={{ animation: "ap-blink 1.8s ease-in-out infinite" }}
                  >
                    <path d="M4 0v9M1 6.5L4 10l3-3.5" stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* ══ PROGRESS BAR ══ */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", zIndex: 20,
        background: "rgba(124,58,237,0.1)",
      }}>
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
          position: "absolute", bottom: "3.8194vw", right: "3.8194vw",
          zIndex: 20,
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "0.6vw",
          color: muted ? "rgba(255,255,255,0.18)" : "rgba(124,58,237,0.6)",
          fontSize: "clamp(0.45rem, 0.58vw, 0.62rem)",
          letterSpacing: "0.25em", textTransform: "uppercase",
          fontFamily: "'OCMikola', sans-serif",
          transition: "color 0.3s",
        }}
      >
        {muted ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11 5L6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
        {muted ? "Muted" : "Sound"}
      </button>

      {/* ══ KEYBOARD HINT — first chapter ══ */}
      {sceneIdx === 0 && !dismissed && (
        <div style={{
          position: "absolute", bottom: "calc(3.8194vw + 2rem)", left: "50%", transform: "translateX(-50%)",
          zIndex: 20, pointerEvents: "none",
          display: "flex", alignItems: "center", gap: "0.5vw",
          color: "rgba(255,255,255,0.18)",
          fontSize: "clamp(0.4rem, 0.52vw, 0.58rem)",
          letterSpacing: "0.22em", textTransform: "uppercase",
          fontFamily: "'OCMikola', sans-serif",
        }}>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1" />
            <path d="M6 4v4M4 6l2 2 2-2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Arrow keys or scroll
        </div>
      )}
    </div>
  )
}
