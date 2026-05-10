"use client"

import { useState } from "react"
import type { Lead } from "@/app/generated/prisma"

const COLUMNS: Array<{ key: Lead["status"]; label: string; color: string }> = [
  { key: "NEW", label: "New", color: "border-blue-600" },
  { key: "CONTACTED", label: "Contacted", color: "border-amber-500" },
  { key: "QUALIFIED", label: "Qualified", color: "border-indigo-500" },
  { key: "CONVERTED", label: "Converted", color: "border-emerald-500" },
  { key: "LOST", label: "Lost", color: "border-gray-600" },
]

interface Props {
  initialLeads: Lead[]
  businessId: string
}

export default function LeadsPipeline({ initialLeads, businessId }: Props) {
  const [leads, setLeads] = useState(initialLeads)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLead, setNewLead] = useState({ name: "", email: "", phone: "", source: "Manual" })
  const [adding, setAdding] = useState(false)

  async function addLead() {
    setAdding(true)
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newLead, businessId }),
    })
    if (res.ok) {
      const data = await res.json()
      setLeads(prev => [data.lead, ...prev])
      setNewLead({ name: "", email: "", phone: "", source: "Manual" })
      setShowAddForm(false)
    }
    setAdding(false)
  }

  async function moveToStatus(id: string, status: Lead["status"]) {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    }
  }

  const getColumnLeads = (status: Lead["status"]) => leads.filter(l => l.status === status)

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition">
          + Add Lead
        </button>
      </div>

      {showAddForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
          <h3 className="font-semibold mb-4">Add New Lead</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))}
              placeholder="Full name *"
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            <input value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))}
              placeholder="Email"
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            <input value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))}
              placeholder="Phone"
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            <select value={newLead.source} onChange={e => setNewLead(p => ({ ...p, source: e.target.value }))}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500">
              {["Manual", "Website", "Referral", "Social Media", "Cold Outreach"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addLead} disabled={!newLead.name || adding}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition">
              {adding ? "Adding..." : "Add Lead"}
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-5 gap-3">
        {COLUMNS.map(col => {
          const colLeads = getColumnLeads(col.key)
          return (
            <div key={col.key} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className={`border-t-2 ${col.color} -mt-3 mb-3 rounded-t-xl`} />
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">{col.label}</span>
                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{colLeads.length}</span>
              </div>
              <div className="space-y-2">
                {colLeads.map(lead => (
                  <div key={lead.id} className="bg-gray-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                    {lead.email && <p className="text-xs text-gray-400 truncate mt-0.5">{lead.email}</p>}
                    <p className="text-xs text-gray-500 mt-1">{lead.source}</p>
                    {col.key !== "CONVERTED" && col.key !== "LOST" && (
                      <select
                        value={lead.status}
                        onChange={e => moveToStatus(lead.id, e.target.value as Lead["status"])}
                        className="mt-2 w-full text-xs bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-gray-300 focus:outline-none">
                        {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {colLeads.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-4">Empty</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
