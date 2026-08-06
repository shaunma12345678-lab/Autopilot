import { fetchDailyHistory, getBenchmarkHistory } from "@/lib/price-history"
async function main() {
  for (const s of ["AAPL","KO","INTC"]) {
    const b = await fetchDailyHistory(s)
    console.log(`${s}: ${b.length} bars  ${b[0]?.date} -> ${b[b.length-1]?.date}`)
  }
  const bm = await getBenchmarkHistory()
  console.log(`SPY: ${bm.length} bars  ${bm[0]?.date} -> ${bm[bm.length-1]?.date}`)
}
main()
