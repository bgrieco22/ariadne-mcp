/**
 * Turns a footprint audit into what the MCP tool returns: a readable report
 * for the model to relay, plus structured content for clients that use it.
 */
import type { FootprintAuditResults } from '#core/server/utils/publicTools'

// Words that don't help tell two practice names apart.
const NAME_NOISE = new Set(['the', 'and', 'of', 'llc', 'pllc', 'inc', 'pc', 'ps', 'co', 'group', 'services', 'counseling', 'therapy', 'center', 'centre', 'practice', 'wellness', 'mental', 'health', 'psychotherapy', 'associates'])

function distinctiveWords(name: string): Set<string> {
  return new Set(
    name.toLowerCase()
      .replace(/&/g, ' and ')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 1 && !NAME_NOISE.has(w)),
  )
}

/**
 * Google sometimes matches a different business with a similar name. Treat
 * the listing as a match when the practice name's distinctive words mostly
 * appear in the listing name ("Seattle EMDR Associates" ≈ "Seattle EMDR
 * Associates, PLLC"; "Paradox Therapy" ≠ "Paradigm Counseling of Puget Sound").
 */
export function looksLikeSameBusiness(requested: string, listing: string | null): boolean {
  if (!listing) return false
  const wanted = distinctiveWords(requested)
  if (wanted.size === 0) return true // nothing distinctive to compare
  const found = distinctiveWords(listing)
  const overlap = [...wanted].filter(w => found.has(w)).length
  return overlap / wanted.size >= 0.5
}

/** True when a Google-formatted address ("…, Portland, OR 97202, USA") is in the given state. */
export function addressInState(address: string | null, state: string): boolean {
  if (!address) return true // nothing to contradict the match
  return new RegExp(`\\b${state.toUpperCase()}\\s+\\d{5}`).test(address)
}

/** Name and state both agree with what was asked for. */
export function listingMatches(results: FootprintAuditResults): boolean {
  const { gbp, inputs } = results
  return looksLikeSameBusiness(inputs.businessName, gbp.name) && addressInState(gbp.formattedAddress, inputs.locationState)
}

const yesNo = (v: unknown) => (v ? 'yes' : 'no')

export function formatAuditReport(results: FootprintAuditResults, cached: boolean): string {
  const { score, gbp, website, recommendations, inputs } = results
  const lines: string[] = []

  lines.push(`Footprint audit for ${inputs.businessName} (${inputs.locationCity}, ${inputs.locationState}): ${score}/100${cached ? ' (saved report from earlier this week)' : ''}`)
  lines.push('')

  if (gbp.found) {
    lines.push(`Google Business Profile: found as "${gbp.name}"${gbp.formattedAddress ? `, ${gbp.formattedAddress}` : ''}.`)
    lines.push(`- Phone listed: ${yesNo(gbp.phone)} · Website link: ${yesNo(gbp.website)} · Hours set: ${yesNo(gbp.hasHours)} · Photos: ${gbp.photoCount}`)
    if (!listingMatches(results)) {
      lines.push('- Note: the matched listing\'s name or location differs from what was given. Confirm it\'s the right business before acting on the Google Business Profile findings.')
    }
  }
  else {
    lines.push(`Google Business Profile: not found under "${inputs.businessName}" in ${inputs.locationCity}, ${inputs.locationState}. It may be listed under a different name.`)
  }

  if (website?.fetched) {
    lines.push(`Website (${inputs.websiteUrl}): HTTPS ${yesNo(website.https)} · title ${website.title ? `"${website.title}"` : 'missing'} · meta description ${website.metaDescription ? 'present' : 'missing'} · H1 ${website.h1 ? 'present' : 'missing'} · LocalBusiness schema ${website.hasSchemaLocalBusiness ? 'present' : 'missing'}`)
  }
  else if (website?.error) {
    lines.push(`Website: couldn't be checked (${website.error}).`)
  }

  lines.push('')
  if (recommendations.length) {
    lines.push('Fixes, most important first:')
    recommendations.forEach((r, i) => lines.push(`${i + 1}. [${r.severity}] ${r.title}: ${r.body}`))
  }
  else {
    lines.push('No fixes found. The setup is complete; staying visible from here is mostly about posting consistently.')
  }

  lines.push('')
  lines.push('This audit measures setup completeness, not search ranking. It never recommends asking therapy clients for reviews.')
  lines.push('Interactive version: https://therapists.ariadnemarketing.com/audit')

  return lines.join('\n')
}

export function auditStructuredContent(results: FootprintAuditResults, cached: boolean): Record<string, unknown> {
  const { score, gbp, recommendations } = results
  return {
    score,
    cached,
    googleBusinessProfile: gbp.found
      ? {
          found: true,
          name: gbp.name,
          matchesRequestedPractice: listingMatches(results),
          address: gbp.formattedAddress,
          hasPhone: !!gbp.phone,
          hasWebsiteLink: !!gbp.website,
          hasHours: gbp.hasHours,
          photoCount: gbp.photoCount,
        }
      : { found: false },
    recommendations: recommendations.map(r => ({ severity: r.severity, title: r.title, detail: r.body })),
  }
}
