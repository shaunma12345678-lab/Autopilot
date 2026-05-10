"use client"

import { useState } from "react"
import type { Content } from "@/app/generated/prisma"

type FilterStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "POSTED"

interface Props {
  initialContent: Content[]
  businessId: string
}

export default function ContentManager({ initialContent, businessId }: Props) {
  const [content, setContent] = useState(initialContent)
  const [filter, setFilter] = useState<FilterStatus>("ALL")
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = filter === "ALL" ? content : content.filter(c => c.status === filter)
  const pendingItems = content.filter(c => c.status === "PENDING")

  async function updateStatus(id: string, status: "APPROVED" | "REJECTED") {
    const res = await fetch("/api/agents/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    if (res.ok) {
      setContent(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    }
  }

  async function bulkApprove() {
    const ids = selected.size > 0 ? Array.from(selected) : pendingItems.map(c => c.id)
    for (const id of ids) {
      await updateStatus(id, "APPROVED")
    }
    setSelected(new Set())
  }

  async function generate() {
    setGenerating(true)
    await fetch("/api/agents/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, contentType: "SOCIAL_POST", platform: "Instagram", count: 5 }),
    })
    window.location.reload()
  }

  const TABS: FilterStatus[] = ["ALL", "PENDING", "APPROVED", "REJECTED"]

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                filter === tab ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"
              }`}>
              {tab}
              {tab === "PENDING" && pendingItems.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingItems.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {pendingItems.length > 0 && (
            <button onClick={bulkApprove}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition">
              Approve All Pending
            </button>
          )}
          <button onClick={generate} disabled={generating}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition">
            {generating ? "Generating..." : "+ Generate More"}
          </button>
        </div>
      </div>

      {/* Content List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">No content here yet</p>
          <p className="text-sm">Generate content to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => (
            <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <input type="checkbox" checked={selected.has(item.id)}
                  onChange={e => {
                    const next = new Set(selected)
                    e.target.checked ? next.add(item.id) : next.delete(item.id)
                    setSelected(next)
                  }}
                  className="mt-1 accent-indigo-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded">{item.platform}</span>
                    <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded">{item.type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.status === "APPROVED" ? "bg-emerald-900/40 text-emerald-400" :
                      item.status === "PENDING" ? "bg-amber-900/40 text-amber-400" :
                      item.status === "POSTED" ? "bg-blue-900/40 text-blue-400" :
                      "bg-red-900/30 text-red-400"
                    }`}>{item.status}</span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{item.body}</p>
                  {item.hashtags.length > 0 && (
                    <p className="text-xs text-indigo-400 mt-2">{item.hashtags.map((h: string) => `#${h}`).join(" ")}</p>
                  )}
                </div>
                {item.status === "PENDING" && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => updateStatus(item.id, "APPROVED")}
                      className="px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-800 transition">
                      Approve
                    </button>
                    <button onClick={() => updateStatus(item.id, "REJECTED")}
                      className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs font-medium rounded-lg border border-red-900 transition">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
