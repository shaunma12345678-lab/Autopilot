import { Inngest } from "inngest"

export const inngest = new Inngest({
  id: "autopilot",
  name: "Autopilot Pre-Foreclosure",
})

export type CrawlEventData = {
  countyId: string
  layer: 1 | 2 | 3
  businessId?: string
}

export type Events = {
  "foreclosure/layer1.crawl": { data: CrawlEventData }
  "foreclosure/layer2.crawl": { data: CrawlEventData }
  "foreclosure/layer3.crawl": { data: CrawlEventData }
}
