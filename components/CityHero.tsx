"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Stars } from "@react-three/drei"
import * as THREE from "three"

/* ── Constants ────────────────────────────────────────────── */
const CITY_SIZE  = 30
const CITY_SPACE = 0.96
const CITY_Y     = -9.5
const CITY_COUNT = CITY_SIZE * CITY_SIZE

/* ── Grid floor shader — neon purple data-pulse ──────────── */
const GRID_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GRID_FRAG = /* glsl */`
  precision highp float;
  varying vec2  vUv;
  uniform float uTime;

  void main() {
    vec2  uv  = vUv * 30.0;
    vec2  g   = fract(uv);
    float d   = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y));
    float line = 1.0 - smoothstep(0.0, 0.042, d);

    /* Two independent pulse waves for depth */
    float p1 = 0.5 + 0.5 * sin(uTime * 1.05 + vUv.x * 19.0 - vUv.y * 14.0);
    float p2 = 0.5 + 0.5 * sin(uTime * 0.38 + vUv.y *  7.0 + vUv.x *  5.0);

    /* Violet base → bright violet edge lit by pulses */
    vec3 col = mix(vec3(0.06, 0.01, 0.24), vec3(0.52, 0.16, 1.00), line * p1);
    col     += vec3(0.01, 0.20, 0.52) * line * p2 * 0.45;

    /* Fade at plane edges */
    float edge = smoothstep(0.0, 0.22, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));

    gl_FragColor = vec4(col, line * (0.40 + p1 * 0.62) * edge);
  }
`

/* ── Scene contents ───────────────────────────────────────── */
function HeroScene() {
  const buildMeshRef = useRef<THREE.InstancedMesh>(null)
  const buildMatRef  = useRef<THREE.MeshBasicMaterial>(null)
  const gridMatRef   = useRef<THREE.ShaderMaterial | null>(null)
  const winMatRef    = useRef<THREE.PointsMaterial>(null)
  const mouseRef     = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  /* Smooth mouse tracking */
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      mouseRef.current.tx = (e.clientX / window.innerWidth)  * 2 - 1
      mouseRef.current.ty = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener("mousemove", fn)
    return () => window.removeEventListener("mousemove", fn)
  }, [])

  /* Procedural city — dark purple buildings, center-biased heights */
  const buildData = useMemo(() => {
    const out: { h: number; color: THREE.Color }[] = []
    const palette = [
      new THREE.Color("#190a4c"),
      new THREE.Color("#2c1272"),
      new THREE.Color("#38188e"),
      new THREE.Color("#0d0d3a"),
      new THREE.Color("#150830"),
    ]
    const base = new THREE.Color("#020108")
    for (let row = 0; row < CITY_SIZE; row++) {
      for (let col = 0; col < CITY_SIZE; col++) {
        const dx    = (col / (CITY_SIZE - 1)) * 2 - 1
        const dz    = (row / (CITY_SIZE - 1)) * 2 - 1
        const dist  = Math.sqrt(dx * dx + dz * dz)
        const boost = Math.max(0, 1 - dist * 0.55)
        const isTall = Math.random() > 0.70
        const h = isTall
          ? 0.8 + boost * 6.5 + Math.random() * 2.5
          : 0.06 + Math.random() * 0.35
        const t = Math.min(1, h / 8.0)
        const c = base.clone().lerp(
          palette[Math.floor(Math.random() * palette.length)],
          t * 0.88 + 0.12
        )
        out.push({ h, color: c })
      }
    }
    return out
  }, [])

  /* Grid shader material */
  const gridMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   GRID_VERT,
    fragmentShader: GRID_FRAG,
    uniforms:       { uTime: { value: 0 } },
    transparent:    true,
    depthWrite:     false,
    side:           THREE.DoubleSide,
  }), [])

  /* Window-light point cloud */
  const winGeo = useMemo(() => {
    const count = 1200
    const pos   = new Float32Array(count * 3)
    const col   = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const row  = Math.floor(Math.random() * CITY_SIZE)
      const c    = Math.floor(Math.random() * CITY_SIZE)
      const x    = (c   - CITY_SIZE / 2) * CITY_SPACE
      const z    = (row - CITY_SIZE / 2) * CITY_SPACE
      const h    = Math.random() * 9.0 * (0.2 + 0.8 * Math.random())
      const off  = 0.22
      const side = Math.floor(Math.random() * 4)
      pos[i*3]   = x + (side === 0 ? off : side === 1 ? -off : (Math.random()-0.5)*0.42)
      pos[i*3+1] = CITY_Y + h
      pos[i*3+2] = z + (side === 2 ? off : side === 3 ? -off : (Math.random()-0.5)*0.42)
      const t = Math.random()
      if (t < 0.40) {
        col[i*3] = 0.88; col[i*3+1] = 0.65; col[i*3+2] = 1.00 // soft violet-white
      } else if (t < 0.68) {
        col[i*3] = 0.48; col[i*3+1] = 0.18; col[i*3+2] = 1.00 // deep violet
      } else if (t < 0.85) {
        col[i*3] = 0.04; col[i*3+1] = 0.72; col[i*3+2] = 0.92 // cyan accent
      } else {
        col[i*3] = 0.98; col[i*3+1] = 0.18; col[i*3+2] = 0.82 // neon pink highlight
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("color",    new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [])

  /* Setup */
  useEffect(() => {
    gridMatRef.current = gridMat
    return () => { gridMat.dispose(); winGeo.dispose() }
  }, [gridMat, winGeo])

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
      dummy.scale.set(0.40, d.h, 0.40)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, d.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [buildData])

  /* Animation */
  useFrame(({ clock, camera }) => {
    const t  = clock.getElapsedTime()
    const mr = mouseRef.current

    /* Smooth mouse lerp */
    mr.x += (mr.tx - mr.x) * 0.032
    mr.y += (mr.ty - mr.y) * 0.032

    if (gridMatRef.current) gridMatRef.current.uniforms.uTime.value = t
    if (buildMatRef.current) buildMatRef.current.opacity = 0.95
    if (winMatRef.current) {
      winMatRef.current.opacity = 0.58 + 0.14 * Math.sin(t * 1.1)
    }

    /* Camera parallax — mouse shifts view angle slightly */
    camera.position.x += (mr.x * 4.8 - camera.position.x) * 0.015
    camera.position.y += (13.5 + mr.y * 2.8 - camera.position.y) * 0.013
    camera.position.z += (21.5 - mr.y * 1.8 - camera.position.z) * 0.013
    camera.lookAt(0, CITY_Y + 4.0, 0)
  })

  const gridSize = CITY_SIZE * CITY_SPACE + 12

  return (
    <>
      {/* Pure black sky */}
      <color attach="background" args={["#000000"]} />

      <Stars radius={110} depth={70} count={3500} factor={4.5} saturation={0.7} fade speed={0.32} />

      {/* Grid floor */}
      <mesh position={[0, CITY_Y - 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[gridSize, gridSize]} />
        <primitive object={gridMat} attach="material" />
      </mesh>

      {/* Buildings */}
      <instancedMesh ref={buildMeshRef} args={[undefined, undefined, CITY_COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial ref={buildMatRef} transparent opacity={0} vertexColors />
      </instancedMesh>

      {/* Window lights */}
      <points geometry={winGeo}>
        <pointsMaterial
          ref={winMatRef}
          size={0.10}
          vertexColors
          transparent
          opacity={0.58}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Volumetric violet haze above city — stacked additive spheres */}
      <mesh position={[0, CITY_Y + 7, 0]}>
        <sphereGeometry args={[22, 14, 14]} />
        <meshBasicMaterial color="#1e0658" transparent opacity={0.10} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, CITY_Y + 5, 0]}>
        <sphereGeometry args={[15, 12, 12]} />
        <meshBasicMaterial color="#3a0e88" transparent opacity={0.08} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, CITY_Y + 3, 0]}>
        <sphereGeometry args={[9, 10, 10]} />
        <meshBasicMaterial color="#5a18aa" transparent opacity={0.06} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* Neon city lights — multiple colored point lights for drama */}
      <pointLight position={[  0, CITY_Y + 10,   0]} intensity={14}  color="#5b21b6" distance={58} decay={2} />
      <pointLight position={[ 12, CITY_Y +  6, -10]} intensity={5.5} color="#4f46e5" distance={42} decay={2} />
      <pointLight position={[-10, CITY_Y +  6,  10]} intensity={4.0} color="#06b6d4" distance={36} decay={2} />
      <pointLight position={[  0, CITY_Y +  5,   0]} intensity={3.0} color="#7c3aed" distance={48} decay={2} />
      <pointLight position={[  6, CITY_Y +  3,   8]} intensity={2.5} color="#ec4899" distance={28} decay={2} />
      <pointLight position={[ -8, CITY_Y +  3,  -5]} intensity={2.0} color="#8b5cf6" distance={30} decay={2} />
      <ambientLight intensity={0.03} color="#080018" />
    </>
  )
}

/* ── Default export ───────────────────────────────────────── */
export default function CityHero() {
  return (
    <Canvas
      camera={{ position: [0, 13.5, 21], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <HeroScene />
    </Canvas>
  )
}
