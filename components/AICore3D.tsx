"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Stars, Sparkles, Float } from "@react-three/drei"
import * as THREE from "three"

/* ─── Constants ──────────────────────────────────────────── */

const AGENT_COLORS = [
  "#6366f1", // Content Agent — indigo
  "#10b981", // Reputation Agent — emerald
  "#8b5cf6", // Lead Gen Agent — violet
  "#06b6d4", // SEO Agent — cyan
  "#f59e0b", // Sales Agent — amber
  "#ec4899", // Support Agent — pink
  "#f97316", // Financial Agent — orange
  "#14b8a6", // Brand Voice Agent — teal
]

const SATELLITE_POSITIONS: [number, number, number][] = AGENT_COLORS.map((_, i) => {
  const angle = (i / AGENT_COLORS.length) * Math.PI * 2
  const r = 2.6
  return [Math.cos(angle) * r, Math.sin(angle * 2) * 0.4, Math.sin(angle) * r]
})

const RING_CONFIGS = [
  { rotation: [Math.PI / 2, 0, 0] as [number, number, number], radius: 1.65, color: "#6366f1", speed: 0.45 },
  { rotation: [Math.PI / 5, Math.PI / 3, 0] as [number, number, number], radius: 2.0,  color: "#8b5cf6", speed: -0.32 },
  { rotation: [-Math.PI / 4, Math.PI / 4, 0] as [number, number, number], radius: 2.35, color: "#06b6d4", speed: 0.55 },
]

/* ─── Orb custom GLSL shaders ─────────────────────────────── */

const ORB_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ORB_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uCamPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }

  void main() {
    vec3  viewDir = normalize(uCamPos - vWorldPosition);
    float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.0);

    float n     = fbm(vUv * 4.5 + vec2(uTime * 0.12, uTime * 0.08));
    float pulse = sin(uTime * 1.8) * 0.07 + 0.93;

    vec3 core  = vec3(0.31, 0.29, 0.95) * (0.18 + n * 0.82) * pulse;
    vec3 rim   = vec3(0.56, 0.42, 1.00) * fresnel * 1.6;
    vec3 white = vec3(1.0,  0.96, 1.0)  * pow(fresnel, 4.0) * 0.85;

    gl_FragColor = vec4(core + rim + white, 0.48 + fresnel * 0.52);
  }
`

/* ─── Scene contents ─────────────────────────────────────── */

function SceneContents() {
  const orbRef  = useRef<THREE.Mesh>(null)
  const satGroupRef = useRef<THREE.Group>(null)

  const ring0 = useRef<THREE.Mesh>(null)
  const ring1 = useRef<THREE.Mesh>(null)
  const ring2 = useRef<THREE.Mesh>(null)
  const ringRefs = [ring0, ring1, ring2]

  /* Orb ShaderMaterial */
  const orbMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: ORB_VERT,
    fragmentShader: ORB_FRAG,
    uniforms: {
      uTime:   { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite:  false,
    side: THREE.FrontSide,
  }), [])

  /* Connection lines geometry (satellites → center, inside satellite group) */
  const lineGeo = useMemo(() => {
    const pts: number[] = []
    SATELLITE_POSITIONS.forEach(([x, y, z]) => { pts.push(0, 0, 0, x, y, z) })
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])

  /* Dispose manually-created objects on unmount */
  useEffect(() => () => { orbMat.dispose(); lineGeo.dispose() }, [orbMat, lineGeo])

  /* Animation loop */
  useFrame(({ clock, camera, mouse }) => {
    const t = clock.getElapsedTime()

    /* Orb shader uniforms */
    orbMat.uniforms.uTime.value = t
    orbMat.uniforms.uCamPos.value.copy(camera.position)

    /* Orb slow self-rotation */
    if (orbRef.current) orbRef.current.rotation.y += 0.003

    /* Satellite system rotation */
    if (satGroupRef.current) satGroupRef.current.rotation.y = t * 0.16

    /* Ring rotations */
    const speeds = [RING_CONFIGS[0].speed, RING_CONFIGS[1].speed, RING_CONFIGS[2].speed]
    ringRefs.forEach((ref, i) => {
      if (ref.current) ref.current.rotation.z = t * speeds[i]
    })

    /* Smooth camera parallax from mouse */
    camera.position.x += (mouse.x * 2.2 - camera.position.x) * 0.025
    camera.position.y += (mouse.y * 1.6 - camera.position.y) * 0.025
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      {/* ── Starfield ── */}
      <Stars radius={55} depth={40} count={2200} factor={3.5} saturation={0.5} fade speed={0.6} />

      {/* ── Sparkles halo around orb ── */}
      <Sparkles count={110} size={1.4} scale={4.5} speed={0.22} color="#818cf8" noise={0.9} />

      {/* ── Floating central orb ── */}
      <Float speed={1.8} rotationIntensity={0.25} floatIntensity={0.45}>
        <mesh ref={orbRef}>
          <sphereGeometry args={[1.2, 64, 64]} />
          <primitive object={orbMat} attach="material" />
        </mesh>
      </Float>

      {/* ── Orbital rings ── */}
      {RING_CONFIGS.map((cfg, i) => (
        <mesh
          key={i}
          ref={ringRefs[i]}
          rotation={cfg.rotation}
        >
          <torusGeometry args={[cfg.radius, 0.011, 16, 128]} />
          <meshBasicMaterial color={cfg.color} transparent opacity={0.38} />
        </mesh>
      ))}

      {/* ── Agent satellites + connection lines ── */}
      <group ref={satGroupRef}>
        {/* Lines from center to each satellite */}
        <lineSegments geometry={lineGeo}>
          <lineBasicMaterial color="#4f46e5" transparent opacity={0.13} />
        </lineSegments>

        {/* 8 agent spheres */}
        {SATELLITE_POSITIONS.map((pos, i) => (
          <group key={i} position={pos}>
            <mesh>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshBasicMaterial color={AGENT_COLORS[i]} />
            </mesh>
            {/* Glow halo sprite */}
            <sprite scale={[0.65, 0.65, 0.65]}>
              <spriteMaterial
                color={AGENT_COLORS[i]}
                transparent
                opacity={0.28}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        ))}
      </group>

      {/* ── Lighting ── */}
      <ambientLight intensity={0.12} />
      <pointLight position={[4, 4, 4]}   intensity={2.2} color="#818cf8" />
      <pointLight position={[-4, -3, -3]} intensity={1.0} color="#a78bfa" />
      <pointLight position={[0, 0, 6]}   intensity={0.4} color="#ffffff" />
    </>
  )
}

/* ─── Default export ─────────────────────────────────────── */

export default function AICore3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 46 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <SceneContents />
    </Canvas>
  )
}
