import { redirect } from "next/navigation"

// Stocks now lives as a tab inside the top-level Markets section.
// Kept as a permanent redirect so existing links and bookmarks still work.
export default function StocksPage() {
  redirect("/markets")
}
