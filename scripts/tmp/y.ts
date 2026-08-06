import { fetchDeepHistory } from "@/lib/price-history"
async function main() {
  for (const s of ["SPY","AAPL"]) {
    for (const r of ["10y","5y"]) {
      const b = await fetchDeepHistory(s, r)
      console.log(`${s} ${r}: ${b.length} bars ${b[0]?.date ?? "-"} -> ${b[b.length-1]?.date ?? "-"}`)
    }
  }
}
main()
