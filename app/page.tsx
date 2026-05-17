"use client"

import dynamic from "next/dynamic"

const HatomScroll  = dynamic(() => import("@/components/HatomScroll"),  { ssr: false })
const CustomCursor = dynamic(() => import("@/components/CustomCursor"), { ssr: false })

export default function Page() {
  return (
    <>
      <CustomCursor />
      <HatomScroll />
    </>
  )
}
