"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Stars, Sparkles, Float, Environment, MeshTransmissionMaterial } from "@react-three/drei"
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from "@react-three/postprocessing"
import { BlendFunction } from "postprocessing"
import * as THREE from "three"

/* ─── Constants ──────────────────────────────────────────────── */

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

/* ─── Inner plasma shader (visible through the glass) ────────── */
// Uses 3D simplex noise for organic volumetric feel.
// Schlick Fresnel (power 5) replaces the old power-2 approximation.

const PLASMA_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  uniform float uTime;

  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy)),x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz),l=1.-g;
    vec3 i1=min(g.xyz,l.zxy),i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx,x2=x0-i2+C.yyy,x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z),y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy,y=y_*ns.x+ns.yyyy,h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy),b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.,s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy,a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x),p1=vec3(a0.zw,h.y),p2=vec3(a1.xy,h.z),p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm3(vec3 p){
    float v=0.0,a=0.5;
    for(int i=0;i<5;i++){v+=a*snoise(p);p=p*2.1+vec3(1.7,9.2,4.1);a*=0.5;}
    return v;
  }

  void main() {
    vNormal    = normalize(normalMatrix * normal);
    vWorldPos  = (modelMatrix * vec4(position, 1.0)).xyz;
    vUv        = uv;

    /* Subtle organic displacement so the plasma surface breathes */
    float d = fbm3(position * 1.6 + vec3(uTime * 0.09, uTime * 0.06, 0.0));
    vec3 displaced = position + normal * (d - 0.5) * 0.09;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

const PLASMA_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uCamPos;
  uniform vec3  uColor1;
  uniform vec3  uColor2;
  uniform vec3  uColor3;

  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy)),x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz),l=1.-g;
    vec3 i1=min(g.xyz,l.zxy),i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx,x2=x0-i2+C.yyy,x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z),y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy,y=y_*ns.x+ns.yyyy,h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy),b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.,s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy,a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x),p1=vec3(a0.zw,h.y),p2=vec3(a1.xy,h.z),p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
  float fbm3(vec3 p){
    float v=0.0,a=0.5;
    for(int i=0;i<5;i++){v+=a*snoise(p);p=p*2.1+vec3(1.7,9.2,4.1);a*=0.5;}
    return v;
  }

  void main() {
    vec3  N       = normalize(vNormal);
    vec3  viewDir = normalize(uCamPos - vWorldPos);
    float NdotV   = max(0.0, dot(N, viewDir));

    /* Schlick Fresnel — physically accurate glass edge glow */
    float f0      = 0.04;
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0);

    /* Three-octave 3D FBM — each layer moves independently */
    vec3  p  = vWorldPos;
    float n1 = fbm3(p * 1.1 + vec3(uTime * 0.14, uTime * 0.07, 0.0));
    float n2 = fbm3(p * 2.3 - vec3(0.0, uTime * 0.11, uTime * 0.16));
    float n3 = fbm3(p * 4.7 + vec3(uTime * 0.20, 0.0, -uTime * 0.13));

    float plasma = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;

    /* Thin-film iridescence — colour shifts with viewing angle */
    float iriPhase = NdotV * 7.0 + uTime * 0.18;
    vec3  iriCol   = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.333, 0.667) + iriPhase * 0.45));

    /* Slow colour cycling between all three agent accent colours */
    float t1   = sin(uTime * 0.22) * 0.5 + 0.5;
    float t2   = sin(uTime * 0.17 + 2.09) * 0.5 + 0.5;
    vec3  base = mix(mix(uColor1, uColor2, t1), uColor3, t2 * 0.5);

    /* Heartbeat — double pulse: fast flutter + slow breathe */
    float hb = 0.88 + sin(uTime * 2.1) * 0.07 + sin(uTime * 0.95) * 0.05;

    /* Bright filament cracks running through the plasma */
    float crack = pow(max(0.0, n2 * n3 * 3.0), 2.8);

    vec3  col   = base * (0.12 + plasma * 1.05) * hb;
    col        += iriCol * fresnel * 0.85;
    col        += vec3(1.0, 0.97, 1.0) * pow(fresnel, 3.5) * 1.4;   /* specular rim  */
    col        += base * crack * 3.0;                                  /* energy veins  */

    float alpha = clamp(0.52 + fresnel * 0.48 + plasma * 0.12, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`

/* ─── Scene contents ──────────────────────────────────────────── */

function SceneContents() {
  const crystalRef   = useRef<THREE.Mesh>(null)
  const plasmaRef    = useRef<THREE.Mesh>(null)
  const satGroupRef  = useRef<THREE.Group>(null)
  const ring0        = useRef<THREE.Mesh>(null)
  const ring1        = useRef<THREE.Mesh>(null)
  const ring2        = useRef<THREE.Mesh>(null)
  const scanRing     = useRef<THREE.Mesh>(null)
  const scanMat      = useRef<THREE.MeshBasicMaterial>(null)
  const spotRef      = useRef<THREE.SpotLight>(null)
  const ringRefs     = [ring0, ring1, ring2]

  const plasmaMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   PLASMA_VERT,
    fragmentShader: PLASMA_FRAG,
    uniforms: {
      uTime:   { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uColor1: { value: new THREE.Color("#6366f1") },
      uColor2: { value: new THREE.Color("#8b5cf6") },
      uColor3: { value: new THREE.Color("#06b6d4") },
    },
    transparent: true,
    depthWrite:  false,
    side:        THREE.FrontSide,
  }), [])

  /* Circular glow sprite texture */
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

  /* Line segments from center → each satellite */
  const lineGeo = useMemo(() => {
    const pts: number[] = []
    SATELLITE_POSITIONS.forEach(([x, y, z]) => { pts.push(0, 0, 0, x, y, z) })
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [])

  useEffect(() => () => {
    plasmaMat.dispose()
    lineGeo.dispose()
    glowTex?.dispose()
  }, [plasmaMat, lineGeo, glowTex])

  useFrame(({ clock, camera, mouse }) => {
    const t = clock.getElapsedTime()

    /* Plasma uniforms */
    plasmaMat.uniforms.uTime.value   = t
    plasmaMat.uniforms.uCamPos.value.copy(camera.position)

    /* Scan ring */
    if (scanRing.current) {
      scanRing.current.position.y = Math.sin(t * 0.75) * 1.05
      scanRing.current.rotation.z = t * 0.1
    }
    if (scanMat.current) {
      scanMat.current.opacity = 0.1 + Math.abs(Math.sin(t * 0.75)) * 0.18
    }

    /* Crystal shell: very slow rotation */
    if (crystalRef.current) {
      crystalRef.current.rotation.y += 0.0018
      crystalRef.current.rotation.x  = Math.sin(t * 0.22) * 0.04
    }

    /* Plasma counter-rotates slightly for internal depth illusion */
    if (plasmaRef.current) {
      plasmaRef.current.rotation.y -= 0.0010
      plasmaRef.current.rotation.z  = Math.cos(t * 0.18) * 0.03
    }

    /* Spot follows a slow arc around the ball for moving caustic crown */
    if (spotRef.current) {
      spotRef.current.position.x = Math.cos(t * 0.28) * 4.5
      spotRef.current.position.z = Math.sin(t * 0.28) * 4.5
    }

    /* Satellites orbit */
    if (satGroupRef.current) satGroupRef.current.rotation.y = t * 0.16

    /* Ring rotations */
    ringRefs.forEach((ref, i) => {
      if (ref.current) ref.current.rotation.z = t * RING_CONFIGS[i].speed
    })

    /* Camera mouse parallax */
    camera.position.x += (mouse.x * 2.2 - camera.position.x) * 0.025
    camera.position.y += (mouse.y * 1.6 - camera.position.y) * 0.025
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      {/* Environment gives the glass something to refract/reflect */}
      <Environment preset="city" background={false} environmentIntensity={0.35} />

      {/* ── Starfield ── */}
      <Stars radius={55} depth={40} count={2800} factor={3.5} saturation={0.5} fade speed={0.6} />

      {/* ── Sparkles halo ── */}
      <Sparkles count={220} size={1.6} scale={6} speed={0.24} color="#818cf8" noise={0.9} />

      {/* ── Crystal ball + inner plasma ── */}
      <Float speed={1.8} rotationIntensity={0.25} floatIntensity={0.45}>

        {/* Outer glass shell — physically-based transmission */}
        <mesh ref={crystalRef}>
          <sphereGeometry args={[1.2, 128, 128]} />
          <MeshTransmissionMaterial
            samples={16}
            resolution={512}
            transmission={1}
            roughness={0.0}
            ior={2.42}
            thickness={2.8}
            clearcoat={1}
            clearcoatRoughness={0.0}
            color="#ffffff"
            attenuationColor="#a78bfa"
            attenuationDistance={1.6}
            chromaticAberration={1.0}
            anisotropy={0.6}
            distortion={0.18}
            distortionScale={0.35}
            temporalDistortion={0.12}
            envMapIntensity={1.8}
            backside
            backsideThickness={2.0}
          />
        </mesh>

        {/* Inner plasma nebula — the living energy visible through glass */}
        <mesh ref={plasmaRef}>
          <sphereGeometry args={[0.86, 80, 80]} />
          <primitive object={plasmaMat} attach="material" />
        </mesh>

        {/* Tiny white-hot core so there's always a bright centre */}
        <mesh>
          <sphereGeometry args={[0.28, 32, 32]} />
          <meshBasicMaterial color="#e0d8ff" transparent opacity={0.95} />
        </mesh>

        {/* Cyan scan ring oscillates vertically */}
        <mesh ref={scanRing}>
          <torusGeometry args={[1.24, 0.005, 8, 96]} />
          <meshBasicMaterial ref={scanMat} color="#06b6d4" transparent opacity={0.15} depthWrite={false} />
        </mesh>
      </Float>

      {/* ── Orbital rings ── */}
      {RING_CONFIGS.map((cfg, i) => (
        <mesh key={i} ref={ringRefs[i]} rotation={cfg.rotation}>
          <torusGeometry args={[cfg.radius, 0.011, 16, 128]} />
          <meshBasicMaterial color={cfg.color} transparent opacity={0.38} />
        </mesh>
      ))}

      {/* ── Agent satellites + connection lines ── */}
      <group ref={satGroupRef}>
        <lineSegments geometry={lineGeo}>
          <lineBasicMaterial color="#4f46e5" transparent opacity={0.13} />
        </lineSegments>

        {SATELLITE_POSITIONS.map((pos, i) => (
          <group key={i} position={pos}>
            <mesh>
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshBasicMaterial color={AGENT_COLORS[i]} />
            </mesh>
            <sprite scale={[0.80, 0.80, 0.80]}>
              <spriteMaterial
                map={glowTex}
                color={AGENT_COLORS[i]}
                transparent
                opacity={0.42}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </sprite>
          </group>
        ))}
      </group>

      {/* ── Lighting ── */}
      <ambientLight intensity={0.08} />

      {/* Key fill lights */}
      <pointLight position={[4, 4, 4]}   intensity={3.5} color="#818cf8" />
      <pointLight position={[-4, -3, -3]} intensity={1.5} color="#a78bfa" />
      <pointLight position={[0, 0, 6]}   intensity={1.0} color="#ffffff" />
      <pointLight position={[0, 5, -4]}  intensity={1.8} color="#06b6d4" />

      {/* Moving spot — creates a traveling caustic crown on the glass */}
      <spotLight
        ref={spotRef}
        position={[4.5, 3, 0]}
        angle={0.28}
        penumbra={0.6}
        intensity={8}
        color="#ffffff"
        castShadow={false}
      />
    </>
  )
}

/* ─── Default export ──────────────────────────────────────────── */

export default function AICore3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 55 }}
      gl={{
        antialias: true,
        alpha: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15,
      }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <SceneContents />

      {/* Post-processing — these three passes together add ~40% perceived realism */}
      <EffectComposer>
        {/* Bloom: makes the inner plasma and satellite glows burn hot */}
        <Bloom
          luminanceThreshold={0.62}
          luminanceSmoothing={0.025}
          intensity={0.75}
          mipmapBlur
        />
        {/* Chromatic aberration: prismatic edge splitting, just like real glass */}
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0018, 0.0018)}
          radialModulation
          modulationOffset={0.45}
        />
        {/* Vignette: pulls focus to the crystal */}
        <Vignette offset={0.22} darkness={0.72} />
      </EffectComposer>
    </Canvas>
  )
}
