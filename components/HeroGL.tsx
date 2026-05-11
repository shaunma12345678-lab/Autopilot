"use client"

import { useRef, useEffect } from "react"

const VERT = /* glsl */`
  attribute vec2 aPos;
  void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform vec2 uRes;
  uniform vec2 uMouse;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 m = uMouse / uRes;
    float t = uTime * 0.05;

    float n1 = fbm(uv * 3.0 + vec2(t, t * 0.8) + m * 0.2);
    float n2 = fbm(uv * 5.5 - vec2(t * 0.7, t) + vec2(4.0, 2.0));
    float n3 = fbm(uv * 2.2 + vec2(-t * 0.5, t * 0.6));

    // Indigo / violet / deep space color mix
    vec3 col = vec3(0.010, 0.012, 0.048);
    col += vec3(0.10, 0.08, 0.45) * n1 * 0.6;
    col += vec3(0.06, 0.02, 0.32) * n2 * 0.5;
    col += vec3(0.00, 0.08, 0.22) * n3 * 0.4;

    // Radial fade — brighter at top-center where hero text is
    float radial = 1.0 - length((uv - vec2(0.5, 0.7)) * vec2(1.4, 0.8));
    col += vec3(0.04, 0.02, 0.18) * max(0.0, radial * radial);

    // Mouse-reactive light
    float mDist = length(uv - m);
    col += vec3(0.06, 0.04, 0.22) * smoothstep(0.5, 0.0, mDist) * 0.5;

    // Fine stars
    vec2 sg = fract(uv * 140.0) - 0.5;
    float star = 1.0 - smoothstep(0.0, 0.018, length(sg));
    col += vec3(0.5, 0.55, 0.8) * star * 0.45 * hash(floor(uv * 140.0));

    gl_FragColor = vec4(col, 1.0);
  }
`

export default function HeroGL() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false })
    if (!gl) return

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!
      gl!.shaderSource(s, src)
      gl!.compileShader(s)
      return s
    }

    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(prog, "aPos")
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uTime  = gl.getUniformLocation(prog, "uTime")
    const uRes   = gl.getUniformLocation(prog, "uRes")
    const uMouse = gl.getUniformLocation(prog, "uMouse")

    let W = 0, H = 0, mx = 0, my = 0, raf: number, t = 0

    const resize = () => {
      W = canvas.offsetWidth
      H = canvas.offsetHeight
      canvas.width  = Math.round(W * Math.min(devicePixelRatio, 1.5))
      canvas.height = Math.round(H * Math.min(devicePixelRatio, 1.5))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const onMouse = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    window.addEventListener("mousemove", onMouse, { passive: true })

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      t += 0.016
      gl.uniform1f(uTime, t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uMouse, mx * (canvas.width / W), (H - my) * (canvas.height / H))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("mousemove", onMouse)
      gl.deleteProgram(prog)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.9 }}
    />
  )
}
