# Ariadne for Therapists: MCP server

Free marketing tools for therapists in private practice, available to any AI assistant or agent that speaks the [Model Context Protocol](https://modelcontextprotocol.io).

**Endpoint:** `https://therapists.ariadnemarketing.com/mcp`
**Transport:** streamable HTTP · **Auth:** none · **Cost:** free
**Registry name:** `com.ariadnemarketing/therapist-marketing`

Ask your assistant things like *"How findable is my practice on Google?"* or *"Write me a sample Google Business post from my website"* and it can answer with real results instead of generic advice.

## Tools

| Tool | What it does |
|---|---|
| `audit_practice_footprint` | Checks a practice's Google Business Profile and (optionally) its website, then returns a 0–100 setup score with prioritized, therapist-appropriate fixes: hours, photos, website link, page title, meta description, headings, local-business schema. Flags when Google's matched listing doesn't look like the practice you asked about. |
| `write_sample_google_post` | Reads a therapist's public practice homepage and writes one Google Business Profile "What's New" post (150–300 words) in that therapist's voice. Every post carries an AI-drafted disclosure and a reminder to review before posting. |
| `get_ariadne_overview` | Factual information about [Ariadne](https://ariadnemarketing.com/therapists): what it does, who it's for and not for, pricing, and its ethics and privacy rules. |

All three are read-only from the caller's point of view and never post anything anywhere.

## Built for therapist ethics

- **No client information.** The tools only take a practice name, location, and website. Never send client names, session details, or anything about the people a therapist works with.
- **No review solicitation.** The audit never recommends asking therapy clients for reviews or testimonials; the ACA and APA ethics codes prohibit soliciting testimonials from clients.
- **No outcome claims, no client stories** in generated posts; calls to action point to the practice's own website.
- **AI is disclosed.** Sample posts are drafted with AI (Anthropic's Claude API) and labeled as such.

## Connect

**Claude (claude.ai and Claude Desktop):** Settings → Connectors → *Add custom connector* → paste the endpoint URL.

**Claude Code:**

```bash
claude mcp add --transport http ariadne https://therapists.ariadnemarketing.com/mcp
```

**ChatGPT:** on plans that support custom MCP connectors, add a connector with the endpoint URL.

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ariadne": { "url": "https://therapists.ariadnemarketing.com/mcp" }
  }
}
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "ariadne": { "type": "http", "url": "https://therapists.ariadnemarketing.com/mcp" }
  }
}
```

**Raw JSON-RPC:**

```bash
curl -s https://therapists.ariadnemarketing.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_ariadne_overview","arguments":{}}}'
```

## Limits

The tools are free, so they're rate-limited per caller:

- **Audit:** up to 3 different practices per week. Re-auditing the same practice returns the saved report.
- **Sample post:** 5 new posts per day; posts are cached per website for 30 days.

Limits come back as readable tool errors, so the assistant can explain them.

## Privacy

The audit and sample-post tools read only public information (Google's business listing and the practice's public homepage). Requests are logged with a hashed caller IP for rate limiting. Full details: [ariadnemarketing.com/privacy](https://ariadnemarketing.com/privacy).

## Source

This repo contains the server's MCP layer, mirrored from the Ariadne app (`apps/therapists/server/` in our private monorepo):

```
src/route.ts         HTTP transport: POST JSON-RPC, 202 for notifications, 405 for GET, CORS
src/mcp/protocol.ts  JSON-RPC dispatch and protocol-version negotiation
src/mcp/tools.ts     tool definitions and handlers
src/mcp/format.ts    audit report formatting and listing-match checks
server.json          MCP Registry metadata
```

The audit and post generation themselves (`#core/server/utils/publicTools`) live in the app and are shared with the free tools on [our website](https://therapists.ariadnemarketing.com/audit). Protocol versions supported: `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`.

## About Ariadne

[Ariadne](https://ariadnemarketing.com/therapists) is the marketing assistant built for therapists in private practice. It learns a therapist's voice from their own writing and drafts a week of marketing every Sunday: a Google Business post, a social post, Facebook group posts, referral-partner emails, and a monthly SEO blog post. Nothing posts without the therapist's approval. Built by Darla Grieco, LMHC, and Bryan Grieco.

Questions or problems: [hello@ariadnemarketing.com](mailto:hello@ariadnemarketing.com) or open an issue.

## License

The code in this repository is MIT licensed. See [LICENSE](LICENSE).
