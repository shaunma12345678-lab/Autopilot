"use client"

import { useState } from "react"
import type { Business } from "@/app/generated/prisma/client"

interface Props {
  business: Business
}

export default function SettingsForm({ business }: Props) {
  const brandVoice = business.brandVoice as Record<string, unknown>
  const [form, setForm] = useState({
    name: business.name,
    type: business.type,
    description: business.description,
    location: business.location,
    phone: business.phone ?? "",
    website: business.website ?? "",
    tone: (brandVoice.tone as string) ?? "friendly",
    targetAudience: (brandVoice.targetAudience as string) ?? "",
    emojiUsage: (brandVoice.emojiUsage as boolean) ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/businesses/${business.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  function u(field: keyof typeof form, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      {/* Business Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Business Information</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Business name</label>
              <input value={form.name} onChange={e => u("name", e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Business type</label>
              <input value={form.type} onChange={e => u("type", e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => u("description", e.target.value)}
              rows={3} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-indigo-500 transition" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Location</label>
              <input value={form.location} onChange={e => u("location", e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => u("phone", e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Website</label>
              <input value={form.website} onChange={e => u("website", e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition" />
            </div>
          </div>
        </div>
      </div>

      {/* Brand Voice */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Brand Voice</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Content tone</label>
            <select value={form.tone} onChange={e => u("tone", e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition">
              {["professional", "casual", "friendly", "authoritative"].map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Target audience</label>
            <textarea value={form.targetAudience} onChange={e => u("targetAudience", e.target.value)}
              rows={2} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-indigo-500 transition" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="emoji" checked={form.emojiUsage} onChange={e => u("emojiUsage", e.target.checked)}
              className="accent-indigo-600 w-4 h-4" />
            <label htmlFor="emoji" className="text-sm text-gray-300">Use emojis in posts</label>
          </div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold rounded-lg transition">
        {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
      </button>
    </div>
  )
}
