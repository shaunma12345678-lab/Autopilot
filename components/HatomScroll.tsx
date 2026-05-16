"use client"

import { useRef, useMemo, useEffect, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Stars, Sparkles } from "@react-three/drei"
import * as THREE from "three"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/* ─── 8 Cinematic Scenes ──────────────────────────────────────── */

const SCENES = [
  {
    label: "CHAPTER 01 — DORMANT",
    title: "Every business has\nan untapped potential.",
    body: "You're working 14-hour days. Marketing still feels like guesswork. The tools exist — but nothing connects them into a system.",
  },
  {
    label: "CHAPTER 02 — THE SIGNAL",
    title: "A new kind\nof intelligence.",
    body: "Not another dashboard. Not another tool to manage. A living system that learns, decides, and acts on its own.",
  },
  {
    label: "CHAPTER 03 — IGNITION",
    title: "AutoPilot,\nactivated.",
    body: "The moment you onboard, everything changes. 8 specialized AI agents come online simultaneously and begin working immediately.",
  },
  {
    label: "CHAPTER 04 — CONTENT",
    title: "Never write\na post again.",
    body: "Content Agent delivers 47 on-brand posts per month across every platform. Reputation Agent answers every review in under 5 minutes.",
  },
  {
    label: "CHAPTER 05 — GROWTH",
    title: "Your pipeline,\nalways full.",
    body: "Lead Gen Agent sends 50 personalized outreach sequences monthly. SEO Agent publishes 4 posts targeting local keywords that rank.",
  },
  {
    label: "CHAPTER 06 — REVENUE",
    title: "Every customer\nhandled.",
    body: "Sales Agent generates scripts, proposals, and objection handlers in 60 seconds. Support Agent handles 24/7 customer replies.",
  },
  {
    label: "CHAPTER 07 — INTELLIGENCE",
    title: "The full picture,\nclear as day.",
    body: "Financial Agent delivers monthly P&L in plain English with 3 actionable recommendations. Brand Voice Agent powers all 8 agents.",
  },
  {
    label: "CHAPTER 08 — AUTOPILOT",
    title: "Your business\nruns itself.",
    body: "4.2 hours saved every single day. 3.8× more reviews in 90 days. $8,400 average monthly agency revenue. While you slept.",
  },
]

/* ─── Camera positions per scene ──────────────────────────────── */

const CAM_POS = [
  new THREE.Vector3(0,     0,    13.5),   // S0: dormant — far
  new THREE.Vector3(0,     0.5,   9.5),   // S1: approaching
  new THREE.Vector3(0,     0,     5.0),   // S2: burst — very close
  new THREE.Vector3(2.5,   1.0,   8.0),   // S3: content — off-axis
  new THREE.Vector3(-2.0,  1.5,   8.0),   // S4: growth — other side
  new THREE.Vector3(0,     2.5,   9.0),   // S5: revenue — top-down
  new THREE.Vector3(1.5,  -0.5,   7.0),   // S6: intelligence — low angle
  new THREE.Vector3(0,     0,    16.0),   // S7: cosmic pull-back
]

/* ─── Scene light colors ──────────────────────────────────────── */

const LIGHT_COLORS = [
  new THREE.Color("#1a1a4a"),   // S0: near-black blue
  new THREE.Color("#2d2060"),   // S1: blue-violet
  new THREE.Color("#ffffff"),   // S2: white burst
  new THREE.Color("#818cf8"),   // S3: indigo
  new THREE.Color("#a78bfa"),   // S4: violet
  new THREE.Color("#06b6d4"),   // S5: cyan
  new THREE.Color("#f59e0b"),   // S6: amber
  new THREE.Color("#6366f1"),   // S7: indigo cosmos
]

/* ─── Agent satellites ────────────────────────────────────────── */

const AGENT_COLORS = [
  "#6366f1", "#10b981", "#8b5cf6", "#06b6d4",
  "#f59e0b", "#ec4899", "#f97316", "#14b8a6",
]

const SAT_POS: [number, number, number][] = AGENT_COLORS.map((_, i) => {
  const angle = (i / AGENT_COLORS.length) * Math.PI * 2
  const r = 2.9
  return [Math.cos(angle) * r, Math.sin(angle * 2) * 0.5, Math.sin(angle) * r]
})

/* ─── Ring configs ────────────────────────────────────────────── */

const RINGS = [
  { rotation: [Math.PI / 2,       0,          0] as [number, number, number], r: 1.65, color: "#6366f1", speed:  0.42 },
  { rotation: [Math.PI / 5, Math.PI / 3,     0] as [number, number, number], r: 2.05, color: "#8b5cf6", speed: -0.30 },
  { rotation: [-Math.PI / 4, Math.PI / 4,    0] as [number, number, number], r: 2.40, color: "#06b6d4", speed:  0.54 },
]

/* ─── Module-level mutable state (GSAP ↔ R3F bridge) ─────────── */
const _prog   = { current: 0 }
const _sceneI = { current: 0 }

/* ─── Orb vertex shader — FBM surface displacement ───────────── */

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

/* ─── Orb fragment shader — fresnel + FBM surface ────────────── */

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

/* ─── Particle shaders ────────────────────────────────────────── */

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

/* ─── 3D Scene ─────────────────────────────────────────────────── */

const PARTICLE_COUNT = 1200

function JourneyScene() {
  const { camera } = useThree()

  const orbRef      = useRef<THREE.Mesh>(null)
  const satGroupRef = useRef<THREE.Group>(null)
  const satRefs     = useRef<THREE.Mesh[]>([])
  const ring0       = useRef<THREE.Mesh>(null)
  const ring1       = useRef<THREE.Mesh>(null)
  const ring2       = useRef<THREE.Mesh>(null)
  const ringRefs    = [ring0, ring1, ring2]
  const ptLight     = useRef<THREE.PointLight>(null)
  const tempCam     = useRef(new THREE.Vector3())

  /* Orb material */
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

  /* Glow halo layers — fake bloom via BackSide additive spheres */
  const halo0 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#6366f1", transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const halo1 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#818cf8", transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const halo2 = useMemo(() => new THREE.MeshBasicMaterial({ color: "#c4b5fd", transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }), [])

  /* Particles */
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

  /* Connection lines */
  const lineGeo = useMemo(() => {
    const pts: number[] = []
    SAT_POS.forEach(([x, y, z]) => pts.push(0, 0, 0, x, y, z))
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])

  const lineMat = useMemo(() => new THREE.LineBasicMaterial({
    color: "#4f46e5", transparent: true, opacity: 0,
  }), [])

  useEffect(() => () => {
    orbMat.dispose(); halo0.dispose(); halo1.dispose(); halo2.dispose()
    partGeo.dispose(); partMat.dispose()
    lineGeo.dispose(); lineMat.dispose()
  }, [orbMat, halo0, halo1, halo2, partGeo, partMat, lineGeo, lineMat])

  useFrame(({ clock }) => {
    const t  = clock.getElapsedTime()
    const p  = _prog.current
    const si = _sceneI.current

    /* ── Shader time ── */
    orbMat.uniforms.uTime.value = t
    orbMat.uniforms.uCamPos.value.copy(camera.position)
    partMat.uniforms.uTime.value = t

    /* ── Camera path lerp ── */
    const rawIdx = p * (CAM_POS.length - 1)
    const idx0   = Math.floor(rawIdx)
    const idx1   = Math.min(idx0 + 1, CAM_POS.length - 1)
    tempCam.current.lerpVectors(CAM_POS[idx0], CAM_POS[idx1], rawIdx - idx0)
    camera.position.lerp(tempCam.current, 0.055)
    camera.lookAt(0, 0, 0)

    /* ── Burst spike at scene 2 (p ≈ 0.25) ── */
    const burstFac = Math.max(0, 1.0 - Math.abs(p - 0.25) * 38)

    /* ── Orb opacity + scale + morph ── */
    const baseOpacity = THREE.MathUtils.smoothstep(p, 0.05, 0.28)
    const orbOpacity  = Math.max(baseOpacity, burstFac)
    orbMat.uniforms.uOpacity.value = orbOpacity
    orbMat.uniforms.uMorph.value   = THREE.MathUtils.smoothstep(burstFac, 0.0, 0.55)

    if (orbRef.current) {
      const baseScale  = 0.05 + baseOpacity * 1.15
      const burstScale = burstFac * 1.9
      orbRef.current.scale.setScalar(baseScale + burstScale)
      orbRef.current.rotation.y += 0.003
    }

    /* ── Glow halos scale with orb ── */
    halo0.opacity = orbOpacity * 0.09
    halo1.opacity = orbOpacity * 0.055
    halo2.opacity = orbOpacity * 0.030

    /* ── Particles: chaos → orbit ── */
    partMat.uniforms.uProgress.value = THREE.MathUtils.smoothstep(p, 0.05, 0.55)

    /* ── Satellites: sequential activation from scene 3 ── */
    if (satGroupRef.current) {
      satGroupRef.current.rotation.y = t * 0.10
      satRefs.current.forEach((mesh, i) => {
        if (!mesh) return
        const s0 = 0.31 + (i / 8) * 0.44
        const sv = THREE.MathUtils.smoothstep(p, s0, s0 + 0.06)
        mesh.scale.setScalar(sv)
        const spr = mesh.parent?.children[1] as THREE.Sprite | undefined
        if (spr?.material) (spr.material as THREE.SpriteMaterial).opacity = sv * 0.42
      })
    }

    /* ── Connection lines: appear + pulse ── */
    const lineBase = THREE.MathUtils.smoothstep(p, 0.50, 0.66) * 0.22
    lineMat.opacity = lineBase * (0.65 + 0.35 * Math.sin(t * 1.6))

    /* ── Rings: progressive reveal (scenes 3, 4, 5) ── */
    const ringThresholds = [0.375, 0.50, 0.625]
    ringRefs.forEach((ref, i) => {
      if (!ref.current) return
      ref.current.rotation.z = t * RINGS[i].speed;
      (ref.current.material as THREE.MeshBasicMaterial).opacity =
        THREE.MathUtils.smoothstep(p, ringThresholds[i], ringThresholds[i] + 0.04) * 0.38
    })

    /* ── Dynamic scene light: color shifts + burst spike ── */
    if (ptLight.current) {
      const c0   = LIGHT_COLORS[si]             ?? LIGHT_COLORS[0]
      const c1   = LIGHT_COLORS[Math.min(si + 1, LIGHT_COLORS.length - 1)]
      const frac = THREE.MathUtils.clamp(p * SCENES.length - si, 0, 1)
      ptLight.current.color.lerpColors(c0, c1, frac)
      ptLight.current.intensity = 2.2 + burstFac * 5.0
    }
  })

  return (
    <>
      <Stars radius={65} depth={50} count={2200} factor={3.5} saturation={0.4} fade speed={0.4} />
      <Sparkles count={90} size={1.3} scale={6} speed={0.15} color="#818cf8" noise={0.9} />

      {/* Central orb */}
      <mesh ref={orbRef}>
        <sphereGeometry args={[1.2, 96, 96]} />
        <primitive object={orbMat} attach="material" />
      </mesh>

      {/* Glow halo layers — fake bloom */}
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

      {/* Particles */}
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
            <sprite scale={[1.0, 1.0, 1.0]}>
              <spriteMaterial
                color={AGENT_COLORS[i]}
                transparent opacity={0}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        ))}
      </group>

      {/* Lighting */}
      <ambientLight intensity={0.07} />
      <pointLight ref={ptLight} position={[4, 4, 4]} intensity={2.2} color="#818cf8" />
      <pointLight position={[-4, -3, -3]} intensity={0.75} color="#a78bfa" />
      <pointLight position={[0, 0, 6]}   intensity={0.30} color="#ffffff" />
    </>
  )
}

/* ─── HatomScroll ─────────────────────────────────────────────── */

export default function HatomScroll() {
  const sectionRef  = useRef<HTMLDivElement>(null)
  const lastBeatRef = useRef(-1)
  const [sceneIdx, setSceneIdx] = useState(0)

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

  const scene = SCENES[sceneIdx]

  return (
    <section ref={sectionRef} id="journey" style={{ height: "800vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden" style={{ background: "#030712" }}>

        {/* R3F Canvas */}
        <div className="absolute inset-0">
          <Canvas
            camera={{ position: [0, 0, 13.5], fov: 46 }}
            gl={{ antialias: true, alpha: false }}
            style={{ width: "100%", height: "100%" }}
          >
            <JourneyScene />
          </Canvas>
        </div>

        {/* Hatom-style vignette — darkens edges, centers the 3D */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: "radial-gradient(ellipse 75% 75% at 50% 50%, transparent 30%, rgba(3,7,18,0.72) 100%)",
          }}
        />

        {/* Chapter label — top left */}
        <div className="absolute top-8 left-8 md:left-14 z-20">
          <p
            key={scene.label}
            className="text-xs font-bold tracking-[0.3em] uppercase animate-fade-up"
            style={{ color: "rgba(99,102,241,0.65)" }}
          >
            {scene.label}
          </p>
        </div>

        {/* Scene progress dots — top right */}
        <div className="absolute top-8 right-8 md:right-14 z-20 flex items-center gap-2">
          {SCENES.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width:      i === sceneIdx ? "24px" : "6px",
                height:     "6px",
                background: i === sceneIdx ? "#6366f1" : "rgba(255,255,255,0.10)",
              }}
            />
          ))}
        </div>

        {/* Main text — bottom left, OCMikola, Hatom layout */}
        <div className="absolute bottom-20 left-8 md:left-14 z-20 max-w-xl pointer-events-none">
          <h2
            key={`t${sceneIdx}`}
            className="font-extrabold leading-[0.9] mb-5 animate-fade-up"
            style={{
              fontSize:      "clamp(2.2rem, 4.5vw, 4rem)",
              fontFamily:    "'OCMikola', sans-serif",
              whiteSpace:    "pre-line",
              letterSpacing: "-0.02em",
            }}
          >
            {scene.title}
          </h2>
          <p
            key={`b${sceneIdx}`}
            className="text-gray-400 leading-relaxed animate-fade-up"
            style={{
              animationDelay: "90ms",
              fontSize:       "clamp(0.875rem, 1.4vw, 1rem)",
              maxWidth:       "380px",
            }}
          >
            {scene.body}
          </p>

          {/* CTA on last scene — left side like Hatom */}
          {sceneIdx === SCENES.length - 1 && (
            <a
              href="/signup"
              className="inline-flex items-center gap-3 mt-8 px-7 py-3.5 rounded-xl text-white font-bold text-sm shadow-2xl shadow-indigo-900/60 hover:-translate-y-0.5 transition-transform animate-fade-up"
              style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", animationDelay: "180ms" }}
            >
              Start free — no card required
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M7.5 2.5l4.5 4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>

        {/* Large translucent scene number — bottom right, OCMikola */}
        <div className="absolute bottom-16 right-8 md:right-14 z-20 pointer-events-none select-none">
          <p
            key={`n${sceneIdx}`}
            className="font-extrabold animate-fade-up"
            style={{
              fontSize:   "clamp(5rem, 14vw, 11rem)",
              fontFamily: "'OCMikola', sans-serif",
              lineHeight:  1,
              color:       "rgba(255,255,255,0.05)",
              letterSpacing: "-0.04em",
            }}
          >
            0{sceneIdx + 1}
          </p>
        </div>

        {/* Progress bar — bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-white/[0.04] z-20">
          <div
            className="h-full bg-indigo-500/45 transition-all duration-700"
            style={{ width: `${((sceneIdx + 1) / SCENES.length) * 100}%` }}
          />
        </div>
      </div>
    </section>
  )
}
