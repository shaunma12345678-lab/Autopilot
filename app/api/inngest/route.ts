import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { layer1DailyCrawl, layer2WeeklyCrawl, manualCrawl } from "@/lib/inngest/jobs"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [layer1DailyCrawl, layer2WeeklyCrawl, manualCrawl],
})
