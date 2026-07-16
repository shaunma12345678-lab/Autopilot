// /content — the Content Engine vertical (general business), peer to Real
// Estate. Session-authenticated; the same component powers the admin tab.

import ContentEngine from "@/components/dashboard/ContentEngine"

export default function ContentPage() {
  return (
    <div className="p-6 max-w-5xl">
      <ContentEngine />
    </div>
  )
}
