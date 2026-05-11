import Stripe from "stripe"
import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const ENV_FILE = resolve(ROOT, ".env.local")

const envContent = readFileSync(resolve(ROOT, ".vercel/.env.production.local"), "utf8")
const STRIPE_SECRET = envContent.match(/STRIPE_SECRET_KEY="?([^"\n]+)"?/)?.[1]

if (!STRIPE_SECRET) {
  console.error("Could not find STRIPE_SECRET_KEY in .vercel/.env.production.local")
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2026-04-22.dahlia" })

const PLANS = [
  { key: "STARTER",        name: "AutoPilot Starter",        amount: 4900,   desc: "30 posts/mo, unlimited reviews, 1 business" },
  { key: "GROWTH",         name: "AutoPilot Growth",          amount: 9900,   desc: "Unlimited posts, all 6 agents, 3 businesses" },
  { key: "PRO",            name: "AutoPilot Pro",             amount: 19900,  desc: "All 8 agents, white-label, API access" },
  { key: "AGENCY_STARTER", name: "AutoPilot Agency Starter",  amount: 39900,  desc: "Up to 10 clients, white-label dashboard" },
  { key: "AGENCY_GROWTH",  name: "AutoPilot Agency Growth",   amount: 79900,  desc: "Up to 25 clients, priority onboarding" },
  { key: "AGENCY_PREMIUM", name: "AutoPilot Agency Premium",  amount: 159900, desc: "Unlimited clients, dedicated account manager" },
]

async function findOrCreateProduct(name, desc) {
  const existing = await stripe.products.search({ query: `name:"${name}"`, limit: 1 })
  if (existing.data.length > 0) {
    console.log(`  Found existing product: ${name}`)
    return existing.data[0].id
  }
  const product = await stripe.products.create({ name, description: desc })
  console.log(`  Created product: ${name} → ${product.id}`)
  return product.id
}

async function findOrCreatePrice(productId, amount, name) {
  const existing = await stripe.prices.list({ product: productId, active: true, limit: 10 })
  const match = existing.data.find(p => p.unit_amount === amount && p.recurring?.interval === "month")
  if (match) {
    console.log(`  Found existing price: $${amount / 100}/mo → ${match.id}`)
    return match.id
  }
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: "usd",
    recurring: { interval: "month" },
    nickname: name,
  })
  console.log(`  Created price: $${amount / 100}/mo → ${price.id}`)
  return price.id
}

const priceIds = {}

for (const plan of PLANS) {
  console.log(`\nProcessing ${plan.name}...`)
  const productId = await findOrCreateProduct(plan.name, plan.desc)
  const priceId = await findOrCreatePrice(productId, plan.amount, plan.name)
  priceIds[plan.key] = priceId
}

console.log("\n✅ Stripe products ready. Price IDs:")
for (const [key, id] of Object.entries(priceIds)) {
  console.log(`  STRIPE_PRICE_${key}=${id}`)
}

let env = readFileSync(ENV_FILE, "utf8")
for (const [key, id] of Object.entries(priceIds)) {
  const varName = `STRIPE_PRICE_${key}`
  env = env.replace(new RegExp(`${varName}=.*`), `${varName}=${id}`)
}
writeFileSync(ENV_FILE, env)
console.log("\n✅ .env.local updated with price IDs")
console.log("\nNext: add these to Vercel env vars with `vercel env add`")
