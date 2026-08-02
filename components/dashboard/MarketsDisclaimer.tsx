// Persistent compliance disclaimer for every markets surface.
//
// This is deliberately prominent and on-page rather than buried in terms of
// service. The product analyzes public filings and market data and describes
// what it finds; it does not recommend transactions and is never tailored to
// an individual's circumstances. Keeping it impersonal and descriptive is what
// keeps it informational rather than advisory.
export default function MarketsDisclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[10px] text-gray-600 leading-relaxed">
        Informational analysis of public data only. Not investment advice and not a recommendation
        to buy or sell any asset. Past results do not predict future performance.
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-700/40 bg-gray-900/40 px-4 py-3">
      <p className="text-[11px] text-gray-400 leading-relaxed">
        <strong className="text-gray-300">Informational only — not investment advice.</strong>{" "}
        These scores describe what public filings and market data show about an asset&apos;s
        fundamentals and risk characteristics. They are not recommendations to buy, sell, or hold
        anything, are not tailored to your financial situation, and should not be relied on as the
        sole basis for any decision. All investing carries risk of loss, and past performance does
        not predict future results. Verify against primary sources and consider consulting a
        licensed financial professional.
      </p>
    </div>
  )
}
