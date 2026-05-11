"use client"

import { useRef, useEffect } from "react"
import Link from "next/link"

const MILESTONES = [
  {
    day: "Day 1",
    label: "AI team goes live",
    desc: "Brand Voice Agent profiles your business in 2 minutes — tone, personality, audience locked. Every agent knows exactly who you are before you finish setup.",
    metric: "2 min",
    sub: "to deploy",
    hex: "#6366f1",
    rgb: "99,102,241",
    side: "left" as const,
  },
  {
    day: "Day 2",
    label: "First content drops",
    desc: "Seven on-brand posts queue for review. One review response is already drafted for your newest Google listing — waiting for your approval, not your effort.",
    metric: "7 posts",
    sub: "ready to approve",
    hex: "#8b5cf6",
    rgb: "139,92,246",
    side: "right" as const,
  },
  {
    day: "Week 1",
    label: "Leads start moving",
    desc: "Personalized cold sequences hit 12 prospects. Three book calls without a single follow-up from you. Every lead scored 0–100 in real time.",
    metric: "3 calls",
    sub: "booked automatically",
    hex: "#06b6d4",
    rgb: "6,182,212",
    side: "left" as const,
  },
  {
    day: "Month 1",
    label: "Reputation rebounds",
    desc: "Every review answered in under 5 minutes. Google rating climbs from 4.1 to 4.7. New customers cite your reviews as the reason they chose you over everyone else.",
    metric: "4.7 ★",
    sub: "Google rating",
    hex: "#10b981",
    rgb: "16,185,129",
    side: "right" as const,
  },
  {
    day: "Month 2",
    label: "Reports go out",
    desc: "AutoPilot sends a plain-English performance report for each client. Revenue up. Reviews up. Leads in. You send it. They renew. Every single time.",
    metric: "94%",
    sub: "client renewal rate",
    hex: "#f59e0b",
    rgb: "245,158,11",
    side: "left" as const,
  },
  {
    day: "Month 3",
    label: "Compounding returns",
    desc: "SEO posts rank on page 1. Social following grew 340%. Referrals arrive without asking. The flywheel is at full speed — and you didn't build it. AutoPilot did.",
    metric: "+31%",
    sub: "avg revenue growth",
    hex: "#ec4899",
    rgb: "236,72,153",
    side: "right" as const,
  },
]

export default function Timeline3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const spineRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const section = sectionRef.current
    if (!canvas || !section) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf: number
    let w = 0
    let h = 0

    interface Pt {
      x: number; y: number; vx: number; vy: number
      r: number; a: number; rgb: string; phase: number
    }

    let pts: Pt[] = []
    const RGBS = ["99,102,241", "139,92,246", "6,182,212", "16,185,129"]

    const resize = () => {
      w = canvas.offsetWidth
      h = canvas.offsetHeight
      canvas.width = Math.round(w * devicePixelRatio)
      canvas.height = Math.round(h * devicePixelRatio)
      ctx.scale(devicePixelRatio, devicePixelRatio)
      pts = Array.from({ length: 90 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random() * 0.3 + 0.06,
        rgb: RGBS[Math.floor(Math.random() * 4)],
        phase: Math.random() * Math.PI * 2,
      }))
    }

    let t = 0
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      t += 0.007

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 110) {
            ctx.beginPath()
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.strokeStyle = `rgba(99,102,241,${0.065 * (1 - d / 110)})`
            ctx.lineWidth = 0.4
            ctx.stroke()
          }
        }
        const p = pts[i]
        const pulse = Math.sin(t * 1.4 + p.phase) * 0.3 + 0.7
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.rgb},${p.a * pulse})`
        ctx.fill()
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0
      }
      raf = requestAnimationFrame(tick)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    tick()

    const cardObs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return
          e.target.classList.add("tl-revealed")
          const el = e.target as HTMLElement
          setTimeout(() => el.classList.add("tl-live"), 950)
        })
      },
      { threshold: 0.2 }
    )
    cardRefs.current.forEach(el => { if (el) cardObs.observe(el) })

    const onMouse = (e: MouseEvent) => {
      const mx = (e.clientX / window.innerWidth) * 2 - 1
      const my = (e.clientY / window.innerHeight) * 2 - 1
      cardRefs.current.forEach(card => {
        if (!card?.classList.contains("tl-live")) return
        card.style.transform = `perspective(900px) rotateY(${mx * 6}deg) rotateX(${-my * 4}deg) translateZ(30px)`
      })
    }
    const onLeave = () => {
      cardRefs.current.forEach(card => {
        if (!card?.classList.contains("tl-live")) return
        card.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg) translateZ(30px)"
      })
    }

    const onScroll = () => {
      const spine = spineRef.current
      if (!spine) return
      const r = section.getBoundingClientRect()
      const p = Math.min(1, Math.max(0,
        (window.innerHeight * 0.45 - r.top) / (r.height - window.innerHeight * 0.45)
      ))
      spine.style.transform = `scaleY(${p})`
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("mousemove", onMouse, { passive: true })
    section.addEventListener("mouseleave", onLeave)
    onScroll()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cardObs.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("mousemove", onMouse)
      section.removeEventListener("mouseleave", onLeave)
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      id="journey"
      className="relative px-4 md:px-6 py-28 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 100% 40% at 50% 0%, rgba(99,102,241,0.05), transparent 60%), radial-gradient(ellipse 80% 40% at 50% 100%, rgba(139,92,246,0.04), transparent 60%), #030712",
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.65 }}
      />

      <div className="absolute -top-40 -left-40 w-[700px] h-[700px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-violet-600/4 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6 tracking-wide uppercase reveal">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
            The AutoPilot Journey
          </div>
          <h2 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-none mb-5 reveal delay-100">
            Results don&apos;t take months.<br />
            <span className="gradient-text">They start on day one.</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto reveal delay-200">
            Here&apos;s exactly what happens when you turn AutoPilot on — and what your business looks like 90 days later.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Spine */}
          <div
            className="absolute left-1/2 -translate-x-1/2 top-6 bottom-6 w-[2px] pointer-events-none hidden md:block"
            style={{ zIndex: 1 }}
          >
            <div className="absolute inset-0 bg-gray-800/50" />
            <div
              ref={spineRef}
              className="absolute top-0 left-0 right-0 h-full"
              style={{
                transformOrigin: "top",
                transform: "scaleY(0)",
                background:
                  "linear-gradient(to bottom, #6366f1 0%, #8b5cf6 20%, #06b6d4 40%, #10b981 60%, #f59e0b 80%, #ec4899 100%)",
                boxShadow: "0 0 18px 4px rgba(99,102,241,0.5)",
                filter: "blur(0.5px)",
              }}
            />
          </div>

          {/* Milestones */}
          {MILESTONES.map((m, i) => (
            <div
              key={i}
              className="relative grid grid-cols-1 md:grid-cols-2 md:min-h-[240px] items-center mb-4 md:mb-0"
            >
              {/* Spine node */}
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 hidden md:flex items-center justify-center w-10 h-10">
                <div
                  className="w-[18px] h-[18px] rounded-full relative"
                  style={{
                    backgroundColor: m.hex,
                    boxShadow: `0 0 0 5px rgba(${m.rgb},0.12), 0 0 24px 8px rgba(${m.rgb},0.45)`,
                  }}
                >
                  <div
                    className="absolute inset-0 rounded-full animate-ping-slow"
                    style={{ backgroundColor: m.hex, opacity: 0.25 }}
                  />
                </div>
              </div>

              {/* Left column */}
              <div className={`flex items-center ${m.side === "left" ? "md:justify-end md:pr-10" : ""}`}>
                {m.side === "left" && (
                  <div className="w-full md:max-w-[440px] mt-8 md:mt-0">
                    <MilestoneCard m={m} idx={i} cardRefs={cardRefs} />
                  </div>
                )}
              </div>

              {/* Right column */}
              <div className={`flex items-center ${m.side === "right" ? "md:justify-start md:pl-10" : ""}`}>
                {m.side === "right" && (
                  <div className="w-full md:max-w-[440px] mt-8 md:mt-0">
                    <MilestoneCard m={m} idx={i} cardRefs={cardRefs} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-20 reveal">
          <p className="text-gray-600 text-sm mb-5">Your Day 1 is one click away.</p>
          <Link
            href="/signup"
            className="shimmer-btn inline-block px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors text-lg shadow-xl shadow-indigo-900/40"
          >
            Start your timeline now
          </Link>
        </div>
      </div>
    </section>
  )
}

function MilestoneCard({
  m,
  idx,
  cardRefs,
}: {
  m: (typeof MILESTONES)[number]
  idx: number
  cardRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
}) {
  return (
    <div
      ref={el => { cardRefs.current[idx] = el }}
      data-side={m.side}
      className="tl-card"
      style={{ "--tilt": m.side === "left" ? "14deg" : "-14deg" } as React.CSSProperties}
    >
      {/* Connector arm toward spine */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 h-px w-10 hidden md:block pointer-events-none
          ${m.side === "left" ? "-right-10" : "-left-10"}`}
        style={{
          background:
            m.side === "left"
              ? `linear-gradient(to right, ${m.hex}99, transparent)`
              : `linear-gradient(to left, ${m.hex}99, transparent)`,
        }}
      />

      {/* Card face */}
      <div
        className="relative rounded-2xl p-6 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, rgba(${m.rgb},0.08) 0%, rgba(3,7,18,0.93) 55%)`,
          border: `1px solid rgba(${m.rgb},0.2)`,
          backdropFilter: "blur(20px)",
          boxShadow: `0 4px 28px rgba(${m.rgb},0.1), inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Top gradient line */}
        <div
          className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${m.hex} 50%, transparent 100%)`,
            opacity: 0.7,
          }}
        />

        {/* Corner glow */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-60"
          style={{
            background: `radial-gradient(ellipse 55% 35% at ${m.side === "left" ? "95%" : "5%"} 50%, rgba(${m.rgb},0.12), transparent)`,
          }}
        />

        {/* Header row */}
        <div className="flex items-start justify-between mb-3 relative">
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full tracking-wide"
            style={{
              color: m.hex,
              background: `rgba(${m.rgb},0.1)`,
              border: `1px solid rgba(${m.rgb},0.2)`,
            }}
          >
            {m.day}
          </span>
          <div className="text-right">
            <p className="text-2xl font-extrabold leading-none" style={{ color: m.hex }}>
              {m.metric}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">{m.sub}</p>
          </div>
        </div>

        <h3 className="font-bold text-white text-base mb-2 relative">{m.label}</h3>
        <p className="text-sm text-gray-400 leading-relaxed relative">{m.desc}</p>

        {/* Bottom accent */}
        <div
          className="absolute bottom-0 left-5 right-5 h-[1px] pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(${m.rgb},0.4), transparent)`,
            opacity: 0.5,
          }}
        />
      </div>
    </div>
  )
}
