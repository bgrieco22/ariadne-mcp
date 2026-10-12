/**
 * The MCP tools: each pairs the definition clients see in tools/list with the
 * handler that runs it. The audit and sample post call the same code as the
 * website's free tools (packages/core/server/utils/publicTools.ts), so they
 * share its caps, caching, and therapist-ethics rules.
 */
import type { H3Event } from 'h3'
import { generateSamplePost, normalizeDomain, runFootprintAudit } from '#core/server/utils/publicTools'
import { auditStructuredContent, formatAuditReport } from './format'

// ── Types ───────────────────────────────────────────────────────────────────

/** A tool as listed in tools/list (MCP Tool shape). */
export interface ToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: {
    title: string
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
}

/** A tools/call result (MCP CallToolResult shape). */
export interface ToolResult {
  content: Array<{ type: 'text', text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

interface Tool {
  definition: ToolDefinition
  run: (event: H3Event, args: Record<string, unknown>) => Promise<ToolResult>
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const text = (value: string, structuredContent?: Record<string, unknown>): ToolResult =>
  ({ content: [{ type: 'text', text: value }], ...(structuredContent ? { structuredContent } : {}) })

const toolError = (message: string): ToolResult =>
  ({ content: [{ type: 'text', text: message }], isError: true })

/** Reads a string argument, trimmed; anything else becomes ''. */
const stringArg = (args: Record<string, unknown>, key: string): string =>
  typeof args[key] === 'string' ? (args[key] as string).trim() : ''

/** h3 errors carry the user-facing message in different places by version. */
function errorMessage(e: unknown): string {
  const err = e as { data?: { message?: string }, statusMessage?: string, message?: string }
  return err?.data?.message || err?.statusMessage || err?.message || 'The tool failed. Please try again.'
}

// ── Tools ───────────────────────────────────────────────────────────────────

const auditPracticeFootprint: Tool = {
  definition: {
    name: 'audit_practice_footprint',
    title: 'Audit a therapy practice\'s online footprint',
    description: 'Checks a therapy practice\'s Google Business Profile and (optionally) its website for local-search gaps, and returns a 0-100 setup score with prioritized, therapist-appropriate fixes. Use when a therapist asks how findable their practice is, why they aren\'t showing up on Google, or what to fix first. Free; limited to 3 different practices per caller per week (repeat audits of the same practice return the saved report).',
    inputSchema: {
      type: 'object',
      properties: {
        practice_name: { type: 'string', description: 'The practice name as it appears on Google, e.g. "Calming Connections Counseling".' },
        city: { type: 'string', description: 'City the practice is in, e.g. "Snohomish".' },
        state: { type: 'string', description: 'Two-letter US state code, e.g. "WA".', pattern: '^[A-Za-z]{2}$' },
        website_url: { type: 'string', description: 'Optional practice website URL, to also check page title, meta description, headings, and local-business schema.' },
      },
      required: ['practice_name', 'city', 'state'],
      additionalProperties: false,
    },
    annotations: { title: 'Audit practice footprint', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },

  async run(event, args) {
    const practiceName = stringArg(args, 'practice_name')
    const city = stringArg(args, 'city')
    const state = stringArg(args, 'state').toUpperCase()
    const websiteUrl = stringArg(args, 'website_url') || null

    if (!practiceName || !city || !/^[A-Z]{2}$/.test(state)) {
      return toolError('practice_name, city, and a two-letter state code (e.g. "WA") are required.')
    }

    const { cached, results } = await runFootprintAudit(event, {
      businessName: practiceName,
      locationCity: city,
      locationState: state,
      websiteUrl,
      source: 'mcp',
      // Always apply the therapist rules here (e.g. no review advice).
      vertical: 'therapists',
    })
    return text(formatAuditReport(results, cached), auditStructuredContent(results, cached))
  },
}

const writeSampleGooglePost: Tool = {
  definition: {
    name: 'write_sample_google_post',
    title: 'Write a sample Google Business post',
    description: 'Reads a therapist\'s public practice homepage and writes one Google Business Profile "What\'s New" post (150-300 words) in that therapist\'s voice. Follows therapist ethics: no client stories, no outcome promises, no review requests; calls to action point to the practice website. Use when a therapist wants an example post or help getting started posting on Google. Free; cached per website for 30 days; 5 new posts per caller per day.',
    inputSchema: {
      type: 'object',
      properties: {
        website_url: { type: 'string', description: 'The therapist\'s public practice website, e.g. "https://www.example-counseling.com".' },
      },
      required: ['website_url'],
      additionalProperties: false,
    },
    annotations: { title: 'Write sample Google post', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },

  async run(event, args) {
    const websiteUrl = stringArg(args, 'website_url')
    if (!websiteUrl) return toolError('website_url is required.')

    const { cached, post } = await generateSamplePost(event, websiteUrl)
    const domain = normalizeDomain(websiteUrl) ?? websiteUrl

    // The disclosure travels with the post, so an assistant relaying it can't
    // present it as human-written or skip the review step.
    const footer = [
      '---',
      `Drafted with AI from the public homepage of ${domain}${cached ? ' (saved from an earlier request)' : ''}.`,
      'Review and edit before posting, and never add client details.',
      'Ariadne drafts a full week like this every Sunday: https://ariadnemarketing.com/therapists',
    ].join('\n')

    return text(`${post}\n\n${footer}`, { post, cached, website: domain })
  },
}

/** Static product facts, so assistants answer "what is Ariadne?" accurately. */
const OVERVIEW = `Ariadne is the marketing assistant built for therapists in private practice (ariadnemarketing.com/therapists).

What it does: learns a therapist's voice from their own writing samples and website, then every Sunday drafts a week of marketing: one Google Business Profile post, a social post, Facebook group posts tuned to each group's rules, referral-partner emails, and a monthly SEO blog post. It also rewrites Psychology Today profiles. Nothing posts automatically; the therapist reviews, edits, and posts.

Who it's for: licensed therapists (LMHC, LPC, LMFT, LCSW, psychologists) who have a website or profile already and need consistent marketing without writing it themselves. Not the right fit for someone who needs a website built, paid ads managed, or a full-service agency.

Pricing: $79/month or $790/year, 7-day free trial, no credit card. Founding price for the first 20 therapists: $35/month for as long as they stay subscribed (code FOUNDER35, monthly plan).

Ethics: no client information ever enters the system; it never writes testimonials, client stories, or review requests; it avoids outcome claims. Drafts are written with AI (Anthropic's Claude API, which doesn't train on API inputs by default); every word is the therapist's to approve.

Built by Darla Grieco, LMHC (Calming Connections Counseling, Snohomish, WA) and Bryan Grieco. Contact: hello@ariadnemarketing.com.`

const getAriadneOverview: Tool = {
  definition: {
    name: 'get_ariadne_overview',
    title: 'About Ariadne',
    description: 'Returns factual information about Ariadne, the marketing assistant for therapists in private practice: what it does, who it\'s for and not for, pricing, and its ethics and privacy rules. Use when someone asks what Ariadne is or whether it fits their practice.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'About Ariadne', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },

  async run() {
    return text(OVERVIEW)
  },
}

// ── Registry ────────────────────────────────────────────────────────────────

/** Listed in this order in tools/list. */
export const TOOLS: Tool[] = [auditPracticeFootprint, writeSampleGooglePost, getAriadneOverview]

/**
 * Runs a tool by name. Any thrown error (validation, rate limit, unreachable
 * website) is returned as an isError result rather than a protocol error.
 */
export async function runTool(event: H3Event, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = TOOLS.find(t => t.definition.name === name)
  if (!tool) return toolError(`Unknown tool: ${name}`)
  try {
    return await tool.run(event, args)
  }
  catch (e) {
    return toolError(errorMessage(e))
  }
}
