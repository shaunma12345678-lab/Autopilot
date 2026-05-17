"use client"

import dynamic from "next/dynamic"

const HatomScroll = dynamic(() => import("@/components/HatomScroll"), { ssr: false })

export default function Page() {
  return <HatomScroll />
}
