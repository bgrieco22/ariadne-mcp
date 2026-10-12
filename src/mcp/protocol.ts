/**
 * The Model Context Protocol's JSON-RPC layer, for a stateless, tools-only
 * server. Transport-agnostic: the HTTP route (server/routes/mcp.ts) parses the
 * body and hands each message to `handleMessage`.
 *
 * Spec: https://modelcontextprotocol.io/specification
 */
import type { H3Event } from 'h3'
import { TOOLS, runTool } from './tools'

// ── Types ───────────────────────────────────────────────────────────────────

export type JsonRpcId = string | number

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  /** Absent on notifications, which never get a response. */
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0', id: JsonRpcId, result: unknown }
  | { jsonrpc: '2.0', id: JsonRpcId | null, error: { code: number, message: string } }

// Standard JSON-RPC 2.0 error codes.
export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
export const METHOD_NOT_FOUND = -32601
export const INVALID_PARAMS = -32602

// ── Server identity ─────────────────────────────────────────────────────────

export const SERVER_INFO = {
  name: 'ariadne-therapist-marketing',
  title: 'Ariadne for Therapists',
  version: '1.0.0',
}

/** Newest first. We answer with the client's version when we support it. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS = `Free marketing tools for therapists in private practice, from Ariadne (ariadnemarketing.com).
- audit_practice_footprint: checks a practice's Google Business Profile and website and returns a 0-100 score with prioritized fixes.
- write_sample_google_post: writes one sample Google Business Profile post in the voice of a therapist's public website.
- get_ariadne_overview: what Ariadne is, who it's for, pricing, and its ethics rules.
Never send client names, session details, or any information about a therapist's clients to these tools. The tools never recommend soliciting reviews or testimonials from clients.`

// ── Helpers ─────────────────────────────────────────────────────────────────

export const rpcResult = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })

export const rpcError = (id: JsonRpcId | null | undefined, code: number, message: string): JsonRpcResponse =>
  ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

function isRequest(msg: unknown): msg is JsonRpcRequest {
  return typeof msg === 'object' && msg !== null
    && (msg as JsonRpcRequest).jsonrpc === '2.0'
    && typeof (msg as JsonRpcRequest).method === 'string'
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Handles one JSON-RPC message. Returns the response, or null for
 * notifications (messages without an id), which must not be answered.
 */
export async function handleMessage(event: H3Event, msg: unknown): Promise<JsonRpcResponse | null> {
  if (!isRequest(msg)) {
    const id = (msg as { id?: JsonRpcId } | null)?.id
    return id === undefined ? null : rpcError(id, INVALID_REQUEST, 'Invalid Request')
  }

  // notifications/initialized, notifications/cancelled, …: nothing to do for
  // a stateless server, and notifications never get a reply.
  if (msg.id === undefined) return null

  const { id, method, params } = msg

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion
      const protocolVersion = typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : SUPPORTED_PROTOCOL_VERSIONS[0]
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      })
    }

    case 'ping':
      return rpcResult(id, {})

    case 'tools/list':
      return rpcResult(id, { tools: TOOLS.map(t => t.definition) })

    case 'tools/call': {
      const name = params?.name
      const args = params?.arguments
      if (typeof name !== 'string' || !TOOLS.some(t => t.definition.name === name)) {
        return rpcError(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`)
      }
      if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
        return rpcError(id, INVALID_PARAMS, 'Tool arguments must be an object.')
      }
      // Tool failures (bad input, rate limits, unreachable websites) come back
      // as results with isError, so the model can read them and adjust.
      return rpcResult(id, await runTool(event, name, (args ?? {}) as Record<string, unknown>))
    }

    // We only offer tools, but some clients probe the other list methods.
    // Empty lists are friendlier than errors.
    case 'resources/list':
      return rpcResult(id, { resources: [] })
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] })
    case 'prompts/list':
      return rpcResult(id, { prompts: [] })

    default:
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}
