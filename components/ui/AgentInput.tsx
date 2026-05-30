"use client"

import { type TextareaHTMLAttributes, type InputHTMLAttributes } from "react"

interface FieldProps {
  label:        string
  hint?:        string
  accent?:      string   // tailwind color prefix: "indigo" | "violet" | "amber" etc.
  required?:    boolean
  children?:    React.ReactNode
}

/** Wrapper that provides consistent label + hint styling for all agent forms */
export function Field({ label, hint, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 uppercase tracking-wide">
        {label}
        {required && <span className="text-indigo-400 text-sm leading-none">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-600 leading-relaxed">{hint}</p>}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  accent?: string
}

/** Premium text input */
export function Input({ className = "", accent = "indigo", ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`
        w-full px-4 py-3
        bg-gray-900/80 border border-gray-700/60
        rounded-xl text-white text-sm
        placeholder-gray-600
        focus:outline-none focus:border-${accent}-500 focus:ring-1 focus:ring-${accent}-500/30
        transition-all duration-150
        ${className}
      `.replace(/\s+/g, " ").trim()}
    />
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  accent?: string
}

/** Premium textarea */
export function Textarea({ className = "", accent = "indigo", rows = 3, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      {...props}
      className={`
        w-full px-4 py-3
        bg-gray-900/80 border border-gray-700/60
        rounded-xl text-white text-sm
        placeholder-gray-600 resize-none
        focus:outline-none focus:border-${accent}-500 focus:ring-1 focus:ring-${accent}-500/30
        transition-all duration-150
        ${className}
      `.replace(/\s+/g, " ").trim()}
    />
  )
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  accent?:   string
  options:   Array<{ value: string; label: string }>
}

/** Premium select */
export function Select({ options, accent = "indigo", className = "", ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`
        w-full px-4 py-3
        bg-gray-900/80 border border-gray-700/60
        rounded-xl text-white text-sm
        focus:outline-none focus:border-${accent}-500 focus:ring-1 focus:ring-${accent}-500/30
        transition-all duration-150
        ${className}
      `.replace(/\s+/g, " ").trim()}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

type RunButtonProps = {
  loading:  boolean
  accent?:  string
  label:    string
  loadingLabel?: string
  onClick?: () => void
  disabled?: boolean
}

/** Premium agent run button with spinner */
export function RunButton({ loading, accent = "indigo", label, loadingLabel, onClick, disabled }: RunButtonProps) {
  const gradients: Record<string, string> = {
    indigo:  "from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-indigo-900/30",
    orange:  "from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 shadow-orange-900/30",
    emerald: "from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/30",
    teal:    "from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 shadow-teal-900/30",
    violet:  "from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-violet-900/30",
    cyan:    "from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-900/30",
    amber:   "from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-900/30",
    green:   "from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-green-900/30",
    red:     "from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-900/30",
    blue:    "from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-900/30",
  }

  const grad = gradients[accent] ?? gradients.indigo

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`
        w-full py-3.5 px-6
        bg-gradient-to-r ${grad}
        text-white font-bold text-sm rounded-xl
        shadow-lg disabled:opacity-40
        transition-all duration-150
        flex items-center justify-center gap-2
      `.replace(/\s+/g, " ").trim()}
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
          <span>{loadingLabel ?? "Agent working…"}</span>
        </>
      ) : label}
    </button>
  )
}

/** Card container for agent forms */
export function AgentCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-gray-900/60 border border-gray-800/80 rounded-2xl p-6 space-y-5 backdrop-blur-sm ${className}`}>
      {children}
    </div>
  )
}

/** Output panel */
export function OutputPanel({ children, loading, empty, accent = "indigo", className = "" }: {
  children?: React.ReactNode
  loading?:  boolean
  empty?:    React.ReactNode
  accent?:   string
  className?: string
}) {
  const spinnerColors: Record<string, string> = {
    indigo: "border-indigo-500", orange: "border-orange-500", teal: "border-teal-500",
    violet: "border-violet-500", amber: "border-amber-500", green: "border-green-500",
  }
  const spinnerColor = spinnerColors[accent] ?? spinnerColors.indigo

  return (
    <div className={`bg-gray-900/60 border border-gray-800/80 rounded-2xl overflow-auto backdrop-blur-sm min-h-[400px] flex flex-col ${className}`}>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className={`w-10 h-10 border-2 ${spinnerColor} border-t-transparent rounded-full animate-spin mx-auto mb-4`} />
            <p className="text-sm font-medium text-gray-300">Agent working…</p>
            <p className="text-xs text-gray-600 mt-1">Evaluating quality, iterating until satisfied</p>
          </div>
        </div>
      ) : children ? (
        <div className="p-6 flex-1">{children}</div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          {empty ?? <p className="text-sm text-gray-600 text-center">Output will appear here</p>}
        </div>
      )}
    </div>
  )
}
