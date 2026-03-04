import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createYoga, createSchema } from 'graphql-yoga'
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime'
import { useMCP } from '@graphql-hive/plugin-mcp'
import type { MCPConfig } from '@graphql-hive/plugin-mcp'
// @ts-expect-error no type declarations
import yaml from 'js-yaml'

const weatherData: Record<string, { temperature: number; conditions: string; humidity: number }> = {
  'new york': { temperature: 72, conditions: 'Partly Cloudy', humidity: 65 },
  'london': { temperature: 58, conditions: 'Rainy', humidity: 85 },
  'tokyo': { temperature: 68, conditions: 'Sunny', humidity: 55 },
}

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      "Get current weather data for a location"
      weather(location: String!): Weather!

      "Get weather forecast for upcoming days"
      forecast(location: String!, days: Int = 5): [ForecastDay!]!
    }

    type Weather {
      temperature: Float!
      conditions: String!
      humidity: Int!
      location: String!
    }

    type ForecastDay {
      date: String!
      high: Float!
      low: Float!
      conditions: String!
    }
  `,
  resolvers: {
    Query: {
      weather: (_, { location }: { location: string }) => {
        const data = weatherData[location.toLowerCase()] || { temperature: 70, conditions: 'Unknown', humidity: 50 }
        return { ...data, location }
      },
      forecast: (_, { location, days = 5 }: { location: string; days?: number }) => {
        const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Clear']
        const result = []
        const today = new Date()
        for (let i = 0; i < days; i++) {
          const date = new Date(today)
          date.setDate(date.getDate() + i)
          result.push({
            date: date.toISOString().split('T')[0],
            high: Math.round(65 + Math.random() * 20),
            low: Math.round(45 + Math.random() * 15),
            conditions: conditions[Math.floor(Math.random() * conditions.length)],
          })
        }
        return result
      },
    },
  },
})

const subgraphYoga = createYoga({ schema })
const subgraphServer = createServer(subgraphYoga)
subgraphServer.listen(4001, () => {
  console.log('Subgraph running at http://localhost:4001/graphql')
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const mcpConfig = yaml.load(readFileSync(join(__dirname, 'mcp.yaml'), 'utf-8')) as MCPConfig
const mcpPlugin = useMCP(mcpConfig)

const gateway = createGatewayRuntime({
  proxy: {
    endpoint: 'http://localhost:4001/graphql',
  },
  plugins: () => [mcpPlugin],
})

const gatewayServer = createServer(gateway)
gatewayServer.listen(4000, () => {
  console.log('Gateway running at http://localhost:4000/graphql')
  console.log('MCP endpoint at http://localhost:4000/mcp')
})
