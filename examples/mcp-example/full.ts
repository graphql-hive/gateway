import { config } from 'dotenv'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createYoga, createSchema } from 'graphql-yoga'
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime'
import { useMCP } from '@graphql-hive/plugin-mcp'

config({ path: new URL('.env', import.meta.url).pathname })

const __dirname = dirname(fileURLToPath(import.meta.url))

const weatherData: Record<string, { temperature: number; conditions: string; humidity: number }> = {
  'new york': { temperature: 72, conditions: 'Partly Cloudy', humidity: 65 },
  'london': { temperature: 58, conditions: 'Rainy', humidity: 85 },
  'tokyo': { temperature: 68, conditions: 'Sunny', humidity: 55 },
  'sydney': { temperature: 82, conditions: 'Clear', humidity: 45 },
  'paris': { temperature: 63, conditions: 'Overcast', humidity: 70 },
}

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      "Get current weather data for a location"
      weather(
        "City name or postal code"
        location: String!
      ): Weather!

      "Get weather forecast for upcoming days"
      forecast(
        "City name or postal code"
        location: String!

        "Number of days to forecast (default 5)"
        days: Int = 5
      ): [ForecastDay!]!

      "Search documentation articles"
      search(
        q: String!
        pageSize: Int = 3
        sources: [SearchDataSource!] = [ToastCentralArticle]
        startIndex: Int = 0
      ): SearchResult!
    }

    enum SearchDataSource {
      ToastCentralArticle
      KnowledgeBase
      FAQ
    }

    type SearchResult {
      items: [SearchItem!]!
    }

    type SearchItem {
      path: String!
      topic: String!
      description: String!
      score: Float!
    }

    type Weather {
      "Temperature in Fahrenheit"
      temperature: Float!
      "Current weather conditions"
      conditions: String!
      "Humidity percentage"
      humidity: Int!
      "Location name"
      location: String!
    }

    type ForecastDay {
      "Date in YYYY-MM-DD format"
      date: String!
      "High temperature in Fahrenheit"
      high: Float!
      "Low temperature in Fahrenheit"
      low: Float!
      "Expected weather conditions"
      conditions: String!
    }
  `,
  resolvers: {
    Query: {
      weather: (_, { location }: { location: string }) => {
        const loc = location.toLowerCase()
        const data = weatherData[loc] || { temperature: 70, conditions: 'Unknown', humidity: 50 }
        return { ...data, location }
      },
      search: (_, { q, pageSize = 3 }: { q: string; pageSize?: number }) => ({
        items: Array.from({ length: Math.min(pageSize, 5) }, (_, i) => ({
          path: `/articles/${q.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`,
          topic: `${q} - Article ${i + 1}`,
          description: `Documentation about ${q} (result ${i + 1})`,
          score: +(1 - i * 0.1).toFixed(2),
        })),
      }),
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

const mcpPlugin = useMCP({
  name: 'weather-api',             // MCP server name (returned in initialize)
  version: '1.0.0',                // MCP server version

  path: '/mcp',                    // MCP JSON-RPC endpoint (default: '/mcp')
  // graphqlPath: '/graphql',      // GraphQL endpoint for internal dispatch (default: '/graphql')

  // Path to .graphql file(s) with named operations (and optional @mcpTool directives).
  // Can be a single file or a directory (all .graphql files are loaded).
  operationsPath: join(__dirname, 'operations/weather_directive.graphql'),
  // operationsStr: '...',         // Alternative: pass operations as a string directly

  // Register providers that can dynamically fetch tool/field descriptions.
  // Built-in: 'langfuse'. Custom: pass any object with fetchDescription().
  providers: {
    langfuse: {
      // Langfuse SDK constructor options (secretKey, publicKey, baseUrl)
      // are read from LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL env vars.

      // `defaults` — default options for all getPrompt() calls.
      // Use this to set a global label per environment instead of repeating it per tool.
      // Precedence: per-request (?promptLabel= query param) -> per-tool options -> defaults
      defaults: { label: process.env.LANGFUSE_PROMPT_LABEL || 'production' },
    },
  },

  // disableGraphQLEndpoint: true,    // Block external /graphql access (MCP-only mode)
  // includeContentFallback: true,    // Include text content alongside structuredContent

  // Each tool maps to a GraphQL operation. The MCP input schema is auto-derived
  // from the operation's variables, and the output schema from its selection set.
  tools: [
    // Tool 1: File-based source + Langfuse + aliasing
    {
      name: 'get_weather',            // MCP tool name (used in tools/call)

      // source: where to find the GraphQL operation
      //   type: 'graphql' — reference a named operation from operationsPath
      //   type: 'inline'  — define the query directly (see tool 3)
      source: {
        type: 'graphql',
        operationName: 'GetWeather',
        operationType: 'query',
      },

      // tool: metadata overrides for the MCP tool definition
      tool: {
        title: 'Current Weather',

        // description: 'Static description',  // Static override (highest priority after provider)

        // descriptionProvider — fetch description dynamically at tools/list time.
        // The provider is called on every tools/list request (not cached).
        // Precedence: descriptionProvider > description > @mcpTool directive > schema description
        descriptionProvider: {
          type: 'langfuse',                    // Registered provider name
          prompt: 'get_weather_description',   // Langfuse prompt name
          // version: 2,                       // Pin to a specific prompt version
          // options: { label: 'staging' },    // Per-tool override of provider defaults
        },
      },

      // input: customize the auto-derived input schema
      input: {
        schema: {
          properties: {
            // Keys match the GraphQL variable names (before aliasing)
            location: {
              // alias — expose this variable under a different name in MCP.
              // The MCP client sees 'city', but the GraphQL query receives 'location'.
              alias: 'city',

              // description: 'Static field description',  // Override auto-derived description

              // descriptionProvider — fetch field description dynamically (same as tool-level)
              descriptionProvider: {
                type: 'langfuse',
                prompt: 'get_weather_location_description',
              },

              // examples: ['New York', 'London'],   // Example values shown to MCP clients
              // default: 'New York',                // Default value for this field
            },
          },
        },
      },
    },

    // Tool 2: File-based source with per-tool file override
    // Uses a different .graphql file than the global operationsPath.
    // Description auto-derived from GraphQL schema field descriptions.
    {
      name: 'get_forecast',
      source: {
        type: 'graphql',
        operationName: 'GetForecast',
        operationType: 'query',
        file: join(__dirname, 'operations/weather_override.graphql'), // Override: load from this file instead of operationsPath
      },
    },

    // Tool 3: Inline source + output.path
    {
      name: 'get_conditions',

      // Inline source: query defined directly (no operations file needed)
      source: {
        type: 'inline',
        query: `query GetConditions($location: String!) {
          weather(location: $location) {
            conditions
          }
        }`,
      },

      tool: {
        title: 'Weather Conditions',
        description: 'Get just the weather conditions for a city',
      },

      // output.path — extract a nested value from the GraphQL response.
      // Without path: { weather: { conditions: "Sunny" } }
      // With path 'weather.conditions': "Sunny"
      // The output schema is also narrowed to match.
      output: { path: 'weather.conditions' },
    },

    // Tool 4: Real-world pattern (alias + defaults + Langfuse + output.path)
    // fields have per-field Langfuse descriptions, and some args are hidden with defaults.
    {
      name: 'search_docs',
      source: {
        type: 'inline',
        query: `query SearchDocs($q: String!, $pageSize: Int = 3, $sources: [SearchDataSource!] = [ToastCentralArticle]) {
          search(q: $q, pageSize: $pageSize, sources: $sources, startIndex: 0) {
            items { path topic description score }
          }
        }`,
      },
      tool: {
        title: 'Search Documentation',
        descriptionProvider: {
          type: 'langfuse',
          prompt: 'search_docs_tool_description',
        },
      },
      input: {
        schema: {
          properties: {
            q: {
              alias: 'searchQuery',             // MCP client sees "searchQuery", GraphQL gets "$q"
              descriptionProvider: {
                type: 'langfuse',
                prompt: 'search_docs_argument_search_query',
              },
            },
            pageSize: {
              default: 3,                       // Optional with default
              descriptionProvider: {
                type: 'langfuse',
                prompt: 'search_docs_argument_page_size',
              },
            },
            sources: {
              default: ['ToastCentralArticle'],  // Hidden from MCP client with a fixed default
              description: 'Data sources to search',
            },
          },
        },
      },
      output: { path: 'search.items' },         // Returns items array directly
    },

    // Tool 5: @mcpTool directive (auto-registered)
    // Operations with @mcpTool directives in operationsPath are auto-registered.
    // Example in weather_directive.graphql:
    //   query QuickWeather($location: String!) @mcpTool(name: "quick_weather", description: "Quick weather check") { ... }
    //
    // Directive tools can be augmented by adding a matching entry here with the same name.
  ],
})

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
  console.log('  Per-request label override: POST /mcp?promptLabel=staging')
})
