"use client"

import { useState } from "react"
import type { Content } from "@/app/generated/prisma/client"

interface Props {
  initialContent: Content[]
  businessId: string
}

export default function ContentApprovalQueue({ initialContent, businessId }: Props) {
  const [items, setItems] = useState(initialContent)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState("")
  const [generating, setGenerating] = useState(false)

  async function updateStatus(id: string, status: "APPROVED" | "REJECTED", body?: string) {
    const res = await fetch("/api/agents/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, editedBody: body }),
    })
    if (res.ok) {
      setItems(prev => prev.filter(item => item.id !== id))
      setEditingId(null)
    }
  }

  async function generateMore() {
    setGenerating(true)
    await fetch("/api/agents/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, contentType: "SOCIAL_POST", platform: "Instagram", count: 3 }),
    })
    window.location.reload()
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500 mb-4">No pending content to approve</p>
        <button onClick={generateMore} disabled={generating}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition">
          {generating ? "Generating..." : "Generate Content"}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.id} className="border border-gray-800 rounded-lg p-4">
          {editingId === item.id ? (
            <div className="space-y-2">
              <textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <button onClick={() => updateStatus(item.id, "APPROVED", editBody)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition">
                  Save & Approve
                </button>
                <button onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg transition">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{item.body}</p>
                <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">{item.platform}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateStatus(item.id, "APPROVED")}
                  className="px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-800 transition">
                  Approve
                </button>
                <button onClick={() => { setEditingId(item.id); setEditBody(item.body) }}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition">
                  Edit
                </button>
                <button onClick={() => updateStatus(item.id, "REJECTED")}
                  className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs font-medium rounded-lg border border-red-900 transition">
                  Reject
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
