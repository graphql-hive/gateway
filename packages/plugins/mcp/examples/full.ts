import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { useMCP, type MCPConfig } from '@graphql-hive/plugin-mcp';
import { config } from 'dotenv';
import { createSchema, createYoga } from 'graphql-yoga';

config({ path: new URL('.env', import.meta.url).pathname });

const __dirname = dirname(fileURLToPath(import.meta.url));

const weatherData: Record<
  string,
  { temperature: number; conditions: string; humidity: number }
> = {
  'new york': { temperature: 72, conditions: 'Partly Cloudy', humidity: 65 },
  london: { temperature: 58, conditions: 'Rainy', humidity: 85 },
  tokyo: { temperature: 68, conditions: 'Sunny', humidity: 55 },
  sydney: { temperature: 82, conditions: 'Clear', humidity: 45 },
  paris: { temperature: 63, conditions: 'Overcast', humidity: 70 },
};

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      "Get current weather data for a location"
      weather("City name or postal code" location: String!): Weather!

      "Get weather forecast for upcoming days"
      forecast(
        "City name or postal code"
        location: String!

        "Number of days to forecast (default 5)"
        days: Int = 5
      ): [ForecastDay!]!

      "Get company info for the authenticated company"
      company(companyId: String!): Company!

      "Search documentation articles"
      search(
        q: String!
        pageSize: Int = 3
        sources: [SearchDataSource!] = [ToastCentralArticle]
        startIndex: Int = 0
      ): SearchResult!
    }

    type Mutation {
      "Cancel an order by ID. This is a destructive action."
      cancelOrder(
        "The order ID to cancel"
        orderId: String!
        "Confirmation token (required to execute)"
        confirmationId: String
      ): CancelResult!
    }

    type CancelResult {
      success: Boolean!
      message: String!
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

    type Company {
      id: String!
      name: String!
      plan: String!
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
        const loc = location.toLowerCase();
        const data = weatherData[loc] || {
          temperature: 70,
          conditions: 'Unknown',
          humidity: 50,
        };
        return { ...data, location };
      },
      company: (_, { companyId }: { companyId: string }) => ({
        id: companyId,
        name: `Company ${companyId}`,
        plan: 'enterprise',
      }),
      search: (_, { q, pageSize = 3 }: { q: string; pageSize?: number }) => ({
        items: Array.from({ length: Math.min(pageSize, 5) }, (_, i) => ({
          path: `/articles/${q.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`,
          topic: `${q} - Article ${i + 1}`,
          description: `Documentation about ${q} (result ${i + 1})`,
          score: +(1 - i * 0.1).toFixed(2),
        })),
      }),
      forecast: (_, { days = 5 }: { location: string; days?: number }) => {
        const conditions = [
          'Sunny',
          'Partly Cloudy',
          'Cloudy',
          'Rainy',
          'Clear',
        ];
        const result = [];
        const today = new Date();
        for (let i = 0; i < days; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() + i);
          result.push({
            date: date.toISOString().split('T')[0],
            high: Math.round(65 + Math.random() * 20),
            low: Math.round(45 + Math.random() * 15),
            conditions:
              conditions[Math.floor(Math.random() * conditions.length)],
          });
        }
        return result;
      },
    },
    Mutation: {
      cancelOrder: (
        _,
        {
          orderId,
          confirmationId,
        }: { orderId: string; confirmationId?: string },
      ) => {
        if (!confirmationId) {
          return { success: false, message: 'Confirmation required' };
        }
        return { success: true, message: `Order ${orderId} cancelled` };
      },
    },
  },
});

const subgraphYoga = createYoga({ schema });
const subgraphServer = createServer(subgraphYoga);
subgraphServer.listen(4001, () => {
  console.log('Subgraph running at http://localhost:4001/graphql');
});

const mcpOptions: MCPConfig = {
  name: 'weather-api', // MCP server name (returned in initialize)
  version: '1.0.0', // MCP server version
  protocolVersion: '2025-11-25', // MCP protocol version (default: '2025-11-25')

  path: '/mcp', // MCP JSON-RPC endpoint (default: '/mcp')

  // Path to .graphql file(s) with named operations (and optional @mcpTool / @mcpDescription directives).
  // Can be a single file or a directory (all .graphql files are loaded).
  operationsPath: join(__dirname, 'operations/weather_directive.graphql'),
  // operationsStr: '...',         // Alternative: pass operations as a string directly

  // Dynamic operations loader: fetch operations from any external source.
  // load() is called at startup. onUpdate() subscribes to live changes.
  // loader: {
  //   async load() {
  //     const res = await fetch('https://my-cdn.example.com/operations.graphql');
  //     return res.text();
  //   },
  //   onUpdate(callback) {
  //     const interval = setInterval(async () => {
  //       const res = await fetch('https://my-cdn.example.com/operations.graphql');
  //       callback(await res.text());
  //     }, 60_000);
  //     return () => clearInterval(interval);
  //   },
  // },

  // Register providers that can dynamically fetch tool/field descriptions.
  // Built-in: 'langfuse'. Custom: pass any object with fetchDescription().
  providers: {
    langfuse: {
      // Langfuse SDK constructor options (secretKey, publicKey, baseUrl)
      // are read from LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL env vars.

      // `defaults` — default options for all prompt.get() calls.
      // Use this to set a global label per environment instead of repeating it per tool.
      // Precedence: per-request (?promptLabel= query param) -> per-tool options -> defaults
      defaults: { label: process.env['LANGFUSE_PROMPT_LABEL'] || 'production' },
    },
  },

  suppressOutputSchema: false, // Suppress outputSchema for all tools in tools/list

  // Each tool maps to a GraphQL operation. The MCP input schema is auto-derived
  // from the operation's variables, and the output schema from its selection set.
  tools: [
    // Tool 1: File-based source + Langfuse + aliasing
    {
      name: 'get_weather', // MCP tool name (used in tools/call)

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
          type: 'langfuse', // Registered provider name
          prompt: 'get_weather_description', // Langfuse prompt name
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

        // _meta - opaque metadata passed through to MCP clients in tools/list.
        // Clients can use this for access control, routing, UI hints, etc.
        // If the operation also has @mcpTool(meta: {...}), the two are shallow
        // merged with config _meta winning on key conflicts.
        _meta: { team: 'weather', readOnly: true },
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
              alias: 'searchQuery', // MCP client sees "searchQuery", GraphQL gets "$q"
              descriptionProvider: {
                type: 'langfuse',
                prompt: 'search_docs_argument_search_query',
              },
            },
            pageSize: {
              default: 3, // Optional with default
              descriptionProvider: {
                type: 'langfuse',
                prompt: 'search_docs_argument_page_size',
              },
            },
            sources: {
              default: ['ToastCentralArticle'], // Hidden from MCP client with a fixed default
              description: 'Data sources to search',
            },
          },
        },
      },
      output: {
        path: 'search.items', // Returns items array directly
        // schema: false,        // Suppress outputSchema in tools/list
      },
      // hooks transform inputs/outputs without changing the GraphQL query.
      // postprocess receives the already-extracted items array (thanks to output.path).
      // You can return any shape, here we format results as a markdown table
      // and inject _metadata for the agent (query context, source, timing).
      hooks: {
        postprocess: (result, args) => {
          const items = result as Array<{
            path: string;
            topic: string;
            description: string;
            score: number;
          }>;
          if (!Array.isArray(items) || items.length === 0) return result;
          const header =
            '| Topic | Description | Score | Link |\n|-------|-------------|-------|------|';
          const rows = items.map(
            (item) =>
              `| ${item.topic} | ${item.description} | ${item.score} | ${item.path} |`,
          );
          return {
            content: [{ type: 'text', text: `${header}\n${rows.join('\n')}` }],
            _metadata: {
              query: args['q'],
              source: 'toast-central',
              timestamp: Date.now(),
            },
          };
        },
      },
    },

    // Tool 5: Mutation with preprocess confirmation gate
    // The preprocess hook checks for a _confirmationId argument. If missing, it
    // short-circuits and returns a confirmation prompt instead of executing the mutation.
    {
      name: 'cancel_order',
      source: {
        type: 'inline',
        query: `mutation CancelOrder($orderId: String!, $confirmationId: String) {
          cancelOrder(orderId: $orderId, confirmationId: $confirmationId) {
            success
            message
          }
        }`,
      },
      tool: {
        title: 'Cancel Order',
        description:
          'Cancel an order. Requires confirmation — call once to get a confirmation prompt, then again with the confirmationId.',
      },
      output: {
        path: 'cancelOrder',
      },
      hooks: {
        // Gate destructive mutations: require a confirmation round-trip before executing.
        preprocess: (args) => {
          if (!args['confirmationId']) {
            return {
              needsConfirmation: true,
              message: `Are you sure you want to cancel order "${args['orderId']}"? This cannot be undone. Call again with confirmationId: "confirm-${args['orderId']}" to proceed.`,
              confirmationId: `confirm-${args['orderId']}`,
            };
          }
          // Has confirmationId — continue to GraphQL execution
          return undefined;
        },
      },
    },

    // Tool 6: Context from HTTP headers via preprocess
    // The companyId variable is injected from the x-company-id header,
    // so the MCP client never needs to provide it.
    {
      name: 'get_company',
      source: {
        type: 'inline',
        query: `query GetCompany($companyId: String!) {
          company(companyId: $companyId) { id name plan }
        }`,
      },
      tool: {
        title: 'Company Info',
        description:
          'Get info about the current company (resolved from auth headers)',
      },
      input: {
        schema: {
          properties: {
            companyId: { hidden: true },
          },
        },
      },
      output: { path: 'company' },
      hooks: {
        preprocess(args, { headers }) {
          args.companyId = headers['x-company-id'] || 'default-company-id';
        },
      },
    },

    // Tool 7: @mcpTool directive (auto-registered)
    // Operations with @mcpTool directives in operationsPath are auto-registered.
    // Example in a .graphql file:
    //   query QuickWeather($location: String!) @mcpTool(name: "quick_weather", description: "Quick weather check") { ... }
    //
    // With @mcpDescription to fetch field descriptions from a provider:
    //   query GetWeather($location: String! @mcpDescription(provider: "langfuse:location_desc")) @mcpTool(name: "get_weather") { ... }
    //
    // With @mcpHeader to inject a variable from an HTTP header (hidden from MCP input schema):
    //   query GetData($companyId: String! @mcpHeader(name: "x-company-id")) @mcpTool(name: "get_data") { ... }
    //
    // With Langfuse description provider (format: "type:prompt" or "type:prompt:version"):
    //   query SearchDocs($q: String!) @mcpTool(name: "search_docs", descriptionProvider: "langfuse:search_tool_desc:3") { ... }
    //
    // With meta for opaque metadata passed through to clients as _meta:
    //   query SearchDocs($q: String!) @mcpTool(name: "search_docs", meta: { entitlement: "docs_access", tags: ["read"] }) { ... }
    //   meta supports strings, numbers, booleans, null, arrays, and nested objects.
    //   If a config tool[] entry for the same name also has tool._meta, the two are
    //   shallow merged (config wins on key conflicts).
    //
    // Directive tools can be augmented by adding a matching entry here with the same name.
  ],

  // Resources: read-only context that MCP clients can discover and fetch.
  // Exposed via resources/list (metadata only) and resources/read (content).
  // Content is resolved once at startup, either inline text or loaded from a file.
  resources: [
    // Resource 1: Inline text
    {
      name: 'api-guide',
      uri: 'docs://api-guide',
      title: 'API Guide',
      description: 'How to use the Weather API',
      mimeType: 'text/markdown',
      text: [
        '# Weather API Guide',
        '',
        '## Available Tools',
        '- **get_weather** — current conditions for a city',
        '- **get_forecast** — multi-day forecast',
        '- **get_conditions** — just the conditions string',
        '- **search_docs** — search documentation articles',
        '- **cancel_order** — cancel an order (requires confirmation)',
        '',
        '## Tips',
        '- Use city names (e.g. "London", "New York")',
        '- Forecast defaults to 5 days; pass `days` to customize',
        '- search_docs returns markdown tables for easy display',
      ].join('\n'),
      annotations: { audience: ['assistant'], priority: 0.9 },
    },

    // Resource 2: Loaded from file at startup
    {
      name: 'readme',
      uri: 'docs://readme',
      title: 'Project README',
      description: 'Full project README with setup instructions',
      mimeType: 'text/markdown',
      file: join(__dirname, 'README.md'),
    },
  ],

  // Resource Templates: parameterized resources with dynamic content.
  // Clients discover templates via resources/templates/list, construct URIs
  // from the template, and fetch content via resources/read.
  // The handler receives extracted URI parameters and returns { text } or { blob }.
  resourceTemplates: [
    // Template 1: Dynamic weather data as a resource
    {
      uriTemplate: 'weather://{location}',
      name: 'Weather Data',
      title: 'Weather by Location',
      description: 'Current weather data for any city, served as JSON',
      mimeType: 'application/json',
      handler: async (params) => {
        const location = params['location'] ?? 'unknown';
        const data = weatherData[location.toLowerCase()] || {
          temperature: 70,
          conditions: 'Unknown',
          humidity: 50,
        };
        return { text: JSON.stringify({ location, ...data }, null, 2) };
      },
    },

    // Template 2: Handler can override mimeType per-call
    {
      uriTemplate: 'forecast://{location}/{days}',
      name: 'Forecast',
      description: 'Multi-day forecast as markdown',
      handler: async (params) => {
        const days = parseInt(params['days'] ?? '5', 10) || 5;
        const location = params['location'] ?? 'unknown';
        const lines = [`# ${days}-Day Forecast for ${location}`, ''];
        for (let i = 0; i < days; i++) {
          lines.push(
            `- Day ${i + 1}: ${Math.round(60 + Math.random() * 20)}°F`,
          );
        }
        return { text: lines.join('\n'), mimeType: 'text/markdown' };
      },
    },
  ],
};

const gateway = createGatewayRuntime({
  proxy: {
    endpoint: 'http://localhost:4001/graphql',
  },
  // When using persisted documents, MCP internal dispatches need to bypass the check.
  // The MCP plugin preserves the original /mcp pathname on internal requests,
  // so you can use allowArbitraryDocuments to let them through:
  //
  // persistedDocuments: {
  //   ...yourPersistedDocsConfig,
  //   allowArbitraryDocuments: (request: Request) =>
  //     request.url.includes('/mcp'),
  // },
  plugins: (ctx) => [useMCP(ctx, mcpOptions)],
});

const gatewayServer = createServer(gateway);
gatewayServer.listen(4000, () => {
  console.log('Gateway running at http://localhost:4000/graphql');
  console.log('MCP endpoint at http://localhost:4000/mcp');
  console.log('  Per-request label override: POST /mcp?promptLabel=staging');
});
