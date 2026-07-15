"use client"

// Invisible boot component: starts the workspace sync (localStorage ⇄ database)
// once per session. Mounted in the admin shell (password auth) and the customer
// dashboard layout (cookie auth). Renders nothing.

import { useEffect } from "react"
import { initWorkspaceSync } from "@/lib/workspace-sync"

export default function WorkspaceSync({ password }: { password?: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      void initWorkspaceSync(password ? { "x-admin-password": password } : {})
    }, 400)
    return () => clearTimeout(t)
  }, [password])
  return null
}
