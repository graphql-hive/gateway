import { describe, it, expect, vi } from 'vitest'
import { createMCPHandler, type MCPHandlerOptions } from '../src/protocol.js'
import { buildSchema } from 'graphql'
import { ToolRegistry } from '../src/registry.js'

describe('createMCPHandler', () => {
  const schema = buildSchema(`
    type Query {
      hello(name: String!): String
    }
  `)

  const registry = new ToolRegistry(
    [{ name: 'say_hello', query: 'query($name: String!) { hello(name: $name) }' }],
    schema
  )

  const mockExecute = vi.fn().mockResolvedValue({ data: { hello: 'world' } })

  const options: MCPHandlerOptions = {
    serverName: 'test-mcp',
    serverVersion: '1.0.0',
    registry,
    execute: mockExecute
  }

  it('handles initialize request', async () => {
    const handler = createMCPHandler(options)

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      })
    })

    const response = await handler(request)
    const body = await response.json()

    expect(body.result.serverInfo.name).toBe('test-mcp')
    expect(body.result.capabilities.tools).toBeDefined()
  })

  it('handles tools/list request', async () => {
    const handler = createMCPHandler(options)

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    })

    const response = await handler(request)
    const body = await response.json()

    expect(body.result.tools).toHaveLength(1)
    expect(body.result.tools[0].name).toBe('say_hello')
  })

  it('handles tools/call request and executes GraphQL', async () => {
    const handler = createMCPHandler(options)

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'say_hello',
          arguments: { name: 'World' }
        }
      })
    })

    const response = await handler(request)
    const body = await response.json()

    expect(mockExecute).toHaveBeenCalledWith('say_hello', { name: 'World' })
    expect(body.result.content).toBeDefined()
    expect(body.result.content[0].type).toBe('text')
  })

  it('returns error for unknown tool', async () => {
    const handler = createMCPHandler(options)

    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      })
    })

    const response = await handler(request)
    const body = await response.json()

    expect(body.result.isError).toBe(true)
  })
})
