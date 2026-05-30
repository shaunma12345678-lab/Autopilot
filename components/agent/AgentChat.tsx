"use client"

import { useState, useEffect, useRef, useCallback } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:           string
  role:         "USER" | "ASSISTANT" | "SYSTEM"
  content:      string
  qualityScore?: number | null
  iterations?:  number | null
  searchUsed?:  boolean
  toolsUsed?:   string[]
  createdAt:    string
}

interface Conversation {
  id:        string
  agentSlug: string
  agentName: string
  title:     string
  pinned:    boolean
  updatedAt: string
  messages?: Message[]
}

interface AgentChatProps {
  agentSlug:     string
  agentName:     string
  agentCategory?: string
  systemPrompt?: string
  businessId?:   string
  accentColor?:  string
  placeholder?:  string
  welcomeMessage?: string
}

// ── Quality badge ─────────────────────────────────────────────────────────────

function QualityBadge({ score, iterations }: { score?: number | null; iterations?: number | null }) {
  if (!score) return null
  const color = score >= 9 ? "text-emerald-400 border-emerald-800/50 bg-emerald-950/30"
              : score >= 8 ? "text-blue-400 border-blue-800/50 bg-blue-950/30"
              : score >= 6 ? "text-amber-400 border-amber-800/50 bg-amber-950/30"
              : "text-gray-500 border-gray-700 bg-gray-900"
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-semibold ${color}`}>
      {score}/10
      {iterations && iterations > 1 ? <span className="opacity-60">·{iterations}×</span> : null}
    </span>
  )
}

// ── Tool / search indicator ───────────────────────────────────────────────────

function MetaBadges({ searchUsed, toolsUsed }: { searchUsed?: boolean; toolsUsed?: string[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {searchUsed && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/40 border border-indigo-800/30 text-indigo-400">
          🔍 Live search
        </span>
      )}
      {toolsUsed?.map(t => (
        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-950/40 border border-violet-800/30 text-violet-400">
          ⚡ {t.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  )
}

// ── Conversation sidebar ──────────────────────────────────────────────────────

function ConversationSidebar({
  agentSlug,
  agentName,
  activeId,
  onSelect,
  onNew,
  accentColor,
}: {
  agentSlug:   string
  agentName:   string
  activeId?:   string
  onSelect:    (conv: Conversation) => void
  onNew:       () => void
  accentColor: string
}) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch]               = useState("")
  const [sortBy, setSortBy]               = useState<"recent" | "pinned" | "name">("recent")
  const [renaming, setRenaming]           = useState<string | null>(null)
  const [renameVal, setRenameVal]         = useState("")

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?agentSlug=${encodeURIComponent(agentSlug)}`)
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } catch { /* ignore */ }
  }, [agentSlug])

  useEffect(() => { load() }, [load])

  async function pin(id: string, pinned: boolean) {
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    })
    load()
  }

  async function rename(id: string) {
    if (!renameVal.trim()) return
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameVal.trim() }),
    })
    setRenaming(null)
    load()
  }

  async function del(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" })
    load()
    if (id === activeId) onNew()
  }

  const sorted = [...conversations]
    .filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "pinned") return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      if (sortBy === "name")   return a.title.localeCompare(b.title)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })

  return (
    <div className="w-64 shrink-0 flex flex-col border-r border-gray-800 bg-gray-950 h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-800">
        <button
          onClick={onNew}
          className="w-full py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${accentColor}cc, ${accentColor}88)` }}
        >
          <span className="text-base leading-none">+</span> New Chat
        </button>
      </div>

      {/* Search + sort */}
      <div className="px-3 py-2 flex gap-1.5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search chats…"
          className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-xs placeholder-gray-600 focus:outline-none focus:border-gray-600"
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="px-1.5 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-gray-500 text-xs focus:outline-none"
        >
          <option value="recent">Recent</option>
          <option value="pinned">Pinned</option>
          <option value="name">A-Z</option>
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-700 text-center py-8">No chats yet. Start one above.</p>
        ) : sorted.map(conv => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`group relative rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
              conv.id === activeId ? "bg-gray-800 border border-gray-700" : "hover:bg-gray-900"
            }`}
          >
            {conv.pinned && <span className="absolute top-2 right-2 text-[9px] text-amber-500">📌</span>}
            {renaming === conv.id ? (
              <input
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") rename(conv.id); if (e.key === "Escape") setRenaming(null) }}
                onBlur={() => rename(conv.id)}
                autoFocus
                onClick={e => e.stopPropagation()}
                className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
              />
            ) : (
              <>
                <p className="text-xs font-medium text-gray-200 truncate pr-4">{conv.title}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{new Date(conv.updatedAt).toLocaleDateString()}</p>
              </>
            )}
            {/* Actions (visible on hover) */}
            <div className="absolute right-2 top-2.5 hidden group-hover:flex gap-0.5" onClick={e => e.stopPropagation()}>
              <button onClick={() => { setRenaming(conv.id); setRenameVal(conv.title) }} className="p-0.5 text-gray-600 hover:text-gray-300 text-xs">✏</button>
              <button onClick={() => pin(conv.id, !conv.pinned)} className="p-0.5 text-gray-600 hover:text-amber-400 text-xs">{conv.pinned ? "📌" : "📍"}</button>
              <button onClick={() => del(conv.id)} className="p-0.5 text-gray-600 hover:text-red-400 text-xs">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main AgentChat ────────────────────────────────────────────────────────────

export default function AgentChat({
  agentSlug,
  agentName,
  agentCategory,
  systemPrompt,
  businessId,
  accentColor = "#4f46e5",
  placeholder,
  welcomeMessage,
}: AgentChatProps) {
  const [activeConv,    setActiveConv]    = useState<Conversation | null>(null)
  const [messages,      setMessages]      = useState<Message[]>([])
  const [input,         setInput]         = useState("")
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState("")
  const [showSidebar,   setShowSidebar]   = useState(true)
  const [approvingId,   setApprovingId]   = useState<string | null>(null)
  const bottomRef                         = useRef<HTMLDivElement>(null)
  const textareaRef                       = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function loadConversation(conv: Conversation) {
    setActiveConv(conv)
    setError("")
    try {
      const res  = await fetch(`/api/conversations/${conv.id}`)
      const data = await res.json()
      setMessages(data.conversation?.messages ?? [])
    } catch { setMessages([]) }
  }

  function newChat() {
    setActiveConv(null)
    setMessages([])
    setError("")
    setInput("")
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput("")
    setError("")
    setLoading(true)

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const res  = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          conversationId: activeConv?.id,
          message:        text,
          agentSlug,
          agentName,
          businessId,
          systemPrompt,
          agentCategory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")

      if (!activeConv) {
        // New conversation was created
        setActiveConv({ id: data.conversationId, agentSlug, agentName, title: text.slice(0, 60), pinned: false, updatedAt: new Date().toISOString() })
      }

      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMsg.id),
        { id: `u-${Date.now()}`, role: "USER", content: text, createdAt: new Date().toISOString() },
        { ...data.message, createdAt: data.message.createdAt ?? new Date().toISOString() },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }

  async function approveAsExample(msg: Message) {
    if (msg.role !== "ASSISTANT" || approvingId) return
    setApprovingId(msg.id)
    const userMsg = messages[messages.findIndex(m => m.id === msg.id) - 1]
    try {
      await fetch("/api/agent-memory/examples", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ agentSlug, userInput: userMsg?.content ?? "", agentOutput: msg.content, quality: msg.qualityScore ?? 8 }),
      })
    } catch { /* non-blocking */ }
    finally { setApprovingId(null) }
  }

  return (
    <div className="flex h-full bg-gray-950 rounded-2xl overflow-hidden border border-gray-800" style={{ minHeight: "70vh" }}>
      {/* Sidebar */}
      {showSidebar && (
        <ConversationSidebar
          agentSlug={agentSlug}
          agentName={agentName}
          activeId={activeConv?.id}
          onSelect={loadConversation}
          onNew={newChat}
          accentColor={accentColor}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-950/80 backdrop-blur shrink-0">
          <button
            onClick={() => setShowSidebar(v => !v)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-gray-800 transition-colors text-sm"
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
          >☰</button>
          <div className="w-2 h-2 rounded-full" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}88` }} />
          <span className="font-semibold text-white text-sm">{agentName}</span>
          {activeConv && (
            <>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-gray-500 truncate max-w-48">{activeConv.title}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-gray-700 bg-gray-900 border border-gray-800 px-2 py-0.5 rounded-full">
              Memory · Search · Tools
            </span>
            <button onClick={newChat} className="text-xs text-gray-500 hover:text-white border border-gray-800 px-2.5 py-1 rounded-lg hover:bg-gray-800 transition-colors">
              + New
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-gray-800"
                style={{ background: `${accentColor}22` }}>
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: accentColor }} />
              </div>
              <p className="text-gray-400 font-semibold mb-1">{agentName}</p>
              <p className="text-gray-600 text-sm max-w-xs">
                {welcomeMessage ?? `Ask me anything about your business. I have live web search, tool execution, and persistent memory.`}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                {["Analyze my financials", "Create a content strategy", "Find top competitors"].map(s => (
                  <button key={s} onClick={() => { setInput(s); setTimeout(() => textareaRef.current?.focus(), 50) }}
                    className="text-xs px-3 py-1.5 rounded-xl border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "USER" ? "justify-end" : "justify-start"}`}>
                {msg.role !== "USER" && (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border border-gray-800"
                    style={{ background: `${accentColor}22` }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: accentColor }} />
                  </div>
                )}
                <div className={`group max-w-[75%] space-y-1.5 ${msg.role === "USER" ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "USER"
                      ? "text-white rounded-br-md"
                      : "bg-gray-900 border border-gray-800 text-gray-200 rounded-bl-md"
                  }`}
                    style={msg.role === "USER" ? { background: `${accentColor}cc` } : {}}>
                    {msg.content}
                  </div>
                  {/* Meta */}
                  {msg.role === "ASSISTANT" && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <QualityBadge score={msg.qualityScore} iterations={msg.iterations} />
                      <MetaBadges searchUsed={msg.searchUsed} toolsUsed={msg.toolsUsed} />
                      <button
                        onClick={() => approveAsExample(msg)}
                        disabled={approvingId === msg.id}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-600 hover:text-emerald-400 transition-all border border-transparent hover:border-emerald-800/50 rounded px-1.5 py-0.5"
                        title="Approve as few-shot example"
                      >
                        {approvingId === msg.id ? "Saving…" : "✓ Approve"}
                      </button>
                    </div>
                  )}
                </div>
                {msg.role === "USER" && (
                  <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-gray-400">
                    U
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-gray-800"
                style={{ background: `${accentColor}22` }}>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: accentColor }} />
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: accentColor, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">Thinking, searching, executing…</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-2.5 text-red-400 text-sm max-w-md text-center">
                {error}
                <button onClick={() => setError("")} className="ml-3 text-red-600 hover:text-red-400">✕</button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-950/80 shrink-0">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px` }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={placeholder ?? `Message ${agentName}… (Shift+Enter for newline)`}
                rows={1}
                disabled={loading}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700/70 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none disabled:opacity-40 transition-all leading-relaxed"
                style={{ maxHeight: "160px" }}
              />
            </div>
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-4 py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-40 transition-all hover:brightness-110 shrink-0"
              style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}bb)` }}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
              ) : "→"}
            </button>
          </div>
          <p className="text-[10px] text-gray-700 mt-1.5 px-1">
            Memory · Live search · Tool use · Self-improving quality gate
          </p>
        </div>
      </div>
    </div>
  )
}
