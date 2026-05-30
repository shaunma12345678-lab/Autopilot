"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"

/* ── Types ── */
interface Stats { totalUsers: number; totalBusinesses: number; totalContent: number; totalReviews: number; totalLeads: number; approvedContent: number; pendingContent: number; avgRating: string }
interface PlanCount { plan: string; _count: number }
interface User { id: string; email: string; name: string | null; plan: string; createdAt: string }
interface Business { id: string; name: string; type: string; createdAt: string; user: { email: string }; _count: { content: number; reviews: number; leads: number } }
interface AdminData { stats: Stats; planDistribution: PlanCount[]; recentUsers: User[]; recentBusinesses: Business[] }

interface APAgent { id: string; name: string; color: string; status: "active" | "idle" | "error"; last24h: number; lastHour: number; queueSize: number; successRate: number; description: string; route?: string }
interface FeedItem { agentId: string; agentName: string; color: string; msg: string; status: string; ts: string }
interface AgentData { agents: APAgent[]; activityFeed: FeedItem[] }

interface BOSAgent { name: string; slug: string; description: string; category: string; schedule: string | null; enabled: boolean; lastRunAt: string | null; lastRunOk: boolean | null; lastResult: string | null; errorCount: number; runCount: number; circuitState: string }
interface BOSWorkflow { id: string; name: string; description: string; category: string; trigger: { type: string; eventType?: string; cron?: string }; enabled: boolean; lastRunAt: string | null; lastRunOk: boolean | null; runCount: number; errorCount: number; recentRuns: { id: string; startedAt: string; success: boolean; stepsCompleted: number }[]; steps: { agentName: string; parallel?: boolean }[] }
interface QueueJob { id: string; agentName: string; agentSlug: string; priority: string; status: string; attempts: number; maxAttempts: number; createdAt: string; startedAt?: string; finishedAt?: string; triggeredBy: string; error?: string; result?: unknown }
interface QueueStats { queued: number; running: number; completed: number; failed: number; dead: number }

interface SandboxPreset { id: string; name: string; systemPrompt: string; userPrompt: string; jsonMode: boolean }

const SANDBOX_PRESETS: SandboxPreset[] = [
  { id: "content", name: "Content Agent", systemPrompt: "You are a world-class social media strategist. Return valid JSON only.", userPrompt: `Generate 3 Instagram posts for a local bakery called "Sweet Sunrise" in Austin TX.\nReturn JSON: [{"body":"...","hashtags":["..."],"hook":"...","bestTime":"..."}]`, jsonMode: true },
  { id: "sales", name: "Sales Agent", systemPrompt: "You are an elite sales coach. Return valid JSON only.", userPrompt: `Build a sales toolkit for a residential HVAC company targeting homeowners. Service: AC Installation. Price: $3,500–$6,000.\nReturn JSON: {phoneOpener, discoveryQuestions, objectionHandlers, closingLines}`, jsonMode: true },
  { id: "financial", name: "Financial Agent", systemPrompt: "You are a trusted CFO for small businesses. Return valid JSON only.", userPrompt: `Analyze: Revenue $18,500. Expenses: Rent $2,200, Payroll $7,000, Marketing $800, Software $450, Supplies $1,200. Prev month: $15,200.\nReturn JSON: {headline, keyMetrics, insights, recommendations, healthScore}`, jsonMode: true },
  { id: "pricing", name: "Pricing Agent", systemPrompt: "You are a pricing strategy consultant. Return valid JSON only.", userPrompt: `Pricing strategy for a cleaning company in Dallas. Current: {"1BR":"$90","2BR":"$120","deep":"$200"}. Competitors: MaidPro, Molly Maid.\nReturn JSON: {pricingAudit, packageStrategy, pricingPsychologyTips}`, jsonMode: true },
  { id: "competitor", name: "Competitor Intel", systemPrompt: "You are a strategic intelligence analyst. Return valid JSON only.", userPrompt: `SWOT for a local Italian restaurant vs Olive Garden, Greek restaurant, 3 pizza chains.\nReturn JSON: {strengths, weaknesses, opportunities, threats, top3Actions}`, jsonMode: true },
  { id: "legal", name: "Legal Agent", systemPrompt: "You are a business attorney for small businesses. Return valid JSON only.", userPrompt: `Service agreement for web design freelancer. Service: 5-page site + 1yr hosting. Price: $2,500 (50/50).\nReturn JSON: {agreement, keyTermsSummary, disclaimer}`, jsonMode: true },
  { id: "email", name: "Email Marketing", systemPrompt: "You are an elite email strategist. Return valid JSON only.", userPrompt: `3-email win-back for a gym with members inactive 60+ days. Offer: First week free.\nReturn JSON: {emails:[{subject,previewText,body,cta}]}`, jsonMode: true },
  { id: "hiring", name: "Hiring Agent", systemPrompt: "You are a senior talent acquisition expert. Return valid JSON only.", userPrompt: `Job description for Customer Success Manager at software startup. Salary: $65k–$75k. Required: 2+ years SaaS CS.\nReturn JSON: {jobPosting, internalScorecardTemplate}`, jsonMode: true },
  { id: "operations", name: "Operations Agent", systemPrompt: "You are an elite COO for small businesses. Return valid JSON only.", userPrompt: `Weekly operations checklist for a 10-person marketing agency. Include AM standup, client deliverable review, and EOD wrap.\nReturn JSON: {dailySchedule, criticalKPIs, delegationMatrix, bottlenecks}`, jsonMode: true },
  { id: "board-report", name: "Board Report", systemPrompt: "You are a world-class CFO. Return valid JSON only.", userPrompt: `Analyze this business: MRR $85,000 (+12% MoM), ARR $1.02M, Active customers 142, Churn 2.1%, Pipeline $340K, Cash $210K.\nReturn JSON: {executiveSummary, financialHighlights, risks, keyDecisions, outlook}`, jsonMode: true },
]

/* ── Static BOS data (shown when Business OS is offline) ── */
const STATIC_BOS_AGENTS: BOSAgent[] = [
  { name: "Financial Command Center", slug: "financial-command-center", description: "Daily P&L sweep, bank feed reconciliation, and AI anomaly detection across all accounts.", category: "Finance", schedule: "0 7 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Invoicing & Collections", slug: "invoicing-collections", description: "Detects overdue invoices and sends escalating payment reminders via Stripe and QuickBooks.", category: "Finance", schedule: "0 8 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Cash Flow Forecaster", slug: "cash-flow-forecaster", description: "30/60/90-day cash projection using historical patterns and scheduled receivables.", category: "Finance", schedule: "0 8 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Expense Guardian", slug: "expense-guardian", description: "Flags duplicate charges, unusual vendors, and budget overruns by category.", category: "Finance", schedule: "0 9 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Tax Tracker", slug: "tax-tracker", description: "Tracks estimated quarterly taxes, deadline alerts, and deduction opportunities.", category: "Finance", schedule: "0 9 1 * *", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Lead Qualifier", slug: "lead-qualifier", description: "Scores inbound leads A–D using BANT framework with company research enrichment.", category: "Sales", schedule: null, enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Deal Nurture", slug: "deal-nurture", description: "Personalized follow-up sequences for stalled deals with context-aware messaging.", category: "Sales", schedule: "0 8 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Proposal Builder", slug: "proposal-builder", description: "Generates custom proposals with tailored pricing and matched case studies.", category: "Sales", schedule: null, enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Pipeline Analyst", slug: "pipeline-analyst", description: "Forecasts close probability, flags at-risk deals, and generates weekly pipeline briefings.", category: "Sales", schedule: "0 7 * * 2", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Content Factory", slug: "content-factory", description: "Generates on-brand blog posts, social captions, and email copy from a single brief.", category: "Marketing", schedule: "0 7 * * 1", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "SEO Monitor", slug: "seo-monitor", description: "Tracks keyword rankings, flags page drops, and generates optimization recommendations.", category: "Marketing", schedule: "0 7 * * 1", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Ad Optimizer", slug: "ad-optimizer", description: "Analyzes Google and Meta campaign performance and recommends bid and creative changes.", category: "Marketing", schedule: "0 8 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Email Campaign", slug: "email-campaign", description: "Designs and schedules targeted email campaigns with A/B subject line testing.", category: "Marketing", schedule: "0 9 * * 1", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Support Bot", slug: "support-bot", description: "Triages inbound tickets, auto-resolves tier-1 issues, and escalates complex cases.", category: "Customer Success", schedule: null, enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Churn Prevention", slug: "churn-prevention", description: "Identifies at-risk accounts by usage signals and triggers targeted retention campaigns.", category: "Customer Success", schedule: "0 8 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Feedback Synthesizer", slug: "feedback-synthesizer", description: "Aggregates NPS, G2, and support feedback into weekly sentiment reports.", category: "Customer Success", schedule: "0 9 * * 5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Expansion Revenue", slug: "expansion-revenue", description: "Identifies upsell and cross-sell opportunities based on product usage and account health.", category: "Customer Success", schedule: "0 9 * * 1", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Meeting Scheduler", slug: "meeting-scheduler", description: "Handles inbound scheduling via natural language across Google and Outlook calendars.", category: "Operations", schedule: null, enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Project Status", slug: "project-status", description: "Compiles daily progress from Notion and Linear into stakeholder-ready summaries.", category: "Operations", schedule: "0 8 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Vendor Inventory", slug: "vendor-inventory", description: "Monitors stock levels, compares vendor quotes, and auto-generates purchase orders.", category: "Operations", schedule: "0 7 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Compliance Watchdog", slug: "compliance-watchdog", description: "Scans contracts and operations for regulatory flags and generates compliance checklists.", category: "Operations", schedule: "0 9 * * 1", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Talent Scout", slug: "talent-scout", description: "Sources and ranks candidates from LinkedIn and job boards against your open roles.", category: "HR", schedule: "0 9 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "New Hire Concierge", slug: "new-hire-concierge", description: "Automates full onboarding: 30/60/90-day plan, Notion page, welcome email, Slack intro.", category: "HR", schedule: null, enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "PTO & Payroll Validator", slug: "pto-payroll-validator", description: "Cross-checks timesheets, validates PTO balances, and flags payroll discrepancies.", category: "HR", schedule: "0 7 * * 5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Threat Detector", slug: "threat-detector", description: "Monitors Okta for anomalous logins, correlates security events, and alerts via Slack.", category: "Tech", schedule: "*/15 * * * *", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Deploy Guardian", slug: "deploy-guardian", description: "Watches GitHub CI/CD pipelines, auto-diagnoses failed builds, and posts fix suggestions.", category: "Tech", schedule: "*/30 * * * *", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Analytics Pipeline", slug: "analytics-pipeline", description: "Orchestrates ETL jobs, validates data quality, and alerts on pipeline failures.", category: "Tech", schedule: "0 6 * * 1-5", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Competitive Intel", slug: "competitive-intel", description: "Monitors competitor pricing, features, job postings, and press. Delivers weekly briefings.", category: "Executive", schedule: "0 7 * * 1", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
  { name: "Board Report Generator", slug: "board-report-generator", description: "Compiles monthly board pack with KPIs, executive narrative, and forward-looking analysis.", category: "Executive", schedule: "0 7 1 * *", enabled: true, lastRunAt: null, lastRunOk: null, lastResult: null, errorCount: 0, runCount: 0, circuitState: "closed" },
]

const STATIC_BOS_WORKFLOWS: BOSWorkflow[] = [
  { id: "new-lead-pipeline", name: "New Lead Pipeline", description: "Qualifies every inbound lead and immediately nurtures high-tier prospects.", category: "Sales", trigger: { type: "event", eventType: "lead.created" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Lead Qualifier" }, { agentName: "Deal Nurture" }] },
  { id: "payment-failure-recovery", name: "Payment Failure Recovery", description: "Runs invoicing collections and churn prevention in parallel when a payment fails.", category: "Finance", trigger: { type: "event", eventType: "invoice.payment_failed" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Invoicing & Collections", parallel: true }, { agentName: "Churn Prevention", parallel: true }] },
  { id: "cancellation-response", name: "Cancellation Response", description: "When a subscription cancels, immediately runs churn analysis and expansion revenue scan.", category: "Customer Success", trigger: { type: "event", eventType: "customer.subscription.canceled" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Churn Prevention", parallel: true }, { agentName: "Expansion Revenue", parallel: true }] },
  { id: "new-customer-welcome", name: "New Customer Welcome", description: "Fires on subscription creation. Runs expansion revenue scan and health monitoring setup.", category: "Customer Success", trigger: { type: "event", eventType: "customer.subscription.created" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Expansion Revenue" }] },
  { id: "employee-onboarding", name: "Employee Onboarding", description: "Triggers the full onboarding workflow when a new employee is hired.", category: "HR", trigger: { type: "event", eventType: "employee.hired" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "New Hire Concierge" }] },
  { id: "incident-response", name: "Deploy Incident Response", description: "When CI/CD fails, simultaneously runs Deploy Guardian and Threat Detector.", category: "Tech", trigger: { type: "event", eventType: "deploy.failed" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Deploy Guardian", parallel: true }, { agentName: "Threat Detector", parallel: true }] },
  { id: "weekly-business-review", name: "Weekly Business Review", description: "Every Monday at 6 AM: analytics, competitive intel, and pipeline analyst in parallel.", category: "Executive", trigger: { type: "schedule", cron: "0 6 * * 1" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Analytics Pipeline", parallel: true }, { agentName: "Competitive Intel", parallel: true }, { agentName: "Pipeline Analyst", parallel: true }] },
  { id: "monthly-reporting", name: "Monthly Reporting Suite", description: "1st of every month at 7 AM: analytics pipeline runs first, then board report is generated.", category: "Executive", trigger: { type: "schedule", cron: "0 7 1 * *" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Analytics Pipeline" }, { agentName: "Board Report Generator" }] },
  { id: "daily-financial-health", name: "Daily Financial Health", description: "Weekdays at 6 AM: financial command center and cash flow forecaster run in parallel.", category: "Finance", trigger: { type: "schedule", cron: "0 6 * * 1-5" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Financial Command Center", parallel: true }, { agentName: "Cash Flow Forecaster", parallel: true }] },
  { id: "security-infrastructure-sweep", name: "Security & Infrastructure Sweep", description: "Twice daily: Threat Detector and Deploy Guardian run simultaneously at 8 AM and 8 PM.", category: "Tech", trigger: { type: "schedule", cron: "0 8,20 * * *" }, enabled: true, lastRunAt: null, lastRunOk: null, runCount: 0, errorCount: 0, recentRuns: [], steps: [{ agentName: "Threat Detector", parallel: true }, { agentName: "Deploy Guardian", parallel: true }] },
]

const _UNUSED_INTEGRATIONS_PLACEHOLDER = [
  { id: "stripe", name: "Stripe", abbr: "ST", color: "#635bff", category: "Payments & Finance", description: "Payment processing, subscription management, and revenue analytics.", authType: "apikey", fields: [{ key: "secretKey", label: "Secret Key", placeholder: "sk_live_...", secret: true }, { key: "webhookSecret", label: "Webhook Secret", placeholder: "whsec_...", secret: true }], capabilities: ["Revenue sync", "Subscription management", "Invoice automation", "Churn detection"] },
  { id: "quickbooks", name: "QuickBooks", abbr: "QB", color: "#2ca01c", category: "Payments & Finance", description: "Sync accounting data, invoices, expenses, and financial reports.", authType: "apikey", fields: [{ key: "clientId", label: "Client ID", placeholder: "Enter Client ID" }, { key: "clientSecret", label: "Client Secret", placeholder: "Enter Client Secret", secret: true }, { key: "companyId", label: "Company ID", placeholder: "Enter Company ID" }], capabilities: ["P&L sync", "Invoice management", "Expense categorization", "Tax prep"] },
  { id: "plaid", name: "Plaid", abbr: "PL", color: "#0a85ea", category: "Payments & Finance", description: "Connect bank accounts for real-time cash flow monitoring and reconciliation.", authType: "apikey", fields: [{ key: "clientId", label: "Client ID", placeholder: "Enter Plaid Client ID" }, { key: "secret", label: "Secret", placeholder: "Enter Plaid Secret", secret: true }], capabilities: ["Bank account sync", "Transaction monitoring", "Cash flow analysis", "Fraud detection"] },
  { id: "xero", name: "Xero", abbr: "XE", color: "#13b5ea", category: "Payments & Finance", description: "Cloud accounting integration for invoicing, payroll, and financial reporting.", authType: "apikey", fields: [{ key: "clientId", label: "Client ID", placeholder: "Enter Xero Client ID" }, { key: "clientSecret", label: "Client Secret", placeholder: "Enter Xero Client Secret", secret: true }], capabilities: ["Account reconciliation", "Invoice processing", "Payroll sync", "Financial reporting"] },
  { id: "hubspot", name: "HubSpot", abbr: "HS", color: "#ff7a59", category: "CRM & Sales", description: "Sync contacts, deals, and pipeline data for AI-powered sales automation.", authType: "apikey", fields: [{ key: "apiKey", label: "Private App Token", placeholder: "pat-...", secret: true }], capabilities: ["Contact sync", "Deal management", "Lead scoring", "Pipeline forecasting"] },
  { id: "salesforce", name: "Salesforce", abbr: "SF", color: "#00a1e0", category: "CRM & Sales", description: "Enterprise CRM integration for lead management and opportunity tracking.", authType: "apikey", fields: [{ key: "instanceUrl", label: "Instance URL", placeholder: "https://yourorg.salesforce.com" }, { key: "accessToken", label: "Access Token", placeholder: "Enter Access Token", secret: true }], capabilities: ["Lead management", "Opportunity tracking", "Account intelligence", "Forecast sync"] },
  { id: "pipedrive", name: "Pipedrive", abbr: "PD", color: "#4fbc27", category: "CRM & Sales", description: "Sales pipeline management and deal tracking automation.", authType: "apikey", fields: [{ key: "apiKey", label: "API Token", placeholder: "Enter Pipedrive API Token", secret: true }], capabilities: ["Deal sync", "Activity logging", "Pipeline analytics", "Contact management"] },
  { id: "google-analytics", name: "Google Analytics", abbr: "GA", color: "#e37400", category: "Marketing", description: "Website traffic, conversion data, and audience behavior analytics.", authType: "apikey", fields: [{ key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXXXXX" }, { key: "propertyId", label: "Property ID", placeholder: "123456789" }], capabilities: ["Traffic analysis", "Conversion tracking", "Audience insights", "Goal monitoring"] },
  { id: "google-ads", name: "Google Ads", abbr: "GG", color: "#4285f4", category: "Marketing", description: "Campaign performance monitoring and keyword-level spend optimization.", authType: "apikey", fields: [{ key: "customerId", label: "Customer ID", placeholder: "123-456-7890" }, { key: "developerToken", label: "Developer Token", placeholder: "Enter Developer Token", secret: true }], capabilities: ["Campaign performance", "Bid optimization", "Keyword analysis", "Spend reporting"] },
  { id: "meta", name: "Meta Ads", abbr: "FB", color: "#0866ff", category: "Marketing", description: "Facebook and Instagram campaign management and audience targeting.", authType: "apikey", fields: [{ key: "accessToken", label: "Access Token", placeholder: "Enter Meta Access Token", secret: true }, { key: "adAccountId", label: "Ad Account ID", placeholder: "act_123456789" }], capabilities: ["Campaign management", "Audience targeting", "Creative performance", "ROAS tracking"] },
  { id: "klaviyo", name: "Klaviyo", abbr: "KL", color: "#006bff", category: "Marketing", description: "Email and SMS marketing automation with advanced customer segmentation.", authType: "apikey", fields: [{ key: "apiKey", label: "Private API Key", placeholder: "pk_...", secret: true }], capabilities: ["Email campaigns", "SMS automation", "Customer segmentation", "Revenue attribution"] },
  { id: "slack", name: "Slack", abbr: "SL", color: "#4a154b", category: "Communications", description: "Receive agent alerts, daily summaries, and error notifications in your workspace.", authType: "webhook", fields: [{ key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/...", secret: true }, { key: "channel", label: "Default Channel", placeholder: "#alerts" }], capabilities: ["Agent alerts", "Daily summaries", "Error notifications", "Custom reports"] },
  { id: "twilio", name: "Twilio", abbr: "TW", color: "#f22f46", category: "Communications", description: "SMS and voice communication for customer outreach and agent notifications.", authType: "apikey", fields: [{ key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxx" }, { key: "authToken", label: "Auth Token", placeholder: "Enter Auth Token", secret: true }, { key: "fromNumber", label: "From Number", placeholder: "+15550000000" }], capabilities: ["SMS outreach", "Voice calls", "WhatsApp messaging", "Two-factor auth"] },
  { id: "resend", name: "Resend", abbr: "RS", color: "#111827", category: "Communications", description: "Transactional email delivery for agent-generated outreach and notifications.", authType: "apikey", fields: [{ key: "apiKey", label: "API Key", placeholder: "re_...", secret: true }, { key: "fromEmail", label: "From Email", placeholder: "hello@yourdomain.com" }], capabilities: ["Transactional email", "Agent notifications", "Customer outreach", "Delivery analytics"] },
  { id: "notion", name: "Notion", abbr: "NO", color: "#191919", category: "Productivity", description: "Sync agent outputs, reports, and knowledge directly to your Notion workspace.", authType: "apikey", fields: [{ key: "apiKey", label: "Integration Token", placeholder: "secret_...", secret: true }, { key: "databaseId", label: "Database ID", placeholder: "Enter Database ID" }], capabilities: ["Document creation", "Database sync", "Report generation", "Knowledge base updates"] },
  { id: "linear", name: "Linear", abbr: "LN", color: "#5e6ad2", category: "Productivity", description: "Project and issue tracking for engineering and operations teams.", authType: "apikey", fields: [{ key: "apiKey", label: "API Key", placeholder: "lin_api_...", secret: true }, { key: "teamId", label: "Team ID", placeholder: "Enter Team ID" }], capabilities: ["Issue creation", "Sprint tracking", "Bug reporting", "Roadmap sync"] },
  { id: "github", name: "GitHub", abbr: "GH", color: "#24292e", category: "Productivity", description: "Repository monitoring, CI/CD status, and automated code review workflows.", authType: "apikey", fields: [{ key: "personalAccessToken", label: "Personal Access Token", placeholder: "ghp_...", secret: true }, { key: "org", label: "Organization", placeholder: "your-org" }], capabilities: ["CI/CD monitoring", "PR automation", "Security scanning", "Deploy tracking"] },
  { id: "openai", name: "OpenAI", abbr: "AI", color: "#10a37f", category: "AI & Intelligence", description: "Supplemental AI capabilities for embeddings, vision analysis, and specialized tasks.", authType: "apikey", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-...", secret: true }], capabilities: ["Embeddings", "Vision analysis", "Fine-tuned models", "Vector search"] },
]

/* ── Helpers ── */
const PLAN_COLORS: Record<string, string> = { FREE: "text-gray-400 bg-gray-900 border-gray-700", STARTER: "text-blue-400 bg-blue-950/40 border-blue-800/50", GROWTH: "text-indigo-400 bg-indigo-950/40 border-indigo-800/50", PRO: "text-violet-400 bg-violet-950/40 border-violet-800/50", AGENCY_STARTER: "text-emerald-400 bg-emerald-950/40 border-emerald-800/50", AGENCY_GROWTH: "text-cyan-400 bg-cyan-950/40 border-cyan-800/50", AGENCY_PREMIUM: "text-amber-400 bg-amber-950/40 border-amber-800/50" }
const AP_COLORS: Record<string, { text: string; bg: string; border: string; bar: string; dot: string }> = { indigo: { text: "text-indigo-400", bg: "bg-indigo-950/30", border: "border-indigo-800/40", bar: "bg-indigo-500", dot: "bg-indigo-400" }, emerald: { text: "text-emerald-400", bg: "bg-emerald-950/30", border: "border-emerald-800/40", bar: "bg-emerald-500", dot: "bg-emerald-400" }, violet: { text: "text-violet-400", bg: "bg-violet-950/30", border: "border-violet-800/40", bar: "bg-violet-500", dot: "bg-violet-400" }, cyan: { text: "text-cyan-400", bg: "bg-cyan-950/30", border: "border-cyan-800/40", bar: "bg-cyan-500", dot: "bg-cyan-400" }, orange: { text: "text-orange-400", bg: "bg-orange-950/30", border: "border-orange-800/40", bar: "bg-orange-500", dot: "bg-orange-400" }, pink: { text: "text-pink-400", bg: "bg-pink-950/30", border: "border-pink-800/40", bar: "bg-pink-500", dot: "bg-pink-400" }, amber: { text: "text-amber-400", bg: "bg-amber-950/30", border: "border-amber-800/40", bar: "bg-amber-500", dot: "bg-amber-400" }, teal: { text: "text-teal-400", bg: "bg-teal-950/30", border: "border-teal-800/40", bar: "bg-teal-500", dot: "bg-teal-400" } }
const BOS_CATEGORY_COLORS: Record<string, { text: string; bg: string; border: string; accent: string }> = { Finance: { text: "text-emerald-400", bg: "bg-emerald-950/20", border: "border-emerald-800/30", accent: "#10b981" }, Sales: { text: "text-blue-400", bg: "bg-blue-950/20", border: "border-blue-800/30", accent: "#3b82f6" }, Marketing: { text: "text-amber-400", bg: "bg-amber-950/20", border: "border-amber-800/30", accent: "#f59e0b" }, "Customer Success": { text: "text-violet-400", bg: "bg-violet-950/20", border: "border-violet-800/30", accent: "#8b5cf6" }, Operations: { text: "text-cyan-400", bg: "bg-cyan-950/20", border: "border-cyan-800/30", accent: "#06b6d4" }, HR: { text: "text-pink-400", bg: "bg-pink-950/20", border: "border-pink-800/30", accent: "#ec4899" }, Tech: { text: "text-orange-400", bg: "bg-orange-950/20", border: "border-orange-800/30", accent: "#f97316" }, Executive: { text: "text-indigo-400", bg: "bg-indigo-950/20", border: "border-indigo-800/30", accent: "#6366f1" } }

function timeAgo(ts: string | null) {
  if (!ts) return "Never"
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
  return `${Math.floor(ms / 86400000)}d ago`
}

function parseCron(expr: string | null) {
  if (!expr) return "Event-driven"
  const m: Record<string, string> = { "0 7 * * 1-5": "Weekdays 7am", "0 8 * * 1-5": "Weekdays 8am", "0 9 * * 1-5": "Weekdays 9am", "0 9 * * 5": "Fridays 9am", "0 9 1 * *": "1st/month 9am", "0 7 1 * *": "1st/month 7am", "0 9 * * 1": "Mondays 9am", "0 7 * * 2": "Tuesdays 7am", "0 6 * * 1-5": "Weekdays 6am", "*/15 * * * *": "Every 15min", "*/30 * * * *": "Every 30min", "0 6 * * 1": "Mondays 6am", "0 8,20 * * *": "8am & 8pm" }
  return m[expr] ?? expr
}

const PRIORITY_BADGE: Record<string, string> = { critical: "bg-red-950/60 border-red-700/60 text-red-300", high: "bg-orange-950/60 border-orange-700/60 text-orange-300", normal: "bg-blue-950/60 border-blue-700/60 text-blue-300", low: "bg-gray-900 border-gray-700 text-gray-500" }
const STATUS_BADGE: Record<string, string> = { queued: "bg-amber-950/60 border-amber-700/60 text-amber-300", running: "bg-emerald-950/60 border-emerald-700/60 text-emerald-300", completed: "bg-gray-900 border-gray-700 text-gray-500", failed: "bg-red-950/60 border-red-700/60 text-red-300", dead: "bg-gray-900 border-gray-800 text-gray-700" }

/* ═══════════════════════ AUTOPILOT AGENT CARD ═══════════════════════ */
function APAgentCard({ agent }: { agent: APAgent }) {
  const c = AP_COLORS[agent.color] ?? AP_COLORS.indigo
  const isActive = agent.status === "active"
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-4 ${c.bg} ${c.border}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${c.dot} ${isActive ? "animate-pulse" : "opacity-40"}`} />
            {isActive && <div className={`absolute inset-0 rounded-full ${c.dot} opacity-30 animate-ping`} style={{ animationDuration: "2s" }} />}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{agent.name}</p>
            <p className="text-xs text-gray-600 mt-0.5">{agent.description}</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${isActive ? `${c.bg} ${c.border} ${c.text}` : "bg-gray-900 border-gray-800 text-gray-600"}`}>{isActive ? "● Live" : "○ Idle"}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[{ label: "Last 24h", value: agent.last24h }, { label: "Last hour", value: agent.lastHour }, { label: "Queue", value: agent.queueSize }].map(s => (
          <div key={s.label} className="bg-black/20 rounded-xl p-2.5 text-center">
            <p className={`text-xl font-extrabold ${c.text}`}>{s.value}</p>
            <p className="text-xs text-gray-700 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1.5"><span className="text-gray-600">Success rate</span><span className={`font-bold ${c.text}`}>{agent.successRate}%</span></div>
        <div className="h-1.5 bg-black/30 rounded-full overflow-hidden"><div className={`h-full rounded-full ${c.bar} transition-all duration-700`} style={{ width: `${agent.successRate}%` }} /></div>
      </div>
    </div>
  )
}

/* ═══════════════════════ BOS AGENT CARD ═══════════════════════ */
function BOSAgentCard({ agent, onToggle, offline, password }: { agent: BOSAgent; onToggle: (slug: string, enable: boolean) => Promise<void>; offline: boolean; password: string }) {
  const c = BOS_CATEGORY_COLORS[agent.category] ?? BOS_CATEGORY_COLORS.Tech
  const [showModal, setShowModal]           = useState(false)
  const [input, setInput]                   = useState("")
  const [loading, setLoading]               = useState(false)
  const [runResult, setRunResult]           = useState<{ result: unknown; elapsed: number } | null>(null)
  const [runError, setRunError]             = useState("")
  const [satisfaction, setSatisfaction]     = useState<"idle" | "satisfied" | "refining">("idle")
  const [refineFeedback, setRefineFeedback] = useState("")
  const [iterationCount, setIterationCount] = useState(0)

  async function handleRun(feedbackContext?: string) {
    setLoading(true); setRunError(""); setRunResult(null); setSatisfaction("idle")

    let contextInput = input.trim()
    if (feedbackContext) {
      contextInput = `${contextInput ? contextInput + "\n\n" : ""}QUALITY IMPROVEMENT REQUIRED (Attempt ${iterationCount + 1}): The previous output did not meet the required standard. User feedback: "${feedbackContext}". Produce a significantly more detailed, actionable, and comprehensive version that directly addresses this feedback.`
    }

    try {
      const res = await fetch("/api/admin/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, agentSlug: agent.slug, input: contextInput || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed")
      setRunResult(json)
      setIterationCount(prev => prev + 1)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Failed to run agent")
    } finally {
      setLoading(false)
    }
  }

  function handleSubmitRefinement() {
    const fb = refineFeedback.trim()
    if (!fb) return
    setRefineFeedback("")
    handleRun(fb)
  }

  function closeModal() {
    if (loading) return
    setShowModal(false)
    setRunResult(null)
    setRunError("")
    setSatisfaction("idle")
    setRefineFeedback("")
    setIterationCount(0)
  }

  const outputText = runResult?.result
    ? typeof runResult.result === "string" ? runResult.result : JSON.stringify(runResult.result, null, 2)
    : ""

  return (
    <div className={`relative rounded-xl border p-4 flex flex-col gap-3 transition-all duration-200 ${c.bg} ${agent.enabled ? c.border : "border-gray-800/40"} ${loading ? "shadow-lg" : ""} ${!agent.enabled ? "opacity-50" : ""}`}
      style={loading ? { boxShadow: `0 0 16px ${c.accent}44` } : {}}>
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: c.accent, opacity: agent.enabled ? 0.7 : 0.2 }} />

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white truncate">{agent.name}</span>
            {loading ? <span className={`text-xs px-1.5 py-0.5 rounded border ${c.border} ${c.text} flex items-center gap-1`}><span className="w-1 h-1 rounded-full animate-pulse" style={{ background: c.accent }} />Running</span> : null}
            {agent.circuitState !== "closed" ? <span className="text-xs px-1.5 py-0.5 rounded border border-red-700/60 bg-red-950/60 text-red-300">{agent.circuitState}</span> : null}
          </div>
          <span className={`text-xs ${c.text} opacity-80`}>{agent.category}</span>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => { if (agent.enabled) setShowModal(true) }}
            disabled={!agent.enabled || loading}
            title="Run agent directly via AI"
            className="p-1.5 rounded-lg border border-gray-700/60 text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs">▶</button>
          <button onClick={() => !offline && onToggle(agent.slug, !agent.enabled)} disabled={offline}
            className={`p-1.5 rounded-lg border text-xs transition-colors disabled:cursor-not-allowed ${agent.enabled ? "border-emerald-700/50 text-emerald-400 hover:border-emerald-600" : "border-gray-700/50 text-gray-600 hover:text-gray-400"}`}
            title={offline ? "Start Business OS to toggle agents" : agent.enabled ? "Disable" : "Enable"}>{agent.enabled ? "●" : "○"}</button>
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{agent.description}</p>

      <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-gray-800/40">
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span>{timeAgo(agent.lastRunAt)}</span>
          {agent.lastRunOk !== null ? <span className={agent.lastRunOk ? "text-emerald-500" : "text-red-500"}>{agent.lastRunOk ? "✓ OK" : "✗ Failed"}</span> : null}
          {agent.errorCount > 0 ? <span className="text-amber-500">⚠ {agent.errorCount} err</span> : null}
        </div>
        <span className="text-xs text-gray-700">{parseCron(agent.schedule)}</span>
      </div>

      {agent.lastResult ? <p className="text-xs text-gray-700 truncate border-t border-gray-800/40 pt-2">{agent.lastResult}</p> : null}

      {showModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

            {/* ── Modal header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/80 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-white text-base">{agent.name}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-700/50 bg-indigo-950/50 text-indigo-300 font-semibold tracking-wide uppercase">Enterprise Grade</span>
                  {iterationCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-gray-700 bg-gray-900 text-gray-500">Attempt {iterationCount}</span>}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{agent.category} · Output must be production-ready and actionable</p>
              </div>
              <button onClick={closeModal} className="ml-4 text-gray-600 hover:text-white text-2xl leading-none transition-colors shrink-0">×</button>
            </div>

            {/* ── Modal body ── */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

              {/* Input area */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.accent }} />
                    Business Context
                    <span className="text-gray-700 font-normal normal-case tracking-normal">(optional)</span>
                  </label>
                  <span className="text-[10px] text-gray-700 tabular-nums">{input.length} chars</span>
                </div>
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={`Provide specific context for ${agent.name.toLowerCase()}… (e.g. company name, industry, current metrics, or specific goals)\n\nLeave blank to use the default enterprise prompt.`}
                    rows={4}
                    disabled={loading}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700/70 rounded-xl text-white text-sm placeholder-gray-700 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/20 resize-none disabled:opacity-40 transition-all leading-relaxed"
                  />
                </div>
                <p className="text-[10px] text-gray-700 mt-1.5">The more context you provide, the more tailored and actionable the output will be.</p>
              </div>

              {/* Quality standard bar */}
              <div className="flex items-center gap-3 bg-gray-900/60 border border-gray-800/60 rounded-xl px-4 py-2.5">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(i => <div key={i} className="w-5 h-1.5 rounded-full" style={{ background: i <= 4 ? c.accent : "#374151", opacity: i <= 4 ? (0.4 + i * 0.15) : 1 }} />)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Enterprise Quality Standard</p>
                  <p className="text-[10px] text-gray-600">If output doesn&apos;t meet your standard, use &quot;Refine&quot; to improve it.</p>
                </div>
              </div>

              {/* Error */}
              {runError && (
                <div className="text-red-400 text-sm bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-3">{runError}</div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="flex items-center gap-3 py-2 px-4 bg-gray-900/60 border border-gray-800/60 rounded-xl">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <div>
                    <p className="text-sm text-white font-medium">Running {agent.name}…</p>
                    <p className="text-xs text-gray-600">Generating enterprise-grade output</p>
                  </div>
                </div>
              )}

              {/* Output */}
              {runResult && !loading && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/80 bg-gray-950/60">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-xs font-semibold text-gray-300">Agent Output</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">{runResult.elapsed}ms</span>
                      <button onClick={() => navigator.clipboard.writeText(outputText)} className="text-xs text-gray-600 hover:text-white border border-gray-800 hover:border-gray-600 rounded-lg px-2.5 py-1 transition-colors">Copy</button>
                    </div>
                  </div>
                  <pre className="text-xs text-gray-300 p-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">{outputText}</pre>
                </div>
              )}

              {/* ── Satisfaction / Refinement UI ── */}
              {runResult && !loading && satisfaction !== "satisfied" && (
                <div className="rounded-xl border border-gray-800 overflow-hidden">
                  {satisfaction === "idle" && (
                    <div className="px-4 py-3 flex items-center justify-between gap-3 bg-gray-900/40">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-400">Quality Check</span>
                        {iterationCount > 1 && <span className="text-[10px] text-gray-700">· Refinement #{iterationCount - 1} complete</span>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSatisfaction("satisfied")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-emerald-700/50 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/50 transition-colors font-semibold"
                        >
                          ✓ Satisfied
                        </button>
                        <button
                          onClick={() => setSatisfaction("refining")}
                          className="text-xs px-3 py-1.5 rounded-lg border border-indigo-700/50 bg-indigo-950/20 text-indigo-400 hover:bg-indigo-950/50 transition-colors font-semibold"
                        >
                          ↺ Refine Output
                        </button>
                      </div>
                    </div>
                  )}
                  {satisfaction === "refining" && (
                    <div className="px-4 py-3 space-y-3 bg-gray-900/40">
                      <label className="text-xs font-semibold text-gray-300 block">What needs improvement?</label>
                      <textarea
                        value={refineFeedback}
                        onChange={e => setRefineFeedback(e.target.value)}
                        placeholder="e.g. Make it more specific to our industry, add more actionable steps, improve the financial projections, use a more professional tone…"
                        rows={2}
                        className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setSatisfaction("idle"); setRefineFeedback("") }} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-500 hover:text-gray-300 transition-colors">
                          Cancel
                        </button>
                        <button
                          onClick={handleSubmitRefinement}
                          disabled={!refineFeedback.trim()}
                          className="flex-1 text-xs py-1.5 rounded-lg font-semibold text-white disabled:opacity-40 transition-all"
                          style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
                        >
                          ↺ Run Improved Version
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {satisfaction === "satisfied" && runResult && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-950/20 border border-emerald-800/30 rounded-xl">
                  <span className="text-emerald-400 text-xs font-semibold">✓ Output approved</span>
                  {iterationCount > 1 && <span className="text-xs text-gray-600">after {iterationCount - 1} refinement{iterationCount > 2 ? "s" : ""}</span>}
                </div>
              )}
            </div>

            {/* ── Modal footer ── */}
            <div className="flex gap-2 px-6 py-4 border-t border-gray-800/80 shrink-0">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-gray-700/70 text-sm text-gray-400 hover:bg-gray-800/60 transition-colors">
                {runResult ? "Close" : "Cancel"}
              </button>
              <button
                onClick={() => handleRun()}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40 transition-all"
                style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                {loading ? "Running…" : runResult ? "▶ Run Again" : "▶ Run Agent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ BOS AGENTS PANEL ═══════════════════════ */
function BOSAgentsPanel({ password }: { password: string }) {
  const [agents, setAgents] = useState<BOSAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [panelError, setPanelError] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [metrics, setMetrics] = useState<{ runsToday: number; errorsToday: number; enabledAgents: number; totalAgents: number; tokenUsage: { total: number } } | null>(null)

  const bos = useCallback(async (action: string, payload?: unknown) => {
    const r = await fetch("/api/admin/business-os", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, action, payload }) })
    if (!r.ok) { const j = await r.json(); throw new Error(j.error) }
    return r.json()
  }, [password])

  const load = useCallback(async () => {
    try {
      const [agentsData, metricsData] = await Promise.allSettled([bos("agents"), bos("metrics")])
      if (agentsData.status === "fulfilled") { setAgents(agentsData.value.agents ?? []); setOffline(false) }
      else { setAgents(STATIC_BOS_AGENTS); setOffline(true) }
      if (metricsData.status === "fulfilled") setMetrics(metricsData.value)
    } catch { setAgents(STATIC_BOS_AGENTS); setOffline(true) }
    finally { setLoading(false) }
  }, [bos])

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t) }, [load])

  async function handleToggle(slug: string, enable: boolean) {
    try {
      await bos(enable ? "enable_agent" : "disable_agent", { slug })
      setAgents(prev => prev.map(a => a.slug === slug ? { ...a, enabled: enable } : a))
    } catch (e) { setPanelError(e instanceof Error ? e.message : "Failed") }
  }

  const categories = ["All", ...Array.from(new Set(agents.map(a => a.category)))]
  const filtered = agents.filter(a => {
    if (categoryFilter !== "All" && a.category !== categoryFilter) return false
    if (search) return a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase())
    return true
  })
  const grouped: Record<string, BOSAgent[]> = {}
  filtered.forEach(a => { if (!grouped[a.category]) grouped[a.category] = []; grouped[a.category].push(a) })

  if (loading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      {offline && (
        <div className="flex items-center gap-3 bg-amber-950/20 border border-amber-800/40 rounded-xl px-4 py-3 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <span className="text-amber-300 font-medium">Business OS is offline — displaying static configuration.</span>
          <code className="text-xs bg-amber-950/60 px-2 py-0.5 rounded text-amber-400 font-mono">cd ~/business-os &amp;&amp; npm run dev</code>
          <button onClick={load} className="ml-auto text-xs border border-amber-700/50 text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded-lg transition-colors">Retry</button>
        </div>
      )}
      {/* Metrics bar */}
      {metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Runs Today",    value: metrics.runsToday,     color: "text-blue-400" },
            { label: "Errors Today",  value: metrics.errorsToday,   color: metrics.errorsToday > 0 ? "text-red-400" : "text-gray-500" },
            { label: "Active Agents", value: `${metrics.enabledAgents}/${metrics.totalAgents}`, color: "text-emerald-400" },
            { label: "Tokens Used",   value: `${((metrics.tokenUsage?.total ?? 0) / 1000).toFixed(0)}k`, color: "text-amber-400" },
            { label: "Filtered",      value: `${filtered.length} agents`, color: "text-gray-400" },
          ].map(m => (
            <div key={m.label} className="bg-gray-900/80 border border-gray-800 rounded-xl p-3">
              <p className={`text-lg font-extrabold ${m.color}`}>{m.value}</p>
              <p className="text-xs text-gray-600">{m.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents…"
          className="flex-1 min-w-48 px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500" />
        <div className="flex gap-1.5 flex-wrap">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${categoryFilter === cat ? "border-indigo-600 bg-indigo-950/60 text-indigo-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>
              {cat}
            </button>
          ))}
        </div>
        <button onClick={load} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-500 hover:text-white transition-colors">↻ Refresh</button>
      </div>

      {panelError && (
        <div className="flex items-center gap-3 bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-3 text-sm">
          <span className="text-red-400 text-xs flex-1">{panelError}</span>
          <button onClick={() => setPanelError("")} className="text-red-500 hover:text-red-400 text-lg leading-none">×</button>
        </div>
      )}

      {/* Agent groups */}
      {Object.entries(grouped).map(([category, catAgents]) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{category}</h3>
            <span className="text-xs text-gray-700">({catAgents.length})</span>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {catAgents.map(agent => (
              <BOSAgentCard key={agent.slug} agent={agent} onToggle={handleToggle} offline={offline} password={password} />
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 ? <div className="text-center py-12 text-gray-600">No agents match filters.</div> : null}
    </div>
  )
}

// Which integrations each workflow needs to actually run
const WORKFLOW_INTEGRATIONS: Record<string, Array<{ id: string; name: string; logo: string; color: string }>> = {
  "new-lead-pipeline":          [{ id: "hubspot",  name: "HubSpot",  logo: "🧡", color: "#ff7a59" }, { id: "resend",   name: "Resend",   logo: "✉️", color: "#111827" }],
  "payment-failure-recovery":   [{ id: "stripe",   name: "Stripe",   logo: "💳", color: "#635bff" }, { id: "twilio",   name: "Twilio",   logo: "📱", color: "#f22f46" }],
  "cancellation-response":      [{ id: "stripe",   name: "Stripe",   logo: "💳", color: "#635bff" }, { id: "resend",   name: "Resend",   logo: "✉️", color: "#111827" }],
  "new-customer-welcome":       [{ id: "resend",   name: "Resend",   logo: "✉️", color: "#111827" }, { id: "slack",    name: "Slack",    logo: "💬", color: "#4a154b" }],
  "employee-onboarding":        [{ id: "slack",    name: "Slack",    logo: "💬", color: "#4a154b" }, { id: "notion",   name: "Notion",   logo: "📝", color: "#191919" }],
  "incident-response":          [{ id: "github",   name: "GitHub",   logo: "🐙", color: "#24292e" }, { id: "slack",    name: "Slack",    logo: "💬", color: "#4a154b" }],
  "weekly-business-review":     [{ id: "stripe",   name: "Stripe",   logo: "💳", color: "#635bff" }, { id: "slack",    name: "Slack",    logo: "💬", color: "#4a154b" }],
  "monthly-reporting":          [{ id: "stripe",   name: "Stripe",   logo: "💳", color: "#635bff" }, { id: "notion",   name: "Notion",   logo: "📝", color: "#191919" }],
  "daily-financial-health":     [{ id: "stripe",   name: "Stripe",   logo: "💳", color: "#635bff" }, { id: "plaid",    name: "Plaid",    logo: "🏦", color: "#0a85ea" }],
  "security-infrastructure-sweep": [{ id: "github", name: "GitHub",  logo: "🐙", color: "#24292e" }, { id: "slack",    name: "Slack",    logo: "💬", color: "#4a154b" }],
}

/* ═══════════════════════ AUTOMATIONS PANEL ═══════════════════════ */
function AutomationsPanel({ password, onConnect }: { password: string; onConnect: () => void }) {
  const [workflows, setWorkflows] = useState<BOSWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [wfError, setWfError] = useState("")
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState("All")

  const bos = useCallback(async (action: string, payload?: unknown) => {
    const r = await fetch("/api/admin/business-os", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, action, payload }) })
    if (!r.ok) { const j = await r.json(); throw new Error(j.error) }
    return r.json()
  }, [password])

  const load = useCallback(async () => {
    try {
      const data = await bos("workflows")
      setWorkflows(data.workflows ?? [])
      setOffline(false)
    } catch { setWorkflows(STATIC_BOS_WORKFLOWS); setOffline(true) }
    finally { setLoading(false) }
  }, [bos])

  useEffect(() => { load() }, [load])

  async function handleToggle(workflowId: string, enable: boolean) {
    if (offline) return
    try {
      await bos(enable ? "enable_workflow" : "disable_workflow", { workflowId })
      setWorkflows(prev => prev.map(w => w.id === workflowId ? { ...w, enabled: enable } : w))
    } catch (e) { setWfError(e instanceof Error ? e.message : "Failed") }
  }

  async function handleRun(workflowId: string) {
    setWfError("")
    setRunningIds(s => new Set([...s, workflowId]))
    try {
      await bos("run_workflow", { workflowId })
      setTimeout(() => setRunningIds(s => { const n = new Set(s); n.delete(workflowId); return n }), 2000)
      await load()
    } catch (e) {
      setWfError(e instanceof Error ? e.message : "Failed to run workflow")
      setRunningIds(s => { const n = new Set(s); n.delete(workflowId); return n })
    }
  }

  const categories = ["All", ...Array.from(new Set(workflows.map(w => w.category)))]
  const filtered = categoryFilter === "All" ? workflows : workflows.filter(w => w.category === categoryFilter)

  const TRIGGER_BADGE: Record<string, string> = { event: "bg-blue-950/60 border-blue-700/60 text-blue-300", schedule: "bg-emerald-950/60 border-emerald-700/60 text-emerald-300", manual: "bg-gray-900 border-gray-700 text-gray-400" }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5">
      {offline && (
        <div className="flex items-center gap-3 bg-amber-950/20 border border-amber-800/40 rounded-xl px-4 py-3 text-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <span className="text-amber-300 font-medium">Business OS is offline — displaying configured workflows.</span>
          <code className="text-xs bg-amber-950/60 px-2 py-0.5 rounded text-amber-400 font-mono">cd ~/business-os &amp;&amp; npm run dev</code>
          <button onClick={load} className="ml-auto text-xs border border-amber-700/50 text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded-lg transition-colors">Retry</button>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-white text-lg">Automation Workflows</h2>
          <p className="text-sm text-gray-500 mt-0.5">Chain agents into automated pipelines. Events and schedules trigger workflows automatically.</p>
        </div>
        <div className="flex gap-1.5">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${categoryFilter === cat ? "border-indigo-600 bg-indigo-950/60 text-indigo-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {wfError && (
        <div className="flex items-center gap-3 bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-3 text-sm">
          <span className="text-red-400 text-xs flex-1">{wfError}</span>
          <button onClick={() => setWfError("")} className="text-red-500 hover:text-red-400 text-lg leading-none">×</button>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {filtered.map(wf => {
          const cat = BOS_CATEGORY_COLORS[wf.category] ?? BOS_CATEGORY_COLORS.Tech
          const triggerLabel = wf.trigger.type === "event" ? wf.trigger.eventType ?? "event" : wf.trigger.type === "schedule" ? parseCron(wf.trigger.cron ?? null) : "manual"
          const isRunning = runningIds.has(wf.id)

          return (
            <div key={wf.id} className={`rounded-xl border p-5 flex flex-col gap-4 transition-all ${cat.bg} ${wf.enabled ? cat.border : "border-gray-800/30"} ${!wf.enabled ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-white text-sm">{wf.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize ${TRIGGER_BADGE[wf.trigger.type]}`}>{wf.trigger.type}</span>
                    <span className={`text-xs ${cat.text}`}>{cat ? wf.category : ""}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{wf.description}</p>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  {/* Connect button — shows which services this workflow needs */}
                  {WORKFLOW_INTEGRATIONS[wf.id]?.length > 0 && (
                    <button
                      onClick={onConnect}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-700/50 bg-indigo-950/30 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:border-indigo-600 transition-colors"
                    >
                      {WORKFLOW_INTEGRATIONS[wf.id].map(s => (
                        <span key={s.id} title={s.name} className="text-sm leading-none">{s.logo}</span>
                      ))}
                      <span>Connect</span>
                    </button>
                  )}
                  <button onClick={() => !offline && wf.enabled && handleRun(wf.id)} disabled={!wf.enabled || isRunning || offline}
                    title={offline ? "Start Business OS to run workflows" : undefined}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    {isRunning ? "Running…" : "Run Now"}
                  </button>
                  <button onClick={() => !offline && handleToggle(wf.id, !wf.enabled)} disabled={offline}
                    title={offline ? "Start Business OS to toggle workflows" : undefined}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:cursor-not-allowed ${wf.enabled ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-400" : "border-gray-700 text-gray-600 hover:text-gray-400"}`}>
                    {wf.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>

              {/* Steps */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(wf.steps ?? []).map((step, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    {i > 0 && !step.parallel ? <span className="text-gray-700 text-xs">→</span> : null}
                    {i > 0 && step.parallel ? <span className="text-gray-700 text-xs">∥</span> : null}
                    <span className={`text-xs px-2 py-0.5 rounded ${cat.bg} border ${cat.border} ${cat.text}`}>{step.agentName}</span>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-800/40 pt-3">
                <div className="flex gap-4">
                  <span>Trigger: <span className="text-gray-400">{triggerLabel}</span></span>
                  <span>Runs: <span className={wf.runCount > 0 ? "text-white" : ""}>{wf.runCount}</span></span>
                  {wf.errorCount > 0 ? <span className="text-amber-500">⚠ {wf.errorCount} errors</span> : null}
                </div>
                <span>{timeAgo(wf.lastRunAt)}</span>
              </div>

              {/* Recent runs */}
              {wf.recentRuns.length > 0 ? (
                <div className="flex gap-1.5">
                  {wf.recentRuns.slice(0, 5).map(run => (
                    <div key={run.id} title={`${run.startedAt} — ${run.stepsCompleted} steps`}
                      className={`w-5 h-5 rounded flex items-center justify-center text-xs ${run.success ? "bg-emerald-950/60 text-emerald-400" : "bg-red-950/60 text-red-400"}`}>
                      {run.success ? "✓" : "✗"}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════ QUEUE PANEL ═══════════════════════ */
function QueuePanel({ password }: { password: string }) {
  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const bos = useCallback(async (action: string, payload?: unknown) => {
    const r = await fetch("/api/admin/business-os", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, action, payload }) })
    if (!r.ok) { const j = await r.json(); throw new Error(j.error) }
    return r.json()
  }, [password])

  const load = useCallback(async () => {
    try {
      const data = await bos("queue")
      setJobs(data.jobs ?? [])
      setStats(data.stats ?? null)
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }, [bos])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  async function handleCancel(jobId: string) {
    await bos("cancel_job", { jobId })
    await load()
  }

  async function handleRetry(jobId: string) {
    await bos("retry_job", { jobId })
    await load()
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="text-center py-12 text-red-400">{error}</div>

  const running = jobs.filter(j => j.status === "running")
  const queued  = jobs.filter(j => j.status === "queued")
  const recent  = jobs.filter(j => ["completed", "failed", "dead"].includes(j.status)).slice(0, 20)

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats ? (
        <div className="grid grid-cols-5 gap-3">
          {([
            { label: "Queued",    value: stats.queued,    color: "text-amber-400" },
            { label: "Running",   value: stats.running,   color: "text-emerald-400" },
            { label: "Completed", value: stats.completed, color: "text-gray-400" },
            { label: "Failed",    value: stats.failed,    color: stats.failed > 0 ? "text-red-400" : "text-gray-600" },
            { label: "Dead",      value: stats.dead,      color: stats.dead > 0 ? "text-gray-500" : "text-gray-700" },
          ]).map(s => (
            <div key={s.label} className="bg-gray-900/80 border border-gray-800 rounded-xl p-3 text-center">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-600 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Running */}
      {running.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Running ({running.length})
          </h3>
          <div className="space-y-2">
            {running.map(job => (
              <div key={job.id} className="bg-emerald-950/10 border border-emerald-800/30 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-semibold text-white">{job.agentName}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_BADGE[job.priority] ?? ""}`}>{job.priority}</span>
                  <span className="text-xs text-gray-600">via {job.triggeredBy}</span>
                </div>
                <span className="text-xs text-gray-600">{timeAgo(job.startedAt ?? null)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Queued */}
      {queued.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Queued ({queued.length})</h3>
          <div className="space-y-2">
            {queued.map((job, i) => (
              <div key={job.id} className="bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-5 text-right">#{i + 1}</span>
                  <span className="text-sm text-gray-300">{job.agentName}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_BADGE[job.priority] ?? ""}`}>{job.priority}</span>
                  <span className="text-xs text-gray-600">via {job.triggeredBy}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-600">{timeAgo(job.createdAt)}</span>
                  <button onClick={() => handleCancel(job.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors">Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {running.length === 0 && queued.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p className="text-2xl mb-3">⚡</p>
          <p className="font-semibold text-gray-500">Queue is empty</p>
          <p className="text-sm mt-1">Agents will appear here when triggered or scheduled.</p>
        </div>
      ) : null}

      {/* Recent history */}
      {recent.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Recent History</h3>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
            <div className="divide-y divide-gray-800/60">
              {recent.map(job => (
                <div key={job.id} className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-gray-800/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs w-14 text-center px-1.5 py-0.5 rounded border ${STATUS_BADGE[job.status] ?? ""}`}>{job.status}</span>
                    <span className="text-sm text-gray-300">{job.agentName}</span>
                    <span className="text-xs text-gray-600">via {job.triggeredBy}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {job.error ? <span className="text-xs text-red-400 truncate max-w-48" title={job.error}>{job.error}</span> : null}
                    <span className="text-xs text-gray-600 shrink-0">{timeAgo(job.finishedAt ?? job.createdAt)}</span>
                    {["failed", "dead"].includes(job.status) ? (
                      <button onClick={() => handleRetry(job.id)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Retry</button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ═══════════════════════ SANDBOX ═══════════════════════ */
function SandboxTab({ password }: { password: string }) {
  const [selectedPreset, setSelectedPreset] = useState<SandboxPreset>(SANDBOX_PRESETS[0])
  const [systemPrompt, setSystemPrompt] = useState(SANDBOX_PRESETS[0].systemPrompt)
  const [userPrompt, setUserPrompt] = useState(SANDBOX_PRESETS[0].userPrompt)
  const [jsonMode, setJsonMode] = useState(SANDBOX_PRESETS[0].jsonMode)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ result: unknown; elapsed: number } | null>(null)
  const [error, setError] = useState("")

  function applyPreset(p: SandboxPreset) { setSelectedPreset(p); setSystemPrompt(p.systemPrompt); setUserPrompt(p.userPrompt); setJsonMode(p.jsonMode); setResult(null); setError("") }

  async function run() {
    setLoading(true); setError(""); setResult(null)
    try {
      const res = await fetch("/api/admin/sandbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, agentId: selectedPreset.id, systemPrompt, userPrompt, jsonMode }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed")
      setResult(json)
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  const outputText = result?.result ? typeof result.result === "string" ? result.result : JSON.stringify(result.result, null, 2) : ""

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h2 className="font-bold text-white text-lg">Agent Sandbox</h2>
        <span className="text-xs bg-indigo-950/60 border border-indigo-800/50 text-indigo-400 px-2 py-0.5 rounded-full">Live Claude</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {SANDBOX_PRESETS.map(p => (
          <button key={p.id} onClick={() => applyPreset(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${selectedPreset.id === p.id ? "bg-indigo-600 border-indigo-600 text-white" : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"}`}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">System Prompt</label><span className="text-xs text-gray-700">{systemPrompt.length}c</span></div>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5} className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div>
            <div className="flex justify-between mb-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">User Prompt</label><span className="text-xs text-gray-700">{userPrompt.length}c</span></div>
            <textarea value={userPrompt} onChange={e => setUserPrompt(e.target.value)} rows={7} className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => setJsonMode(v => !v)} className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${jsonMode ? "bg-indigo-600" : "bg-gray-700"}`}><div className={`w-4 h-4 rounded-full bg-white transition-transform ${jsonMode ? "translate-x-4" : ""}`} /></div>
              <span className="text-sm text-gray-300">JSON mode</span>
            </label>
            <button onClick={run} disabled={loading || !systemPrompt || !userPrompt} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors">
              {loading ? "Running…" : "▶ Run Agent"}
            </button>
          </div>
          {error ? <div className="text-red-400 text-sm bg-red-950/30 border border-red-800/40 rounded-xl px-3 py-2">{error}</div> : null}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col min-h-96">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Output</span>
            <div className="flex items-center gap-3">
              {result ? <span className="text-xs text-gray-600">{result.elapsed}ms</span> : null}
              {outputText ? <button onClick={() => navigator.clipboard.writeText(outputText)} className="text-xs text-gray-500 hover:text-white border border-gray-700 rounded-lg px-2.5 py-1 transition-colors">Copy</button> : null}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {!result && !loading ? <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-10 h-10 rounded-full border-2 border-gray-800 flex items-center justify-center mx-auto mb-3 text-gray-600">▶</div><p className="text-gray-600 text-sm">Select a preset and run</p></div></div> : null}
            {loading ? <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-gray-400 text-sm">Agent running…</p></div></div> : null}
            {result ? <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{outputText}</pre> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════ INTEGRATIONS ═══════════════════════ */

// Full merged list: dashboard services + admin enterprise services
const ALL_SERVICES: Array<{
  id: string; name: string; abbr: string; logo: string; color: string; category: string
  description: string
  isGmail?: boolean
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean; hint?: string }>
  capabilities: string[]
  getKeyUrl?: string
}> = [
  // ── Email / Google ────────────────────────────────────────────────────────
  { id: "gmail", name: "Gmail", abbr: "GM", logo: "📧", color: "#ea4335", category: "Email", description: "Send email campaigns from your real Gmail address. Lands in Primary, not Promotions.", isGmail: true,
    fields: [
      { key: "email", label: "Gmail address", placeholder: "you@gmail.com" },
    ],
    capabilities: ["Email campaigns from your Gmail", "Primary inbox delivery", "Review request emails"],
  },
  { id: "resend", name: "Resend", abbr: "RS", logo: "✉️", color: "#111827", category: "Email", description: "Transactional email delivery at scale with analytics.", isGmail: false,
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "re_xxxxxxxxxxxx", secret: true },
      { key: "fromEmail", label: "From Email", placeholder: "hello@yourdomain.com" },
    ],
    capabilities: ["Transactional email", "Delivery analytics", "Custom from address"],
    getKeyUrl: "https://resend.com",
  },
  // ── Social ────────────────────────────────────────────────────────────────
  { id: "facebook", name: "Facebook / Instagram", abbr: "FB", logo: "📘", color: "#0866ff", category: "Social", description: "Post to your Facebook Page and Instagram Business account.", isGmail: false,
    fields: [
      { key: "pageAccessToken", label: "Page Access Token", placeholder: "EAAxxxxx", secret: true, hint: "Meta Business Suite → Settings → Page Access Tokens" },
      { key: "pageId", label: "Facebook Page ID", placeholder: "123456789" },
      { key: "instagramId", label: "Instagram Account ID (optional)", placeholder: "987654321" },
    ],
    capabilities: ["Auto-post to Facebook", "Auto-post to Instagram", "Schedule content"],
    getKeyUrl: "https://business.facebook.com",
  },
  { id: "linkedin", name: "LinkedIn", abbr: "LI", logo: "💼", color: "#0a66c2", category: "Social", description: "Publish posts to your LinkedIn profile or company page.", isGmail: false,
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "AQV...", secret: true, hint: "linkedin.com/developers → My Apps → OAuth 2.0 tools" },
      { key: "personUrn", label: "Person URN", placeholder: "urn:li:person:abc123" },
      { key: "companyUrn", label: "Company URN (optional)", placeholder: "urn:li:organization:123" },
    ],
    capabilities: ["LinkedIn posts", "Company page management", "Thought leadership"],
    getKeyUrl: "https://www.linkedin.com/developers/apps",
  },
  { id: "buffer", name: "Buffer", abbr: "BF", logo: "📅", color: "#168eea", category: "Social", description: "Schedule posts to all social channels at optimal times.", isGmail: false,
    fields: [{ key: "accessToken", label: "Access Token", placeholder: "Your Buffer access token", secret: true, hint: "buffer.com → Settings → Access Token" }],
    capabilities: ["Cross-platform scheduling", "Optimal timing", "Multi-channel calendar"],
    getKeyUrl: "https://buffer.com",
  },
  { id: "meta-ads", name: "Meta Ads", abbr: "MA", logo: "📢", color: "#0866ff", category: "Advertising", description: "Facebook and Instagram ad campaign management.", isGmail: false,
    fields: [
      { key: "accessToken", label: "Access Token", placeholder: "Enter Meta Access Token", secret: true },
      { key: "adAccountId", label: "Ad Account ID", placeholder: "act_123456789" },
    ],
    capabilities: ["Campaign management", "Audience targeting", "ROAS tracking"],
    getKeyUrl: "https://business.facebook.com",
  },
  { id: "google-ads", name: "Google Ads", abbr: "GA", logo: "🔍", color: "#4285f4", category: "Advertising", description: "Campaign performance monitoring and keyword-level spend optimization.", isGmail: false,
    fields: [
      { key: "customerId", label: "Customer ID", placeholder: "123-456-7890" },
      { key: "developerToken", label: "Developer Token", placeholder: "Enter Developer Token", secret: true },
    ],
    capabilities: ["Campaign performance", "Bid optimization", "Keyword analysis"],
    getKeyUrl: "https://ads.google.com",
  },
  // ── CRM & Sales ───────────────────────────────────────────────────────────
  { id: "hubspot", name: "HubSpot", abbr: "HS", logo: "🧡", color: "#ff7a59", category: "CRM & Sales", description: "Sync contacts, deals, and pipeline for AI sales automation.", isGmail: false,
    fields: [{ key: "apiKey", label: "Private App Token", placeholder: "pat-na1-xxxxxxxx", secret: true, hint: "HubSpot → Settings → Private Apps" }],
    capabilities: ["Contact sync", "Deal management", "Lead scoring"],
    getKeyUrl: "https://app.hubspot.com",
  },
  { id: "salesforce", name: "Salesforce", abbr: "SF", logo: "☁️", color: "#00a1e0", category: "CRM & Sales", description: "Enterprise CRM integration for lead management.", isGmail: false,
    fields: [
      { key: "instanceUrl", label: "Instance URL", placeholder: "https://yourorg.salesforce.com" },
      { key: "accessToken", label: "Access Token", placeholder: "Enter Access Token", secret: true },
    ],
    capabilities: ["Lead management", "Opportunity tracking", "Forecast sync"],
    getKeyUrl: "https://login.salesforce.com",
  },
  { id: "pipedrive", name: "Pipedrive", abbr: "PD", logo: "🔧", color: "#4fbc27", category: "CRM & Sales", description: "Sales pipeline management and deal tracking.", isGmail: false,
    fields: [{ key: "apiKey", label: "API Token", placeholder: "Enter Pipedrive API Token", secret: true }],
    capabilities: ["Deal sync", "Activity logging", "Pipeline analytics"],
    getKeyUrl: "https://app.pipedrive.com",
  },
  // ── Finance ───────────────────────────────────────────────────────────────
  { id: "stripe", name: "Stripe", abbr: "ST", logo: "💳", color: "#635bff", category: "Finance", description: "Revenue dashboards, payment intelligence, and subscription management.", isGmail: false,
    fields: [
      { key: "secretKey", label: "Secret Key", placeholder: "sk_live_...", secret: true, hint: "Stripe Dashboard → Developers → API Keys" },
      { key: "webhookSecret", label: "Webhook Secret (optional)", placeholder: "whsec_...", secret: true },
    ],
    capabilities: ["Revenue sync", "Churn detection", "Invoice automation"],
    getKeyUrl: "https://dashboard.stripe.com",
  },
  { id: "quickbooks", name: "QuickBooks", abbr: "QB", logo: "📊", color: "#2ca01c", category: "Finance", description: "Sync accounting data, invoices, and financial reports.", isGmail: false,
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "Enter Client ID" },
      { key: "clientSecret", label: "Client Secret", placeholder: "Enter Client Secret", secret: true },
      { key: "companyId", label: "Company ID", placeholder: "Enter Company ID" },
    ],
    capabilities: ["P&L sync", "Invoice management", "Expense categorization"],
    getKeyUrl: "https://developer.intuit.com",
  },
  { id: "plaid", name: "Plaid", abbr: "PL", logo: "🏦", color: "#0a85ea", category: "Finance", description: "Bank account connections for real-time cash flow monitoring.", isGmail: false,
    fields: [
      { key: "clientId", label: "Client ID", placeholder: "Enter Plaid Client ID" },
      { key: "secret", label: "Secret", placeholder: "Enter Plaid Secret", secret: true },
    ],
    capabilities: ["Bank account sync", "Cash flow analysis", "Fraud detection"],
    getKeyUrl: "https://dashboard.plaid.com",
  },
  // ── Communications ────────────────────────────────────────────────────────
  { id: "twilio", name: "Twilio SMS", abbr: "TW", logo: "📱", color: "#f22f46", category: "Communications", description: "SMS campaigns and automated customer messaging.", isGmail: false,
    fields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxx" },
      { key: "authToken", label: "Auth Token", placeholder: "Your auth token", secret: true },
      { key: "fromNumber", label: "From Number", placeholder: "+15551234567" },
    ],
    capabilities: ["SMS campaigns", "Review request texts", "Lead follow-up"],
    getKeyUrl: "https://console.twilio.com",
  },
  { id: "slack", name: "Slack", abbr: "SL", logo: "💬", color: "#4a154b", category: "Communications", description: "Agent alerts, daily summaries, and error notifications in Slack.", isGmail: false,
    fields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/...", secret: true, hint: "Slack → Apps → Incoming Webhooks" },
      { key: "channel", label: "Default Channel", placeholder: "#alerts" },
    ],
    capabilities: ["Agent alerts", "Daily summaries", "Error notifications"],
    getKeyUrl: "https://api.slack.com/apps",
  },
  // ── Analytics ─────────────────────────────────────────────────────────────
  { id: "google-analytics", name: "Google Analytics", abbr: "GA", logo: "📈", color: "#e37400", category: "Analytics", description: "Website traffic, conversions, and audience behavior.", isGmail: false,
    fields: [
      { key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXXXXX" },
      { key: "propertyId", label: "Property ID", placeholder: "123456789" },
    ],
    capabilities: ["Traffic analysis", "Conversion tracking", "Audience insights"],
    getKeyUrl: "https://analytics.google.com",
  },
  { id: "klaviyo", name: "Klaviyo", abbr: "KL", logo: "📮", color: "#006bff", category: "Analytics", description: "Email and SMS marketing automation with customer segmentation.", isGmail: false,
    fields: [{ key: "apiKey", label: "Private API Key", placeholder: "pk_...", secret: true }],
    capabilities: ["Email campaigns", "SMS automation", "Customer segmentation"],
    getKeyUrl: "https://www.klaviyo.com",
  },
  // ── Productivity ──────────────────────────────────────────────────────────
  { id: "notion", name: "Notion", abbr: "NO", logo: "📝", color: "#191919", category: "Productivity", description: "Sync agent outputs and reports to your Notion workspace.", isGmail: false,
    fields: [
      { key: "apiKey", label: "Integration Token", placeholder: "secret_...", secret: true },
      { key: "databaseId", label: "Database ID", placeholder: "Enter Database ID" },
    ],
    capabilities: ["Document creation", "Report sync", "Knowledge base"],
    getKeyUrl: "https://www.notion.so/my-integrations",
  },
  { id: "linear", name: "Linear", abbr: "LN", logo: "🔷", color: "#5e6ad2", category: "Productivity", description: "Project and issue tracking for engineering teams.", isGmail: false,
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "lin_api_...", secret: true },
      { key: "teamId", label: "Team ID", placeholder: "Enter Team ID" },
    ],
    capabilities: ["Issue creation", "Sprint tracking", "Roadmap sync"],
    getKeyUrl: "https://linear.app",
  },
  { id: "github", name: "GitHub", abbr: "GH", logo: "🐙", color: "#24292e", category: "Productivity", description: "CI/CD monitoring and automated code review workflows.", isGmail: false,
    fields: [
      { key: "personalAccessToken", label: "Personal Access Token", placeholder: "ghp_...", secret: true },
      { key: "org", label: "Organization", placeholder: "your-org" },
    ],
    capabilities: ["CI/CD monitoring", "PR automation", "Deploy tracking"],
    getKeyUrl: "https://github.com/settings/tokens",
  },
  // ── Review Platforms ──────────────────────────────────────────────────────
  { id: "yelp", name: "Yelp", abbr: "YP", logo: "⭐", color: "#d32323", category: "Reviews", description: "Monitor and respond to Yelp reviews automatically.", isGmail: false,
    fields: [
      { key: "apiKey", label: "Fusion API Key", placeholder: "Your Yelp API key", secret: true },
      { key: "businessId", label: "Business Alias", placeholder: "my-business-city" },
    ],
    capabilities: ["New review alerts", "AI response drafts", "Rating tracking"],
    getKeyUrl: "https://www.yelp.com/developers",
  },
]

function ConnectorsPanel({ password }: { password: string }) {
  const [accounts,    setAccounts]    = useState<Array<{ provider: string; accountEmail: string | null; accountName: string | null }>>([])
  const [saving,      setSaving]      = useState<string | null>(null)
  const [configuring, setConfiguring] = useState<typeof ALL_SERVICES[0] | null>(null)
  const [formValues,  setFormValues]  = useState<Record<string, string>>({})
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [catFilter,    setCatFilter]    = useState("All")
  const [gmailStep,    setGmailStep]    = useState<"email" | "code" | null>(null)
  const [gmailEmail,   setGmailEmail]   = useState("")
  const [gmailCode,    setGmailCode]    = useState("")
  const [gmailDevCode, setGmailDevCode] = useState("")

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000) }

  const headers = { "Content-Type": "application/json", "x-admin-password": password }

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/integrations", { headers: { "x-admin-password": password } })
    const data = await res.json()
    if (data.accounts) setAccounts(data.accounts)
  }, [password])

  useEffect(() => { load() }, [load])

  const getAccount = (id: string) => accounts.find(a => a.provider === id)

  function closeConfiguring() {
    setConfiguring(null); setGmailStep(null)
    setGmailEmail(""); setGmailCode(""); setGmailDevCode("")
  }

  async function disconnect(id: string) {
    setSaving(id)
    await fetch(`/api/admin/integrations?provider=${id}`, { method: "DELETE", headers: { "x-admin-password": password } })
    await load()
    setSaving(null)
    showToast(`Disconnected ${id}`)
  }

  async function sendGmailCode() {
    const email = gmailEmail.trim()
    if (!email || !email.includes("@")) { showToast("Enter a valid email address", false); return }
    setSaving("gmail")
    try {
      const res = await fetch("/api/admin/integrations/gmail/verify", {
        method: "POST", headers, body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send code")
      if (data.devCode) setGmailDevCode(data.devCode)
      setGmailStep("code")
    } catch (e) { showToast(e instanceof Error ? e.message : "Failed", false) }
    finally { setSaving(null) }
  }

  async function confirmGmailCode() {
    if (!gmailCode || gmailCode.length !== 6) { showToast("Enter the 6-digit code", false); return }
    setSaving("gmail")
    try {
      const res = await fetch("/api/admin/integrations/gmail/confirm", {
        method: "POST", headers, body: JSON.stringify({ email: gmailEmail, code: gmailCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Verification failed")
      await load()
      closeConfiguring()
      showToast(`✓ Gmail connected — ${gmailEmail}`)
    } catch (e) { showToast(e instanceof Error ? e.message : "Failed", false) }
    finally { setSaving(null) }
  }

  async function saveCredentials() {
    if (!configuring) return
    const firstVal = Object.values(formValues).find(v => v.trim())
    if (!firstVal) { showToast("Fill in at least one field", false); return }
    setSaving(configuring.id)
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST", headers,
        body: JSON.stringify({ provider: configuring.id, accessToken: firstVal, metadata: formValues }),
      })
      if (!res.ok) throw new Error(await res.text())
      await load()
      setConfiguring(null)
      showToast(`✓ ${configuring.name} connected`)
    } catch (e) { showToast(e instanceof Error ? e.message : "Failed", false) }
    finally { setSaving(null) }
  }

  function openModal(svc: typeof ALL_SERVICES[0]) {
    setFormValues({})
    if (svc.isGmail) {
      setGmailStep("email"); setGmailEmail(""); setGmailCode(""); setGmailDevCode("")
      setConfiguring(svc)
    } else {
      setGmailStep(null); setConfiguring(svc)
    }
  }

  const categories = ["All", ...Array.from(new Set(ALL_SERVICES.map(s => s.category)))]
  const filtered   = catFilter === "All" ? ALL_SERVICES : ALL_SERVICES.filter(s => s.category === catFilter)
  const connectedCount = accounts.length
  const total = ALL_SERVICES.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Connect Your Accounts</h2>
          <p className="text-sm text-gray-500 mt-1">Connect every tool so your agents can act on your behalf — saved to the database, shared across all users.</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-sm font-semibold text-white">{connectedCount}</span>
          <span className="text-sm text-gray-500">of {total} connected</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(3, (connectedCount / total) * 100)}%` }} />
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        {categories.map(cat => (
          <button key={cat} onClick={() => setCatFilter(cat)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${catFilter === cat ? "border-indigo-600 bg-indigo-950/60 text-indigo-300" : "border-gray-700/60 text-gray-500 hover:text-gray-300 hover:border-gray-600"}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Service grid */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(svc => {
          const account     = getAccount(svc.id)
          const isConnected = !!account
          return (
            <div key={svc.id} className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${isConnected ? "bg-emerald-950/10 border-emerald-800/30" : "bg-gray-900/40 border-gray-800/60"}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 text-white"
                  style={{ background: svc.color }}>
                  {svc.abbr}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white text-sm">{svc.name}</p>
                    {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{svc.description}</p>
                  {isConnected && account.accountEmail && (
                    <p className="text-xs text-emerald-400 mt-0.5 truncate">{account.accountEmail}</p>
                  )}
                </div>
                {svc.getKeyUrl && !isConnected && (
                  <a href={svc.getKeyUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-gray-600 hover:text-gray-400 border border-gray-700/50 rounded px-1.5 py-0.5 shrink-0">Get key ↗</a>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {svc.capabilities.map(cap => (
                  <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700/40 text-gray-600">{cap}</span>
                ))}
              </div>

              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => openModal(svc)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
                    isConnected
                      ? "border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
                      : "text-white"
                  }`}
                  style={!isConnected ? { background: svc.color } : {}}
                >
                  {isConnected ? "Reconfigure" : `Connect ${svc.name} →`}
                </button>
                {isConnected && (
                  <button onClick={() => disconnect(svc.id)} disabled={saving === svc.id}
                    className="px-2.5 py-2 rounded-lg border border-gray-800 text-xs text-gray-600 hover:text-red-400 hover:border-red-900/50 transition-colors disabled:opacity-50">
                    {saving === svc.id ? "…" : "✕"}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {configuring && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={closeConfiguring}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: configuring.color }}>{configuring.abbr}</div>
              <div>
                <h3 className="font-bold text-white">{configuring.name}</h3>
                <p className="text-xs text-gray-500">
                  {gmailStep === "email" ? "Enter your Gmail — we'll send a verification code" :
                   gmailStep === "code"  ? "Check your inbox for the 6-digit code" :
                   "Saved to database — active for all agents"}
                </p>
              </div>
              <button onClick={closeConfiguring} className="ml-auto text-gray-600 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {gmailStep === "email" ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Gmail Address</label>
                  <input
                    type="email"
                    value={gmailEmail}
                    onChange={e => setGmailEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendGmailCode()}
                    placeholder="you@gmail.com"
                    autoFocus
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-red-500 transition-colors"
                  />
                  <p className="text-[10px] text-gray-600 mt-1.5">We&apos;ll send a 6-digit code to this address to verify ownership.</p>
                </div>
              ) : gmailStep === "code" ? (
                <>
                  <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-3">
                    <p className="text-sm text-gray-300">Code sent to <span className="font-semibold text-white">{gmailEmail}</span></p>
                    {gmailDevCode && (
                      <p className="text-xs text-amber-400 mt-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-2 py-1.5">
                        ⚠ Resend not configured — dev code: <span className="font-mono font-bold">{gmailDevCode}</span>
                      </p>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={gmailCode}
                    onChange={e => setGmailCode(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => e.key === "Enter" && confirmGmailCode()}
                    placeholder="000000"
                    autoFocus
                    className="w-full px-3 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-center text-2xl font-mono tracking-[12px] focus:outline-none focus:border-red-500 transition-colors"
                  />
                  <button onClick={sendGmailCode} disabled={saving === "gmail"}
                    className="w-full text-xs text-gray-500 hover:text-gray-300 transition py-1">
                    Didn&apos;t get it? Resend code
                  </button>
                </>
              ) : (
                configuring.fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{field.label}</label>
                    <input
                      type={field.secret ? "password" : "text"}
                      value={formValues[field.key] ?? ""}
                      onChange={e => setFormValues(v => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      autoComplete="off"
                      className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    {field.hint && <p className="text-[10px] text-gray-600 mt-1">{field.hint}</p>}
                  </div>
                ))
              )}
            </div>

            {/* Modal footer */}
            <div className="flex gap-2 px-6 py-4 border-t border-gray-800">
              {gmailStep === "code" ? (
                <button onClick={() => { setGmailStep("email"); setGmailCode(""); setGmailDevCode("") }}
                  className="px-4 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors">← Back</button>
              ) : (
                <button onClick={closeConfiguring}
                  className="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
              )}
              <button
                onClick={gmailStep === "email" ? sendGmailCode : gmailStep === "code" ? confirmGmailCode : saveCredentials}
                disabled={saving === (configuring.id) || saving === "gmail"}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-colors"
                style={{ background: gmailStep ? "linear-gradient(135deg,#dc2626,#b91c1c)" : "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                {saving === configuring.id || saving === "gmail" ? "…" :
                 gmailStep === "email" ? "Send Code →" :
                 gmailStep === "code"  ? "Verify & Connect →" :
                 `Connect ${configuring.name} →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl z-50 ${
          toast.ok ? "bg-emerald-900 border border-emerald-700 text-emerald-100" : "bg-red-900 border border-red-700 text-red-100"
        }`}>{toast.msg}</div>
      )}
    </div>
  )
}

/* ═══════════════════════ SITES PANEL ═══════════════════════ */
interface AdminSite {
  id: string
  slug: string
  title: string
  html: string
  published: boolean
  createdAt: string
  business: { name: string; type: string; user: { email: string } }
}

function SitesPanel({ password }: { password: string }) {
  const [sites, setSites]       = useState<AdminSite[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState("")
  const [preview, setPreview]   = useState<AdminSite | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const headers = { "x-admin-password": password }

  // Conversational builder state
  const [showBuilder, setShowBuilder]   = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [genError, setGenError]         = useState("")
  const [progress, setProgress]         = useState(0)
  const [progressMsg, setProgressMsg]   = useState("")
  const [prompt, setPrompt]             = useState("")
  const [imageRefUrl, setImageRefUrl]   = useState("")
  const [questions, setQuestions]       = useState<string[]>([])
  const [chatHistory, setChatHistory]   = useState<Array<{ role: "user" | "ai"; text: string }>>([])
  const [publishing, setPublishing]     = useState(false)
  const promptRef                        = useRef<HTMLTextAreaElement>(null)

  // Detect if the user is issuing an edit command on an existing preview
  const EDIT_TRIGGERS = /^(change|make|update|fix|remove|add|replace|edit|modify|darker|lighter|bigger|smaller|shift|swap|convert|turn|color|font|size|hide|show|move|delete|rewrite|redo|adjust)/i

  async function editSection(instruction: string) {
    if (!preview) return
    setGenerating(true); setGenError(""); setProgressMsg("Applying edit…")
    setChatHistory(prev => [...prev, { role: "user", text: instruction }])
    try {
      const res = await fetch("/api/admin/edit-site", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          html: preview.html,
          instruction,
          history: chatHistory.map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`).join("\n").slice(0, 2000),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Edit failed")
      setPreview(prev => prev ? { ...prev, html: data.html } : null)
      setChatHistory(prev => [...prev, { role: "ai", text: `✓ Applied: ${data.sectionEdited !== "global-css" ? `patched the ${data.sectionEdited} section` : "updated global CSS"}. Preview refreshed.` }])
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Edit failed")
      setChatHistory(prev => [...prev, { role: "ai", text: "Edit failed — please try again with more detail." }])
    } finally {
      setGenerating(false); setProgressMsg("")
    }
  }

  async function publishSite() {
    if (!preview) return
    setPublishing(true)
    setChatHistory(prev => [...prev, { role: "ai", text: "Publishing to Vercel…" }])
    try {
      const res = await fetch("/api/admin/publish-site", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ html: preview.html, slug: preview.slug, title: preview.title }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Publish failed")
      setChatHistory(prev => [...prev, { role: "ai", text: `✓ Published! Live at: ${data.url}` }])
    } catch (e) {
      setChatHistory(prev => [...prev, { role: "ai", text: `Publish failed: ${e instanceof Error ? e.message : "Unknown error"}` }])
    } finally {
      setPublishing(false)
    }
  }

  async function generate(userPrompt: string) {
    if (!userPrompt.trim()) return

    // Route edit commands to section editor when a preview exists
    if (preview && EDIT_TRIGGERS.test(userPrompt.trim())) {
      return editSection(userPrompt.trim())
    }

    setGenerating(true); setGenError(""); setProgress(0); setProgressMsg(""); setQuestions([])
    setChatHistory(prev => [...prev, { role: "user", text: userPrompt }])

    const historyText = chatHistory
      .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text}`)
      .join("\n")
      .slice(0, 3000)

    try {
      const res = await fetch("/api/admin/generate-site", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          history: historyText,
          imageUrl: imageRefUrl.trim() || undefined,
        }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "Generation failed" }))
        throw new Error(data.error ?? "Generation failed")
      }

      // Parse SSE stream
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split("\n\n")
        buffer = parts.pop() ?? ""

        for (const part of parts) {
          let eventType = "message"
          let dataStr   = ""
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim()
            else if (line.startsWith("data: ")) dataStr = line.slice(6)
          }
          if (!dataStr) continue

          let data: Record<string, unknown>
          try { data = JSON.parse(dataStr) } catch { continue }

          switch (eventType) {
            case "progress":
              setProgress(data.pct as number)
              setProgressMsg(data.msg as string)
              break

            case "design_system": {
              const colors = (data.colors as string[]).slice(0, 4).join(", ")
              const fonts  = (data.fonts  as string[]).slice(0, 2).join(", ")
              setChatHistory(prev => [...prev, {
                role: "ai",
                text: `🎨 Design system extracted — Colors: ${colors || "detected"} · Fonts: ${fonts || "detected"} · CSS: ${data.framework}`,
              }])
              break
            }

            case "clarify":
              setQuestions(data.questions as string[])
              setChatHistory(prev => [...prev, { role: "ai", text: (data.questions as string[]).join("\n") }])
              setPrompt("")
              break

            case "complete": {
              const score  = data.qualityScore ? ` · Quality: ${(data.qualityScore as number).toFixed(1)}/10` : ""
              const iters  = (data.iterations as number) > 1 ? ` · ${data.iterations} passes` : ""
              const r      = data.research as { urlScraped: boolean; tavilyUsed: boolean; hasDesignSystem: boolean } | undefined
              const used   = [r?.urlScraped && "scraped site code", r?.tavilyUsed && "web research", r?.hasDesignSystem && "design system cloned"].filter(Boolean).join(" + ")

              setChatHistory(prev => [...prev, {
                role: "ai",
                text: `✓ "${data.title}" built${score}${iters}${used ? ` · ${used}` : ""}\n\nPreview loaded. Type an edit command (e.g. "make the hero darker") to refine, or hit Publish.`,
              }])
              setPreview({
                id:        "preview",
                slug:      data.slug as string,
                title:     data.title as string,
                html:      data.html as string,
                published: false,
                createdAt: new Date().toISOString(),
                business:  {
                  name: (data.parsed as Record<string, string>)?.name ?? "Site",
                  type: (data.parsed as Record<string, string>)?.type ?? "Business",
                  user: { email: "admin" },
                },
              })
              setProgress(100)
              setPrompt("")
              setImageRefUrl("")
              load()
              break
            }

            case "error":
              setGenError(data.message as string)
              setChatHistory(prev => [...prev, { role: "ai", text: "Something went wrong. Please try again." }])
              break
          }
        }
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Failed")
      setChatHistory(prev => [...prev, { role: "ai", text: "Something went wrong. Please try again." }])
    } finally {
      setGenerating(false)
      setTimeout(() => { setProgress(0); setProgressMsg("") }, 1400)
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sites", { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSites(data.sites)
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load sites") }
    finally { setLoading(false) }
  }, [password])

  useEffect(() => { load() }, [load])

  async function togglePublish(site: AdminSite) {
    setToggling(site.id)
    try {
      const res = await fetch("/api/admin/sites", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.id, published: !site.published }),
      })
      if (!res.ok) throw new Error("Failed")
      setSites(prev => prev.map(s => s.id === site.id ? { ...s, published: !site.published } : s))
      if (preview?.id === site.id) setPreview(prev => prev ? { ...prev, published: !site.published } : null)
    } catch { setError("Failed to update site") }
    finally { setToggling(null) }
  }

  async function deleteSite(siteId: string) {
    if (!confirm("Delete this site? This cannot be undone.")) return
    setDeleting(siteId)
    try {
      await fetch(`/api/admin/sites?id=${siteId}`, { method: "DELETE", headers })
      setSites(prev => prev.filter(s => s.id !== siteId))
      if (preview?.id === siteId) setPreview(null)
    } catch { setError("Failed to delete site") }
    finally { setDeleting(null) }
  }

  const publishedCount = sites.filter(s => s.published).length

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🌐</span>
            <h2 className="text-lg font-bold text-white">Website Builder</h2>
            <span className="text-xs bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 px-2 py-0.5 rounded-full font-semibold">AI-Powered</span>
          </div>
          <p className="text-sm text-gray-500">All AI-generated websites across every account. WebGL 3D effects, mobile-first, SEO-ready — generated in under 60 seconds.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold text-white">{publishedCount}</span>
            <span className="text-sm text-gray-500">of {sites.length} live</span>
          </div>
          <button
            onClick={() => { setShowBuilder(v => !v); setGenError("") }}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110"
            style={{ background: showBuilder ? "#374151" : "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
          >
            {showBuilder ? "✕ Cancel" : "+ Build New Site"}
          </button>
          <button onClick={load} className="px-3 py-2 rounded-lg border border-gray-700 text-xs text-gray-500 hover:text-white transition-colors">↻</button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-3 text-sm">
          <span className="text-red-400 text-xs flex-1">{error}</span>
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-400 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Conversational website builder ── */}
      {showBuilder && (
        <div className="bg-gray-950 border border-indigo-800/30 rounded-2xl overflow-hidden flex flex-col" style={{ minHeight: "480px" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800/80 bg-gray-900/60">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-sm font-semibold text-white">Website Builder</span>
            <span className="text-xs text-gray-600">Powered by Claude · WebGL 3D · Mobile-first · SEO-ready</span>
            <button onClick={() => { setShowBuilder(false); setGenError(""); setChatHistory([]); setPrompt("") }} className="ml-auto text-gray-600 hover:text-white text-lg leading-none transition-colors">×</button>
          </div>

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ minHeight: "280px" }}>
            {/* Welcome message */}
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center shrink-0">
                <span className="text-xs text-indigo-400">AP</span>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-bl-md px-4 py-3 max-w-lg">
                <p className="text-sm text-gray-200 leading-relaxed">What do you want to build today?</p>
                <p className="text-xs text-gray-500 mt-1.5">Tell me about the business — name, what they do, location, style. The more detail, the better the site. I&apos;ll ask if I need anything else.</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[
                    "A luxury roofing company in Miami called Elite Roofing",
                    "Volleyball Collective — sports training academy in Houston",
                    "A modern law firm specializing in personal injury",
                  ].map(ex => (
                    <button key={ex} onClick={() => { setPrompt(ex); setTimeout(() => promptRef.current?.focus(), 50) }}
                      className="text-[10px] px-2.5 py-1 rounded-lg border border-gray-700/60 text-gray-500 hover:text-white hover:border-indigo-700/50 transition-colors">
                      {ex.length > 40 ? ex.slice(0, 40) + "…" : ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat history */}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "ai" && (
                  <div className="w-7 h-7 rounded-lg bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs text-indigo-400">AP</span>
                  </div>
                )}
                <div className={`max-w-lg px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "text-white rounded-br-md"
                    : "bg-gray-900 border border-gray-800 text-gray-200 rounded-bl-md"
                }`} style={msg.role === "user" ? { background: "linear-gradient(135deg,#4f46e5,#6d28d9)" } : {}}>
                  {msg.text}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-gray-400">A</div>
                )}
              </div>
            ))}

            {/* Generating indicator */}
            {generating && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center shrink-0">
                  <span className="text-xs text-indigo-400">AP</span>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-1">
                      {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                    </div>
                    <span className="text-xs text-gray-400">{progressMsg || "Building your website…"}</span>
                  </div>
                  {progress > 0 && (
                    <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progress}%`, background: "linear-gradient(90deg,#4f46e5,#7c3aed)" }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {genError && (
              <div className="flex justify-center">
                <div className="bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-2.5 text-red-400 text-sm">
                  {genError}
                  <button onClick={() => setGenError("")} className="ml-3 text-red-700 hover:text-red-400">×</button>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 px-4 py-3 bg-gray-900/40">
            <div className="flex gap-2 items-end">
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={e => { setPrompt(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px` }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(prompt) } }}
                placeholder="Describe the website you want to build… e.g. 'A roofing company in Phoenix called Peak Roofing, blue color, services: Roof Repair, Installation, Inspection'"
                rows={2}
                disabled={generating}
                className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700/70 rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-40 transition-all leading-relaxed"
                style={{ maxHeight: "120px" }}
                autoFocus
              />
              <button
                onClick={() => generate(prompt)}
                disabled={generating || !prompt.trim()}
                className="px-4 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40 transition-all hover:brightness-110 shrink-0"
                style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
              >
                {generating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" /> : "→"}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 px-1">
              <input
                type="url"
                value={imageRefUrl}
                onChange={e => setImageRefUrl(e.target.value)}
                placeholder="Screenshot or site URL to copy style from (optional)"
                disabled={generating}
                className="flex-1 px-2.5 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-[11px] text-gray-400 placeholder-gray-700 focus:outline-none focus:border-indigo-600 disabled:opacity-40 transition-all"
              />
              {imageRefUrl && <span className="text-[10px] text-indigo-400 shrink-0">Vision ✓</span>}
            </div>
            <p className="text-[10px] text-gray-700 mt-1 px-1">Enter to send · Edit commands patch just the target section · ~90–120 seconds to generate</p>
          </div>
        </div>
      )}

      {sites.length === 0 && !showBuilder ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl border border-gray-800 flex items-center justify-center mx-auto mb-4 bg-gray-900">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-700">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No sites built yet</p>
          <p className="text-gray-700 text-sm mt-1">Click &quot;+ Build New Site&quot; and describe what you want — AI handles the rest.</p>
        </div>
      ) : (
        <div className={`grid gap-5 ${preview ? "lg:grid-cols-[1fr_500px]" : ""}`}>
          {/* Site list */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">All Sites ({sites.length})</span>
              <div className="flex gap-3 text-xs text-gray-600">
                <span className="text-emerald-500">{publishedCount} live</span>
                <span>{sites.length - publishedCount} draft</span>
              </div>
            </div>
            <div className="divide-y divide-gray-800/60">
              {sites.map(site => (
                <div key={site.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/20 transition-colors ${preview?.id === site.id ? "bg-indigo-950/10 border-l-2 border-indigo-600" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white truncate">{site.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${site.published ? "bg-emerald-950/60 border border-emerald-800/50 text-emerald-400" : "bg-gray-800 border border-gray-700 text-gray-600"}`}>
                        {site.published ? "Live" : "Draft"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{site.business.name} · {site.business.type} · {site.business.user.email}</p>
                    <p className="text-[10px] text-gray-700 mt-0.5">{new Date(site.createdAt).toLocaleDateString()} · /{site.slug}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setPreview(preview?.id === site.id ? null : site)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${preview?.id === site.id ? "border-indigo-600 bg-indigo-950/40 text-indigo-400" : "border-gray-700 text-gray-500 hover:text-white hover:border-gray-500"}`}
                    >
                      {preview?.id === site.id ? "Close ×" : "Preview"}
                    </button>
                    <button
                      onClick={() => togglePublish(site)}
                      disabled={toggling === site.id}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-50 ${site.published ? "border-red-800/50 bg-red-950/20 text-red-400 hover:bg-red-950/40" : "border-emerald-800/50 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40"}`}
                    >
                      {toggling === site.id ? "…" : site.published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      onClick={() => deleteSite(site.id)}
                      disabled={deleting === site.id}
                      className="text-xs px-2 py-1.5 rounded-lg border border-gray-800 text-gray-700 hover:border-red-800/50 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      {deleting === site.id ? "…" : "✕"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview pane */}
          {preview && (
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: "500px" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/60 shrink-0">
                <div>
                  <p className="text-xs font-semibold text-white truncate max-w-48">{preview.title}</p>
                  <p className="text-[10px] text-gray-600 font-mono">{preview.slug}.autopilot.ai</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(preview.html); w.document.close() } }}
                    className="text-[10px] px-2.5 py-1 border border-gray-700 hover:border-indigo-600 text-gray-500 hover:text-indigo-400 rounded-lg transition-colors"
                  >Full screen ↗</button>
                  <button
                    onClick={() => { const blob = new Blob([preview.html], { type: "text/html" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${preview.slug}.html`; a.click() }}
                    className="text-[10px] px-2.5 py-1 border border-gray-700 hover:border-emerald-700 text-gray-500 hover:text-emerald-400 rounded-lg transition-colors"
                  >Download</button>
                  <button
                    onClick={publishSite}
                    disabled={publishing}
                    className="text-[10px] px-2.5 py-1 border border-emerald-800/60 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-950/60 rounded-lg transition-colors disabled:opacity-50 font-semibold"
                  >{publishing ? "Publishing…" : "Publish →"}</button>
                </div>
              </div>
              <iframe srcDoc={preview.html} className="flex-1 w-full border-0" title="Site Preview" sandbox="allow-scripts" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════ MAIN PAGE ═══════════════════════ */
export default function AdminPage() {
  const [password, setPassword]     = useState("")
  const [data, setData]             = useState<AdminData | null>(null)
  const [agentData, setAgentData]   = useState<AgentData | null>(null)
  const [error, setError]           = useState("")
  const [loading, setLoading]       = useState(false)
  const [tab, setTab]               = useState<"overview" | "ap-agents" | "bos-agents" | "automations" | "queue" | "integrations" | "sandbox" | "users" | "businesses" | "sites">("overview")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const savedPw = typeof window !== "undefined" ? sessionStorage.getItem("ap_admin_pw") ?? "" : ""

  const loadAgents = useCallback(async (pw: string) => {
    const res = await fetch("/api/admin/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) })
    if (res.ok) { setAgentData(await res.json()); setLastUpdated(new Date()) }
  }, [])

  async function login() {
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })
      if (res.status === 401) { setError("Wrong password"); return }
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? `Server error (${res.status})`); return }
      setData(await res.json())
      sessionStorage.setItem("ap_admin_pw", password)
      await loadAgents(password)
    } catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!data) return
    const pw = sessionStorage.getItem("ap_admin_pw") ?? ""
    const id = setInterval(() => loadAgents(pw), 15000)
    return () => clearInterval(id)
  }, [data, loadAgents])

  /* ── Login screen ── */
  if (!data) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
            <span className="text-white font-bold">AP</span>
          </div>
          <span className="font-bold text-xl text-white">AutoPilot Admin</span>
        </div>
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-8 backdrop-blur">
          <h1 className="text-lg font-bold text-white mb-1">Admin Access</h1>
          <p className="text-sm text-gray-500 mb-6">Full control over AutoPilot agents, Business OS, automations, and the job queue.</p>
          <input type="password" placeholder="Admin password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && login()}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500 mb-3" />
          {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}
          <button onClick={login} disabled={loading} className="w-full py-3 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
            {loading ? "Verifying…" : "Enter"}
          </button>
        </div>
        <Link href="/" className="block text-center text-xs text-gray-700 hover:text-gray-500 mt-4 transition-colors">← Back to site</Link>
      </div>
    </div>
  )

  const { stats, planDistribution, recentUsers, recentBusinesses } = data
  const totalMRR = planDistribution.reduce((sum, p) => {
    const prices: Record<string, number> = { STARTER: 49, GROWTH: 99, PRO: 199, AGENCY_STARTER: 399, AGENCY_GROWTH: 799, AGENCY_PREMIUM: 1599 }
    return sum + (prices[p.plan] ?? 0) * p._count
  }, 0)
  const activeAgents = agentData?.agents.filter(a => a.status === "active").length ?? 0
  const pw = savedPw || password

  const TABS = [
    { id: "overview",     label: "Overview" },
    { id: "ap-agents",    label: `Agents${agentData ? ` · ${activeAgents} active` : ""}` },
    { id: "bos-agents",   label: "Business OS" },
    { id: "automations",  label: "Automations" },
    { id: "sites",        label: "🌐 Website Builder" },
    { id: "queue",        label: "Job Queue" },
    { id: "integrations", label: "Integrations" },
    { id: "sandbox",      label: "AI Sandbox" },
    { id: "users",        label: "Users" },
    { id: "businesses",   label: "Accounts" },
  ] as const

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-50 border-b border-gray-900 bg-gray-950/95 backdrop-blur px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              <span className="text-white font-bold text-xs">AP</span>
            </div>
            <span className="font-bold text-white hidden sm:block">Admin</span>
            <span className="text-xs bg-red-950/60 border border-red-800/50 text-red-400 px-2 py-0.5 rounded-full hidden sm:block">Internal</span>
          </div>

          {/* Tabs */}
          <nav className="flex gap-0.5 overflow-x-auto flex-1 justify-center">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${tab === t.id ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
                style={tab === t.id ? { background: "linear-gradient(135deg,#4f46e5,#7c3aed)" } : {}}>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {lastUpdated ? <span className="text-xs text-gray-700 hidden lg:block">{lastUpdated.toLocaleTimeString()}</span> : null}
            <Link href="/dashboard" className="text-xs text-gray-500 hover:text-white transition-colors">App →</Link>
            <button onClick={() => { setData(null); setAgentData(null); sessionStorage.removeItem("ap_admin_pw") }} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {/* KPI bar */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Users",       value: stats.totalUsers,     sub: "registered",       color: "text-indigo-400" },
            { label: "Businesses",  value: stats.totalBusinesses, sub: "active",           color: "text-violet-400" },
            { label: "MRR",         value: `$${totalMRR.toLocaleString()}`, sub: "est.", color: "text-emerald-400" },
            { label: "Content",     value: stats.totalContent,    sub: `${stats.pendingContent} pending`, color: "text-cyan-400" },
            { label: "Reviews",     value: stats.totalReviews,    sub: `${stats.avgRating}★ avg`, color: "text-amber-400" },
            { label: "Live Agents",  value: activeAgents,          sub: "currently active", color: "text-pink-400" },
          ].map(k => (
            <div key={k.label} className="bg-gray-900/80 border border-gray-800 rounded-xl p-3">
              <p className={`text-lg font-extrabold ${k.color}`}>{k.value}</p>
              <p className="text-xs font-semibold text-gray-400">{k.label}</p>
              <p className="text-xs text-gray-700">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Tab content */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          {tab === "bos-agents" && <BOSAgentsPanel password={pw} />}
          {tab === "automations" && <AutomationsPanel password={pw} onConnect={() => setTab("integrations")} />}
          {tab === "queue" && <QueuePanel password={pw} />}
          {tab === "integrations" && <ConnectorsPanel password={sessionStorage.getItem("ap_admin_pw") ?? password} />}
          {tab === "sandbox" && <SandboxTab password={pw} />}

          {tab === "ap-agents" && (
            <div>
              {!agentData ? <div className="text-center py-16 text-gray-600">Loading…</div> : (
                <>
                  <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                    {agentData.agents.map(a => <APAgentCard key={a.id} agent={a} />)}
                  </div>
                  <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                      <div className="flex items-center gap-3">
                        <h2 className="font-bold text-white">Live Activity Feed</h2>
                        <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Real-time</span>
                      </div>
                      <button onClick={() => loadAgents(pw)} className="text-xs text-gray-500 hover:text-white border border-gray-800 px-3 py-1.5 rounded-lg transition-colors">Refresh</button>
                    </div>
                    {agentData.activityFeed.length === 0 ? (
                      <div className="text-center py-12 text-gray-600 text-sm">No activity in the last 24 hours.</div>
                    ) : (
                      <div className="divide-y divide-gray-900">
                        {agentData.activityFeed.map((item, i) => {
                          const c = AP_COLORS[item.color] ?? AP_COLORS.indigo
                          return (
                            <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-900/40 transition-colors">
                              <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-300 truncate">{item.msg}</p>
                                <p className={`text-xs font-medium ${c.text} mt-0.5`}>{item.agentName}</p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${item.status === "APPROVED" || item.status === "CONTACTED" ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400" : item.status === "PENDING" ? "bg-amber-950/40 border-amber-800/40 text-amber-400" : "bg-gray-900 border-gray-800 text-gray-500"}`}>{item.status}</span>
                                <span className="text-xs text-gray-700">{timeAgo(item.ts)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-3 gap-5">
                <div className="md:col-span-2 bg-gray-900/60 border border-gray-800 rounded-xl p-5">
                  <h2 className="font-bold text-white mb-4">Plan Distribution</h2>
                  <div className="space-y-3">
                    {planDistribution.sort((a, b) => b._count - a._count).map(p => {
                      const pct = stats.totalUsers > 0 ? Math.round((p._count / stats.totalUsers) * 100) : 0
                      const prices: Record<string, number> = { STARTER: 49, GROWTH: 99, PRO: 199, AGENCY_STARTER: 399, AGENCY_GROWTH: 799, AGENCY_PREMIUM: 1599 }
                      const mrr = (prices[p.plan] ?? 0) * p._count
                      return (
                        <div key={p.plan} className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border w-36 text-center shrink-0 ${PLAN_COLORS[p.plan] ?? "text-gray-400 bg-gray-900 border-gray-700"}`}>{p.plan.replace("_", " ")}</span>
                          <div className="flex-1 bg-gray-800/60 rounded-full h-2"><div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#4f46e5,#7c3aed)" }} /></div>
                          <span className="text-sm text-white font-semibold w-8 text-right">{p._count}</span>
                          {mrr > 0 ? <span className="text-xs text-emerald-400 w-16 text-right">${mrr}/mo</span> : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
                  <h2 className="font-bold text-white mb-4">Platform Activity</h2>
                  <div className="space-y-4">
                    {[{ label: "Total Leads", value: stats.totalLeads }, { label: "Pending Content", value: stats.pendingContent }, { label: "Approved Content", value: stats.approvedContent }, { label: "Avg Review Rating", value: `${stats.avgRating} ★` }].map(item => (
                      <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-800/60 last:border-0">
                        <span className="text-sm text-gray-400">{item.label}</span>
                        <span className="text-sm font-bold text-white">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
                  <h2 className="font-bold text-white mb-4">Recent Sign-ups</h2>
                  <div className="space-y-3">
                    {recentUsers.slice(0, 8).map(u => (
                      <div key={u.id} className="flex items-center justify-between">
                        <div><p className="text-sm text-white">{u.email}</p><p className="text-xs text-gray-600">{new Date(u.createdAt).toLocaleDateString()}</p></div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${PLAN_COLORS[u.plan] ?? "text-gray-400 border-gray-700"}`}>{u.plan}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
                  <h2 className="font-bold text-white mb-4">Most Active Businesses</h2>
                  <div className="space-y-3">
                    {recentBusinesses.slice(0, 8).map(b => (
                      <div key={b.id} className="flex items-center justify-between">
                        <div><p className="text-sm text-white">{b.name}</p><p className="text-xs text-gray-600">{b.type} · {b.user.email}</p></div>
                        <div className="flex gap-3 text-xs">
                          <span className="text-indigo-400">{b._count.content}</span>
                          <span className="text-emerald-400">{b._count.reviews}</span>
                          <span className="text-violet-400">{b._count.leads}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "users" && (
            <div>
              <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-white">Recent Sign-ups ({recentUsers.length})</h2></div>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-800">{["Email","Name","Plan","Joined"].map(h => <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
                  <tbody>{recentUsers.map(u => (<tr key={u.id} className="border-b border-gray-900 hover:bg-gray-800/30 transition-colors"><td className="px-6 py-3 text-gray-300">{u.email}</td><td className="px-6 py-3 text-gray-400">{u.name ?? "—"}</td><td className="px-6 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded border ${PLAN_COLORS[u.plan] ?? "text-gray-400 border-gray-700"}`}>{u.plan}</span></td><td className="px-6 py-3 text-gray-600 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "businesses" && (
            <div>
              <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-white">Active Businesses ({recentBusinesses.length})</h2></div>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-800">{["Business","Type","Owner","Content","Reviews","Leads","Created"].map(h => <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}</tr></thead>
                  <tbody>{recentBusinesses.map(b => (<tr key={b.id} className="border-b border-gray-900 hover:bg-gray-800/30 transition-colors"><td className="px-5 py-3 font-semibold text-white">{b.name}</td><td className="px-5 py-3 text-gray-400">{b.type}</td><td className="px-5 py-3 text-gray-500 text-xs">{b.user.email}</td><td className="px-5 py-3 text-indigo-400 font-bold">{b._count.content}</td><td className="px-5 py-3 text-emerald-400 font-bold">{b._count.reviews}</td><td className="px-5 py-3 text-violet-400 font-bold">{b._count.leads}</td><td className="px-5 py-3 text-gray-600 text-xs">{new Date(b.createdAt).toLocaleDateString()}</td></tr>))}</tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "sites" && <SitesPanel password={pw} />}
        </div>
      </main>
    </div>
  )
}
