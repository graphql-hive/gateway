import { describe, it, expect } from 'vitest'
import { useMCP } from '../src/plugin.js'

describe('MCP Integration', () => {
  const mcpPlugin = useMCP({
    name: 'test-mcp',
    version: '1.0.0',
    path: '/mcp',
    tools: [
      {
        name: 'greet',
        description: 'Greet someone by name',
        query: `query Greet($name: String!) { hello(name: $name) }`
      },
      {
        name: 'get_weather',
        description: 'Get weather for a location',
        query: `
          query GetWeather($location: String!) {
            weather(location: $location) {
              temperature
              conditions
            }
          }
        `
      }
    ]
  })

  it('plugin exports correctly', () => {
    expect(mcpPlugin).toBeDefined()
    expect(mcpPlugin.onSchemaChange).toBeDefined()
    expect(mcpPlugin.onRequest).toBeDefined()
  })
})
