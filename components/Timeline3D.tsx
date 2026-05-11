"use client"

import { useRef, useEffect } from "react"
import Link from "next/link"
import * as THREE from "three"

const MILESTONES = [
  {
    day: "Day 1", label: "AI team goes live",
    desc: "Brand Voice Agent profiles your business in 2 minutes — tone, personality, audience locked. Every agent knows exactly who you are.",
    metric: "2 min", sub: "to deploy",
    color: new THREE.Color(0.388, 0.400, 0.945), hex: "#6366f1", rgb: "99,102,241",
  },
  {
    day: "Day 2", label: "First content drops",
    desc: "Seven on-brand posts queue for review. One review response is already drafted for your newest Google listing.",
    metric: "7 posts", sub: "ready to approve",
    color: new THREE.Color(0.545, 0.361, 0.965), hex: "#8b5cf6", rgb: "139,92,246",
  },
  {
    day: "Week 1", label: "Leads start moving",
    desc: "Personalized cold sequences hit 12 prospects. Three book calls without a single follow-up from you.",
    metric: "3 calls", sub: "booked automatically",
    color: new THREE.Color(0.024, 0.714, 0.831), hex: "#06b6d4", rgb: "6,182,212",
  },
  {
    day: "Month 1", label: "Reputation rebounds",
    desc: "Every review answered in under 5 minutes. Google rating climbs from 4.1 to 4.7. New customers cite your reviews.",
    metric: "4.7 ★", sub: "Google rating",
    color: new THREE.Color(0.063, 0.725, 0.506), hex: "#10b981", rgb: "16,185,129",
  },
  {
    day: "Month 2", label: "Reports go out",
    desc: "AutoPilot sends a plain-English performance report for each client. Revenue up. Reviews up. Leads in. They renew. Every time.",
    metric: "94%", sub: "client renewal rate",
    color: new THREE.Color(0.961, 0.620, 0.043), hex: "#f59e0b", rgb: "245,158,11",
  },
  {
    day: "Month 3", label: "Compounding returns",
    desc: "SEO posts rank on page 1. Social following grew 340%. Referrals arrive without asking. The flywheel is at full speed.",
    metric: "+31%", sub: "avg revenue growth",
    color: new THREE.Color(0.925, 0.282, 0.600), hex: "#ec4899", rgb: "236,72,153",
  },
]

// ── Vertex Shader ──────────────────────────────────────────────────────────────
const VERT_PARTICLES = /* glsl */`
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uTime;
  void main() {
    vColor = aColor;
    float pulse = sin(uTime * 1.2 + aPhase) * 0.3 + 0.7;
    vAlpha = pulse * 0.6;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * pulse * (250.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

// ── Fragment Shader ────────────────────────────────────────────────────────────
const FRAG_PARTICLES = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`

// ── Background nebula shader ───────────────────────────────────────────────────
const VERT_BG = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const FRAG_BG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uScroll;
  uniform vec2 uMouse;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1,0)), u.x),
      mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = p * 2.3 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.07 + uScroll * 0.4;

    // Drifting nebula layers
    float n1 = fbm(uv * 2.5 + vec2(t, t * 0.7) + uMouse * 0.08);
    float n2 = fbm(uv * 4.0 - vec2(t * 0.6, t) + vec2(3.1, 7.4));
    float n3 = fbm(uv * 1.8 + vec2(-t * 0.4, t * 0.5) + vec2(8.3, 2.1));

    // Nebula colors: indigo + violet + cyan + deep space
    vec3 c1 = vec3(0.12, 0.10, 0.35) * n1 * 1.8; // indigo nebula
    vec3 c2 = vec3(0.08, 0.04, 0.28) * n2 * 1.4; // deep violet
    vec3 c3 = vec3(0.00, 0.10, 0.25) * n3 * 1.2; // cyan tint
    vec3 stars_col = vec3(0.6, 0.65, 0.9);

    // Star field (multiple layers)
    float stars = 0.0;
    for (float i = 1.0; i <= 3.0; i++) {
      vec2 sg = fract(uv * (80.0 * i) + vec2(t * 0.02 * i, 0.0)) - 0.5;
      float star = 1.0 - smoothstep(0.0, 0.015 / i, length(sg));
      stars += star * (0.4 / i);
    }

    vec3 col = vec3(0.012, 0.016, 0.055) + c1 + c2 + c3;
    col += stars_col * stars * 0.7;

    // Scroll-driven radial vortex brightening
    float vortex = 1.0 - length(uv - 0.5) * 1.2;
    col += vec3(0.05, 0.03, 0.15) * max(0.0, vortex) * uScroll;

    gl_FragColor = vec4(col, 1.0);
  }
`

// ── Line (neural connections) shader ──────────────────────────────────────────
const VERT_LINE = /* glsl */`
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const FRAG_LINE = /* glsl */`
  varying float vAlpha;
  uniform vec3 uColor;
  void main() { gl_FragColor = vec4(uColor, vAlpha); }
`

export default function Timeline3D() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const mount = mountRef.current
    const section = sectionRef.current
    if (!mount || !section) return

    // ── Scene Setup ──────────────────────────────────────────────────────────
    const W = mount.clientWidth
    const H = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.setClearColor(0x030712, 1)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
    camera.position.set(0, 0, 5)

    // ── Background Nebula Plane ───────────────────────────────────────────────
    const bgGeo = new THREE.PlaneGeometry(2, 2)
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: VERT_BG,
      fragmentShader: FRAG_BG,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      },
      depthTest: false,
    })
    const bgMesh = new THREE.Mesh(bgGeo, bgMat)
    bgMesh.renderOrder = -1
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1)
    const bgScene = new THREE.Scene()
    bgScene.add(bgMesh)

    // ── Floating Particles ────────────────────────────────────────────────────
    const NPTS = 2400
    const positions = new Float32Array(NPTS * 3)
    const sizes = new Float32Array(NPTS)
    const phases = new Float32Array(NPTS)
    const colors = new Float32Array(NPTS * 3)
    const PALETTE = [
      [0.388, 0.400, 0.945],
      [0.545, 0.361, 0.965],
      [0.024, 0.714, 0.831],
      [0.063, 0.725, 0.506],
    ]
    for (let i = 0; i < NPTS; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 22
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18
      sizes[i] = Math.random() * 2.2 + 0.3
      phases[i] = Math.random() * Math.PI * 2
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2]
    }
    const ptGeo = new THREE.BufferGeometry()
    ptGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    ptGeo.setAttribute("aSize",    new THREE.BufferAttribute(sizes, 1))
    ptGeo.setAttribute("aPhase",   new THREE.BufferAttribute(phases, 1))
    ptGeo.setAttribute("aColor",   new THREE.BufferAttribute(colors, 3))
    const ptMat = new THREE.ShaderMaterial({
      vertexShader: VERT_PARTICLES,
      fragmentShader: FRAG_PARTICLES,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
    })
    scene.add(new THREE.Points(ptGeo, ptMat))

    // ── Milestone Orbs (3D glowing spheres) ───────────────────────────────────
    const ORB_Z = 1.5 // push orbs toward camera
    const orbMeshes: THREE.Mesh[] = []
    const orbPositions = MILESTONES.map((m, i) => {
      const angle = (i / (MILESTONES.length - 1) - 0.5) * Math.PI * 0.7
      const x = Math.sin(angle) * 3.5
      const y = -i * 1.1 + 2.5
      return new THREE.Vector3(x, y, ORB_Z)
    })

    MILESTONES.forEach((m, i) => {
      const geo = new THREE.SphereGeometry(0.18, 32, 32)
      const mat = new THREE.MeshBasicMaterial({ color: m.color })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(orbPositions[i])
      scene.add(mesh)
      orbMeshes.push(mesh)

      // Glow sprite
      const spriteMat = new THREE.SpriteMaterial({
        color: m.color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const sprite = new THREE.Sprite(spriteMat)
      sprite.scale.setScalar(1.2)
      sprite.position.copy(orbPositions[i])
      scene.add(sprite)
    })

    // ── Connection Lines ──────────────────────────────────────────────────────
    for (let i = 0; i < MILESTONES.length - 1; i++) {
      const pts = []
      const a = orbPositions[i], b = orbPositions[i + 1]
      const steps = 40
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const mid = new THREE.Vector3().lerpVectors(a, b, t)
        mid.x += Math.sin(t * Math.PI) * 0.5
        pts.push(mid)
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
      const alphas = new Float32Array(pts.length)
      pts.forEach((_, j) => {
        const e = j / (pts.length - 1)
        alphas[j] = Math.sin(e * Math.PI) * 0.4
      })
      lineGeo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1))
      const c = MILESTONES[i].color
      const lineMat = new THREE.ShaderMaterial({
        vertexShader: VERT_LINE,
        fragmentShader: FRAG_LINE,
        uniforms: { uColor: { value: new THREE.Vector3(c.r, c.g, c.b) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      scene.add(new THREE.Line(lineGeo, lineMat))
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let scrollProgress = 0
    let targetScroll = 0
    let mouseX = 0, mouseY = 0
    let targetMouseX = 0, targetMouseY = 0
    let raf: number
    let t = 0
    let W2 = W, H2 = H

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      W2 = mount.clientWidth
      H2 = mount.clientHeight
      renderer.setSize(W2, H2)
      camera.aspect = W2 / H2
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    // ── Scroll ────────────────────────────────────────────────────────────────
    const onScroll = () => {
      const r = section.getBoundingClientRect()
      targetScroll = Math.min(1, Math.max(0,
        (-r.top) / (r.height - window.innerHeight)
      ))
      // Update CSS card visibility
      cardRefs.current.forEach((el, i) => {
        if (!el) return
        const threshold = i / (MILESTONES.length - 1) - 0.08
        if (targetScroll >= threshold) {
          el.style.opacity = "1"
          el.style.transform = "translateY(0) scale(1)"
        } else {
          el.style.opacity = "0"
          el.style.transform = "translateY(30px) scale(0.96)"
        }
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()

    const onMouse = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth) * 2 - 1
      targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener("mousemove", onMouse, { passive: true })

    // ── Render Loop ───────────────────────────────────────────────────────────
    const tick = () => {
      raf = requestAnimationFrame(tick)
      t += 0.01
      scrollProgress += (targetScroll - scrollProgress) * 0.06
      mouseX += (targetMouseX - mouseX) * 0.05
      mouseY += (targetMouseY - mouseY) * 0.05

      // Update uniforms
      ptMat.uniforms.uTime.value = t
      bgMat.uniforms.uTime.value = t
      bgMat.uniforms.uScroll.value = scrollProgress
      bgMat.uniforms.uMouse.value.set(
        mouseX * 0.5 + 0.5,
        mouseY * 0.5 + 0.5
      )

      // Camera movement: scroll down → camera moves along the path
      camera.position.x = Math.sin(scrollProgress * Math.PI * 0.4) * 1.2 + mouseX * 0.4
      camera.position.y = -scrollProgress * 6.5 + 3 + mouseY * 0.3
      camera.position.z = 5 - scrollProgress * 0.8

      // Look slightly ahead in the scroll direction
      camera.lookAt(
        camera.position.x * 0.3 + mouseX * 0.2,
        camera.position.y - 0.8,
        0
      )

      // Pulsing orbs
      orbMeshes.forEach((mesh, i) => {
        const pulse = Math.sin(t * 1.5 + i * 1.1) * 0.06 + 1
        mesh.scale.setScalar(pulse)
      })

      renderer.autoClear = false
      renderer.clear()
      renderer.render(bgScene, bgCam)
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("mousemove", onMouse)
      renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      id="journey"
      className="relative overflow-hidden"
      style={{ minHeight: "480vh" }}
    >
      {/* ── Three.js canvas ── */}
      <div
        ref={mountRef}
        className="sticky top-0 w-full overflow-hidden"
        style={{ height: "100vh" }}
      />

      {/* ── Milestone cards — sticky overlay on top of canvas ── */}
      <div className="absolute inset-0 pointer-events-none">
        {MILESTONES.map((m, i) => {
          const top = `calc(${(i / (MILESTONES.length - 1)) * 80 + 5}% + ${i * 12}px)`
          const isLeft = i % 2 === 0
          return (
            <div
              key={i}
              ref={el => { cardRefs.current[i] = el }}
              className="pointer-events-auto absolute w-72 md:w-80"
              style={{
                top,
                [isLeft ? "left" : "right"]: "calc(50% + 20px)",
                ...(isLeft ? { transform: "translateX(-100%)" } : {}),
                opacity: 0,
                transform: "translateY(30px) scale(0.96)",
                transition: "opacity 0.7s cubic-bezier(.22,1,.36,1), transform 0.7s cubic-bezier(.22,1,.36,1)",
                zIndex: 10,
              }}
            >
              <div
                className="rounded-2xl p-5 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, rgba(${m.rgb},0.10) 0%, rgba(3,7,18,0.94) 60%)`,
                  border: `1px solid rgba(${m.rgb},0.25)`,
                  backdropFilter: "blur(24px)",
                  boxShadow: `0 8px 40px rgba(${m.rgb},0.18), inset 0 1px 0 rgba(255,255,255,0.05)`,
                }}
              >
                {/* Top glow line */}
                <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${m.hex}, transparent)`, opacity: 0.8 }} />

                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: m.hex, background: `rgba(${m.rgb},0.12)`, border: `1px solid rgba(${m.rgb},0.2)` }}>
                    {m.day}
                  </span>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold leading-none" style={{ color: m.hex }}>{m.metric}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{m.sub}</p>
                  </div>
                </div>

                <h3 className="font-bold text-white text-sm mb-1.5">{m.label}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>

                {/* Bottom glow */}
                <div className="absolute bottom-0 left-5 right-5 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${m.rgb},0.35), transparent)` }} />
              </div>

              {/* Connector dot to center */}
              <div
                className="absolute top-1/2 -translate-y-1/2 hidden md:flex items-center"
                style={{ [isLeft ? "right" : "left"]: "-32px", [isLeft ? "flexDirection" : "flexDirection"]: isLeft ? "row" : "row-reverse" }}
              >
                <div className="h-px w-6 opacity-60" style={{ background: `linear-gradient(${isLeft ? "to right" : "to left"}, ${m.hex}88, transparent)` }} />
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.hex, boxShadow: `0 0 12px 4px rgba(${m.rgb},0.5)` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Section header ── */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-20 pointer-events-none z-20">
        <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-5 tracking-widest uppercase">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
          The AutoPilot Journey
        </div>
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-none text-center px-4">
          Results start on
          <span className="gradient-text"> day one.</span>
        </h2>
        <p className="text-gray-500 text-base mt-4 max-w-md text-center px-4">
          Scroll to fly through what your first 90 days look like.
        </p>
      </div>

      {/* ── CTA at bottom ── */}
      <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center z-20 pointer-events-auto">
        <Link
          href="/signup"
          className="shimmer-btn px-9 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-lg transition-colors shadow-2xl shadow-indigo-900/50"
        >
          Start your timeline now
        </Link>
      </div>
    </section>
  )
}
