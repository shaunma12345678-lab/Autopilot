"use client"

import { useEffect, useRef } from "react"
import { gsap } from "gsap"

export default function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /* Touch devices: keep OS cursor */
    if (typeof window === "undefined" || window.matchMedia("(hover: none)").matches) return

    const dot  = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    document.documentElement.style.cursor = "none"

    const onMove = (e: MouseEvent) => {
      gsap.set(dot,  { x: e.clientX, y: e.clientY })
      gsap.to(ring, { x: e.clientX, y: e.clientY, duration: 0.10, ease: "none" })
    }

    const onEnterInteractive = () => {
      gsap.to(dot,  { scale: 0, duration: 0.25, ease: "power2.out" })
      gsap.to(ring, { scale: 2.2, opacity: 0.7, duration: 0.3, ease: "power2.out" })
    }

    const onLeaveInteractive = () => {
      gsap.to(dot,  { scale: 1, duration: 0.25, ease: "power2.out" })
      gsap.to(ring, { scale: 1, opacity: 1, duration: 0.3, ease: "power2.out" })
    }

    const onDown = () => gsap.to([dot, ring], { scale: (i) => i === 0 ? 0.6 : 0.85, duration: 0.15 })
    const onUp   = () => gsap.to([dot, ring], { scale: 1, duration: 0.2 })

    window.addEventListener("mousemove", onMove, { passive: true })
    window.addEventListener("mousedown", onDown)
    window.addEventListener("mouseup",   onUp)

    const interactiveEls = document.querySelectorAll("a, button, [role='button'], input, select")
    interactiveEls.forEach(el => {
      el.addEventListener("mouseenter", onEnterInteractive)
      el.addEventListener("mouseleave", onLeaveInteractive)
    })

    /* Re-scan for newly mounted interactive elements (pagination dots, etc.) */
    const observer = new MutationObserver(() => {
      document.querySelectorAll("a, button, [role='button']").forEach(el => {
        el.removeEventListener("mouseenter", onEnterInteractive)
        el.removeEventListener("mouseleave", onLeaveInteractive)
        el.addEventListener("mouseenter", onEnterInteractive)
        el.addEventListener("mouseleave", onLeaveInteractive)
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      document.documentElement.style.cursor = ""
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("mouseup",   onUp)
      observer.disconnect()
    }
  }, [])

  return (
    <>
      {/* Dot — snaps instantly to cursor */}
      <div
        ref={dotRef}
        style={{
          position:      "fixed",
          zIndex:        99999,
          pointerEvents: "none",
          width:         "7px",
          height:        "7px",
          borderRadius:  "50%",
          background:    "#818cf8",
          transform:     "translate(-50%, -50%)",
          willChange:    "transform",
          boxShadow:     "0 0 10px rgba(129,140,248,0.95), 0 0 24px rgba(129,140,248,0.45)",
          mixBlendMode:  "normal",
        }}
      />
      {/* Ring — lags 100ms behind */}
      <div
        ref={ringRef}
        style={{
          position:      "fixed",
          zIndex:        99998,
          pointerEvents: "none",
          width:         "30px",
          height:        "30px",
          borderRadius:  "50%",
          border:        "1px solid rgba(129,140,248,0.55)",
          transform:     "translate(-50%, -50%)",
          willChange:    "transform",
          transition:    "border-color 0.3s",
        }}
      />
    </>
  )
}
