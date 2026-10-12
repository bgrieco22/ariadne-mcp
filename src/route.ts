/**
 * Ariadne's public MCP server: https://therapists.ariadnemarketing.com/mcp
 *
 * Lets AI assistants and agents use Ariadne's free tools on a therapist's
 * behalf: the footprint audit and the sample Google Business post, plus a
 * factual product overview. Listed in the official MCP Registry as
 * `com.ariadnemarketing/therapist-marketing`.
 *
 * This file is the HTTP transport only (MCP "streamable HTTP", stateless, no
 * auth). Every POST carries one JSON-RPC message (or, for older clients, a
 * batch) and gets a single application/json response; there's no
 * server-initiated stream, so GET returns 405 as the spec allows.
 *
 *   server/mcp/protocol.ts  JSON-RPC dispatch: initialize, tools/list, tools/call, …
 *   server/mcp/tools.ts     tool definitions and handlers
 *   server/mcp/format.ts    audit report formatting
 *
 * Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 */
import { PARSE_ERROR, handleMessage, rpcError } from './mcp/protocol'

export default defineEventHandler(async (event) => {
  // Public server: browser-based MCP clients need CORS.
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  })

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }

  if (event.method !== 'POST') {
    setResponseStatus(event, 405)
    setResponseHeader(event, 'Allow', 'POST, OPTIONS')
    return {
      error: 'This is an MCP endpoint (streamable HTTP). Connect with an MCP client and send JSON-RPC over POST.',
      docs: 'https://ariadnemarketing.com/therapists',
    }
  }

  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    setResponseStatus(event, 400)
    return rpcError(null, PARSE_ERROR, 'Parse error')
  }

  setResponseHeader(event, 'Content-Type', 'application/json')

  // JSON-RPC batches were dropped in protocol 2025-06-18; still accepted for
  // clients on older versions.
  const responses = Array.isArray(body)
    ? (await Promise.all(body.map(msg => handleMessage(event, msg)))).filter(r => r !== null)
    : [await handleMessage(event, body)].filter(r => r !== null)

  // Only notifications: acknowledge with 202 and no body.
  if (responses.length === 0) {
    setResponseStatus(event, 202)
    return ''
  }

  return Array.isArray(body) ? responses : responses[0]
})
