"use client"

import { useState } from "react"
import type { Review } from "@/app/generated/prisma"

interface Props {
  initialReviews: Review[]
  businessId: string
}

export default function ReputationManager({ initialReviews, businessId }: Props) {
  const [reviews, setReviews] = useState(initialReviews)
  const [generating, setGenerating] = useState<string | null>(null)
  const [filterRating, setFilterRating] = useState<number | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>("ALL")

  const filtered = reviews.filter(r => {
    if (filterRating !== null && r.rating !== filterRating) return false
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false
    return true
  })

  async function generateResponse(reviewId: string) {
    setGenerating(reviewId)
    const res = await fetch("/api/agents/reputation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId, businessId }),
    })
    if (res.ok) {
      const data = await res.json()
      setReviews(prev => prev.map(r => r.id === reviewId ? data.review : r))
    }
    setGenerating(null)
  }

  async function approveResponse(reviewId: string) {
    const res = await fetch("/api/agents/reputation/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId }),
    })
    if (res.ok) {
      setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, status: "APPROVED" } : r))
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-indigo-500">
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="POSTED">Posted</option>
        </select>
        <select value={filterRating?.toString() ?? ""} onChange={e => setFilterRating(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-indigo-500">
          <option value="">All Ratings</option>
          {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} stars</option>)}
        </select>
      </div>

      {/* Reviews */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No reviews match your filters</div>
      ) : (
        <div className="space-y-4">
          {filtered.map(review => (
            <div key={review.id} className={`bg-gray-900 border rounded-xl p-5 ${
              review.rating <= 2 ? "border-red-900/50" : "border-gray-800"
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{review.reviewerName}</span>
                    <span className="text-xs text-gray-500">{review.platform}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      review.status === "APPROVED" ? "bg-emerald-900/40 text-emerald-400" :
                      review.status === "PENDING" ? "bg-amber-900/40 text-amber-400" :
                      "bg-blue-900/40 text-blue-400"
                    }`}>{review.status}</span>
                  </div>
                  <p className="text-amber-400">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                </div>
                <p className="text-xs text-gray-500">{new Date(review.createdAt).toLocaleDateString()}</p>
              </div>
              <p className="text-sm text-gray-300 mb-4">{review.reviewText}</p>

              {review.response ? (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1.5">AI Response Draft:</p>
                  <p className="text-sm text-gray-300">{review.response}</p>
                  {review.status === "PENDING" && (
                    <button onClick={() => approveResponse(review.id)}
                      className="mt-2 px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-400 text-xs font-medium rounded-lg border border-emerald-800 transition">
                      Approve Response
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={() => generateResponse(review.id)}
                  disabled={generating === review.id}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition">
                  {generating === review.id ? "Generating..." : "Generate AI Response"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
