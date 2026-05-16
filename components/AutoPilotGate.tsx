"use client"

import { useEffect, useRef, useState } from "react"

const PHASES = [
  "Spinning up intelligence core...",
  "Activating 8 autonomous agents...",
  "Locking on to your business data...",
  "Loading mission parameters...",
  "Battle systems online.",
]

interface Props {
  onActivate: () => void
}

export default function AutoPilotGate({ onActivate }: Props) {
  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase]     = useState(0)     // how many phases complete (0–5)
  const [ready, setReady]     = useState(false)
  const [exiting, setExiting] = useState(false)
  const [gone, setGone]       = useState(false)

  // Star-field canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener("resize", resize)

    const stars = Array.from({ length: 260 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.4 + 0.2,
      base: Math.random() * 0.5 + 0.05,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.025 + 0.008,
    }))

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      ctx.fillStyle = "#030712"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      stars.forEach(s => {
        s.phase += s.speed
        const a = s.base * (0.6 + 0.4 * Math.sin(s.phase))
        ctx.beginPath()
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(180,190,255,${a})`
        ctx.fill()
      })
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize) }
  }, [])

  // Phase-loading sequence (600ms per phase, total ~3s)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    PHASES.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setPhase(i + 1)
        if (i === PHASES.length - 1) {
          timers.push(setTimeout(() => setReady(true), 450))
        }
      }, 300 + i * 580))
    })
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleActivate = () => {
    setExiting(true)
    onActivate()
    // Unmount after transition finishes
    setTimeout(() => setGone(true), 1400)
  }

  if (gone) return null

  const progress = phase / PHASES.length

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center select-none"
      style={{
        zIndex: 9999,
        background: "#030712",
        opacity: exiting ? 0 : 1,
        transition: "opacity 1.2s cubic-bezier(.22,1,.36,1)",
        pointerEvents: exiting ? "none" : "auto",
      }}
    >
      {/* Animated star field */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Radial glow center */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,70,229,0.08) 0%, rgba(129,140,248,0.04) 40%, transparent 70%)",
          transform: "translate(-50%, -50%)",
          left: "50%",
          top: "50%",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "#818cf8",
              boxShadow: "0 0 10px rgba(129,140,248,0.9), 0 0 24px rgba(129,140,248,0.4)",
              animation: "agent-pulse 2s ease-in-out infinite",
            }}
          />
          <span
            className="text-xs font-bold tracking-[0.35em] uppercase text-indigo-300"
            style={{ fontFamily: "'OCMikola', sans-serif", letterSpacing: "0.32em" }}
          >
            AutoPilot
          </span>
          <div
            style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: "#818cf8",
              boxShadow: "0 0 10px rgba(129,140,248,0.9), 0 0 24px rgba(129,140,248,0.4)",
              animation: "agent-pulse 2s ease-in-out infinite 0.4s",
            }}
          />
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5">
          <h1
            className="text-xl md:text-2xl font-bold text-white tracking-[0.18em] uppercase"
            style={{ fontFamily: "'OCMikola', sans-serif" }}
          >
            {ready ? "SYSTEMS READY" : "INITIALIZING"}
          </h1>
          <p className="text-gray-600 text-xs tracking-[0.28em] uppercase tabular-nums">
            {phase} / {PHASES.length} PHASES
          </p>
        </div>

        {/* Phase list */}
        <div className="w-full space-y-2">
          {PHASES.map((label, i) => {
            const done   = i < phase
            const active = i === phase - 1
            return (
              <div
                key={i}
                className="flex items-center gap-2.5"
                style={{
                  opacity: done || active ? 1 : 0.15,
                  transition: "opacity 0.5s ease",
                }}
              >
                {/* Indicator */}
                <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                  {done ? (
                    <div
                      style={{
                        width: "5px", height: "5px", borderRadius: "50%",
                        background: "#818cf8",
                        boxShadow: "0 0 6px rgba(129,140,248,0.8)",
                      }}
                    />
                  ) : active ? (
                    <div
                      style={{
                        width: "5px", height: "5px", borderRadius: "50%",
                        background: "#a78bfa",
                        boxShadow: "0 0 8px rgba(167,139,250,0.9)",
                        animation: "ping-slow 1s ease-out infinite",
                      }}
                    />
                  ) : (
                    <div className="w-1 h-1 rounded-full bg-gray-800" />
                  )}
                </div>

                {/* Track */}
                <div className="flex-1 h-px bg-gray-800/80 relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: done ? "100%" : active ? "55%" : "0%",
                      background: done
                        ? "linear-gradient(90deg, rgba(79,70,229,0.6), rgba(129,140,248,0.9), rgba(167,139,250,0.5))"
                        : "linear-gradient(90deg, transparent, rgba(129,140,248,0.6))",
                      transition: "width 0.55s cubic-bezier(.22,1,.36,1)",
                      boxShadow: done || active ? "0 0 6px rgba(129,140,248,0.4)" : "none",
                    }}
                  />
                </div>

                {/* Label */}
                <span className="text-[10px] text-gray-600 w-[160px] truncate text-right">
                  {done || active ? label : "waiting..."}
                </span>
              </div>
            )
          })}
        </div>

        {/* Master progress bar */}
        <div className="w-full h-px bg-gray-800 relative overflow-hidden rounded-full">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg, #4f46e5, #818cf8, #a78bfa)",
              transition: "width 0.65s cubic-bezier(.22,1,.36,1)",
              boxShadow: "0 0 10px rgba(129,140,248,0.7)",
            }}
          />
        </div>

        {/* CTA area */}
        {ready ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <button
              onClick={handleActivate}
              className="relative group w-full py-4 text-white font-bold tracking-[0.28em] uppercase text-sm overflow-hidden"
              style={{ fontFamily: "'OCMikola', sans-serif" }}
            >
              {/* Border frame */}
              <span
                className="absolute inset-0 transition-all duration-500"
                style={{ border: "1px solid rgba(129,140,248,0.35)" }}
              />
              {/* Hover fill */}
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(135deg, rgba(79,70,229,0.15), rgba(129,140,248,0.08))" }}
              />
              {/* Shimmer sweep on hover */}
              <span
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
                  transform: "skewX(-20deg)",
                }}
              />
              {/* Corner accents */}
              <span className="absolute top-0 left-0 w-2 h-px bg-indigo-400/80" />
              <span className="absolute top-0 left-0 w-px h-2 bg-indigo-400/80" />
              <span className="absolute bottom-0 right-0 w-2 h-px bg-indigo-400/80" />
              <span className="absolute bottom-0 right-0 w-px h-2 bg-indigo-400/80" />
              <span className="relative flex items-center justify-center gap-3">
                <span className="text-indigo-400">▶</span>
                <span>CLICK TO ACTIVATE</span>
              </span>
            </button>

            <p className="text-gray-700 text-[10px] tracking-[0.28em] uppercase">
              🎧 headphones recommended
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-700">
            <span className="text-[10px] tracking-[0.25em] uppercase">Loading</span>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full bg-indigo-600"
                  style={{ animation: `agent-pulse 0.8s ease-in-out ${i * 0.18}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
