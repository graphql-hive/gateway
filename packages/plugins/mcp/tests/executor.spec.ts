import { describe, it, expect, vi } from 'vitest'
import { createGraphQLExecutor } from '../src/executor.js'
import { ToolRegistry } from '../src/registry.js'
import { buildSchema } from 'graphql'

describe('createGraphQLExecutor', () => {
  const schema = buildSchema(`
    type Query {
      hello(name: String!): String
    }
  `)

  const registry = new ToolRegistry(
    [{
      name: 'say_hello',
      query: `query SayHello($name: String!) { hello(name: $name) }`
    }],
    schema
  )

  it('executes tool query via dispatch', async () => {
    const dispatch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { hello: 'World' } }))
    )

    const execute = createGraphQLExecutor(registry, 'http://localhost:4000/graphql', dispatch)
    const result = await execute('say_hello', { name: 'World' })

    expect(dispatch).toHaveBeenCalledWith(
      'http://localhost:4000/graphql',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query: 'query SayHello($name: String!) { hello(name: $name) }',
          variables: { name: 'World' }
        })
      })
    )
    expect(result).toEqual({ data: { hello: 'World' } })
  })

  it('throws for unknown tool', async () => {
    const dispatch = vi.fn()
    const execute = createGraphQLExecutor(registry, 'http://localhost:4000/graphql', dispatch)
    await expect(execute('unknown', {})).rejects.toThrow('Unknown tool: unknown')
  })

  it('forwards headers from context', async () => {
    const dispatch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }))
    )

    const execute = createGraphQLExecutor(registry, 'http://localhost:4000/graphql', dispatch)
    await execute('say_hello', { name: 'Test' }, {
      headers: { 'Authorization': 'Bearer token123' }
    })

    expect(dispatch).toHaveBeenCalledWith(
      'http://localhost:4000/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json'
        })
      })
    )
  })
})
