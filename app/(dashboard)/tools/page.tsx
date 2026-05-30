"use client"

import { useState, useEffect } from "react"

interface CustomTool {
  id:          string
  name:        string
  description: string
  toolType:    string
  config:      Record<string, unknown>
  enabled:     boolean
  createdAt:   string
}

const TOOL_TYPES = [
  { id: "webhook",  label: "Webhook",     icon: "🔗", description: "POST to any URL when the tool is called" },
  { id: "api",      label: "REST API",    icon: "⚡", description: "Call an external REST API endpoint" },
  { id: "database", label: "Database",    icon: "🗄",  description: "Query or write to an external database" },
]

const BUILT_IN_TOOLS = [
  { name: "web_search",      label: "Web Search",     icon: "🔍", description: "Live search via Tavily — triggers automatically on time-sensitive queries" },
  { name: "create_lead",     label: "Create Lead",    icon: "👤", description: "Save qualified leads to your CRM from any conversation" },
  { name: "save_content",    label: "Save Content",   icon: "📝", description: "Push generated content to the approval queue" },
  { name: "save_memory",     label: "Save Memory",    icon: "🧠", description: "Store important facts for recall in future conversations" },
  { name: "delegate_to_agent", label: "Delegate Agent", icon: "🤝", description: "Spawn a specialist sub-agent for complex multi-step tasks" },
]

export default function ToolsPage() {
  const [tools,     setTools]     = useState<CustomTool[]>([])
  const [loading,   setLoading]   = useState(true)
  const [creating,  setCreating]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState("")
  const [toast,     setToast]     = useState("")

  const [form, setForm] = useState({
    name:        "",
    description: "",
    toolType:    "webhook",
    webhookUrl:  "",
    headers:     "",
    notes:       "",
  })

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500) }

  async function load() {
    try {
      const res  = await fetch("/api/custom-tools")
      const data = await res.json()
      setTools(data.tools ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function create() {
    if (!form.name.trim() || !form.description.trim()) { setError("Name and description are required"); return }
    setSaving(true); setError("")
    try {
      const config: Record<string, unknown> = { webhookUrl: form.webhookUrl, notes: form.notes }
      if (form.headers.trim()) {
        try { config.headers = JSON.parse(form.headers) } catch { config.headers = {} }
      }
      const res = await fetch("/api/custom-tools", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, description: form.description, toolType: form.toolType, config }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      setForm({ name: "", description: "", toolType: "webhook", webhookUrl: "", headers: "", notes: "" })
      setCreating(false)
      await load()
      showToast("✓ Tool created — agents can now call it")
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setSaving(false) }
  }

  async function toggle(id: string, enabled: boolean) {
    await fetch("/api/custom-tools", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    })
    setTools(prev => prev.map(t => t.id === id ? { ...t, enabled } : t))
    showToast(enabled ? "Tool enabled" : "Tool disabled")
  }

  async function del(id: string) {
    if (!confirm("Delete this tool? Agents will no longer be able to call it.")) return
    await fetch(`/api/custom-tools?id=${id}`, { method: "DELETE" })
    setTools(prev => prev.filter(t => t.id !== id))
    showToast("Tool deleted")
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-lg">⚡</div>
          <h1 className="text-2xl font-bold">Tools</h1>
        </div>
        <p className="text-gray-400 text-sm">Agents automatically call these tools during conversations — built-in tools are always active, custom tools extend what agents can do.</p>
      </div>

      {/* Built-in tools */}
      <div className="mb-8">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Built-in Tools (always active)</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BUILT_IN_TOOLS.map(t => (
            <div key={t.name} className="bg-gray-900/60 border border-emerald-800/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span>{t.icon}</span>
                <span className="text-sm font-semibold text-white">{t.label}</span>
                <span className="ml-auto text-[10px] bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 rounded-full px-1.5 py-0.5 font-semibold">Active</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{t.description}</p>
              <p className="text-[10px] text-gray-700 mt-1.5 font-mono">{t.name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom tools */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Custom Tools ({tools.length})</p>
          <button
            onClick={() => setCreating(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-violet-700/50 bg-violet-950/30 text-violet-400 hover:bg-violet-950/60 transition-colors font-semibold"
          >
            {creating ? "Cancel" : "+ New Tool"}
          </button>
        </div>

        {/* Create form */}
        {creating && (
          <div className="bg-gray-900/80 border border-gray-700 rounded-2xl p-6 mb-5 space-y-4">
            <h3 className="font-semibold text-white text-sm">Create Custom Tool</h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Tool Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="send_slack_alert" className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors" />
                <p className="text-[10px] text-gray-600 mt-1">Lowercase, underscores only. Agents call this by name.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Type</label>
                <div className="flex gap-2">
                  {TOOL_TYPES.map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, toolType: t.id }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${form.toolType === t.id ? "border-violet-600 bg-violet-950/50 text-violet-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description <span className="text-gray-600 font-normal normal-case">(agents read this to decide when to call the tool)</span></label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Send a Slack alert to #alerts when an urgent issue is detected" className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500 resize-none transition-colors" />
            </div>

            {form.toolType === "webhook" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Webhook URL</label>
                  <input value={form.webhookUrl} onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
                    placeholder="https://hooks.slack.com/services/..." className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Custom Headers <span className="text-gray-600 font-normal normal-case">(JSON, optional)</span></label>
                  <input value={form.headers} onChange={e => setForm(f => ({ ...f, headers: e.target.value }))}
                    placeholder='{"Authorization": "Bearer token"}' className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors" />
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setCreating(false)} className="px-4 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={create} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-colors" style={{ background: "linear-gradient(135deg,#7c3aed,#4f46e5)" }}>
                {saving ? "Creating…" : "Create Tool →"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : tools.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-800 rounded-2xl">
            <p className="text-gray-500 font-medium">No custom tools yet</p>
            <p className="text-gray-700 text-sm mt-1">Create a webhook tool to let agents interact with Slack, Zapier, Make, or any HTTP endpoint.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tools.map(tool => (
              <div key={tool.id} className={`bg-gray-900/60 border rounded-xl p-4 flex items-center gap-4 transition-colors ${tool.enabled ? "border-gray-800" : "border-gray-800/40 opacity-60"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white font-mono">{tool.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-600">{tool.toolType}</span>
                    {tool.enabled && <span className="text-[10px] bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 rounded-full px-1.5 py-0.5 font-semibold">Active</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{tool.description}</p>
                  {typeof (tool.config as Record<string, unknown>)?.webhookUrl === "string" && (
                    <p className="text-[10px] text-gray-700 mt-0.5 font-mono truncate">{String((tool.config as Record<string, unknown>).webhookUrl)}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => toggle(tool.id, !tool.enabled)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${tool.enabled ? "border-gray-700 text-gray-400 hover:border-red-800 hover:text-red-400" : "border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/30"}`}>
                    {tool.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => del(tool.id)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-800 text-gray-600 hover:border-red-800/50 hover:text-red-400 transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl z-50 bg-gray-900 border border-gray-700 text-white">
          {toast}
        </div>
      )}
    </div>
  )
}
