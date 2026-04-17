# MCP Example

This example demonstrates the MCP (Model Context Protocol) plugin for Hive Gateway, which exposes GraphQL operations as tools that AI agents can discover and execute.

## Examples

| Script     | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| `basic.ts` | Programmatic config with operation files and `@mcpTool` directives |
| `full.ts`  | All features: Langfuse, hooks, resources, templates, directives    |

Both examples start a mock weather subgraph on `:4001` and a gateway with MCP on `:4000`.

---

## basic.ts — Programmatic Configuration

```bash
npx tsx packages/plugins/mcp/examples/basic.ts
```

This example demonstrates:

- **Inline queries** with `source.type: 'inline'` (query string directly in config)
- **File-based operations** via `operationsPath` + `source.type: 'graphql'` (reference by name)
- **Auto-registration** from `@mcpTool` directives in `.graphql` files
- Tool metadata overrides (`title`, `description`)
- Field-level input schema overrides

```typescript
const gateway = createGatewayRuntime({
  proxy: { endpoint: 'http://localhost:4001/graphql' },
  plugins: (ctx) => [
    useMCP(ctx, {
      name: 'weather-api',
      version: '1.0.0',
      path: '/mcp',
      // .graphql files containing named operations and @mcpTool directives
      operationsPath: './operations/weather.graphql',
      tools: [
        // File-based source: references a named operation from operationsPath
        {
          name: 'get_weather',
          source: {
            type: 'graphql',
            operationName: 'GetWeather',
            operationType: 'query',
          },
          tool: {
            title: 'Current Weather',
            description: 'Get the current weather for a city',
          },
          input: {
            schema: {
              properties: {
                location: {
                  description: 'City name, e.g. "New York", "London", "Tokyo"',
                },
              },
            },
          },
        },
        // File-based source: no overrides, description auto-derived from GraphQL schema
        {
          name: 'get_forecast',
          source: {
            type: 'graphql',
            operationName: 'GetForecast',
            operationType: 'query',
          },
        },
        // Inline source: query defined directly in config (no operations file needed)
        {
          name: 'get_conditions',
          source: {
            type: 'inline',
            query: `query GetConditions($location: String!) {
            weather(location: $location) { conditions }
          }`,
          },
          tool: {
            title: 'Weather Conditions',
            description: 'Get just the weather conditions for a city',
          },
        },
      ],
    }),
  ],
});
```

The `operations/weather.graphql` file also contains a `@mcpTool` directive-based tool that auto-registers without a `tools[]` entry:

```graphql
query QuickWeather($location: String!)
@mcpTool(name: "quick_weather", description: "Quick weather check") {
  weather(location: $location) {
    temperature
    conditions
  }
}
```

### Test

```bash
# List available tools (get_weather, get_forecast, get_conditions, quick_weather)
curl -s http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[] | {name, description}'

# Get weather for a city
curl -s http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_weather","arguments":{"location":"New York"}}}' | jq

# Get 3-day forecast
curl -s http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_forecast","arguments":{"location":"Tokyo","days":3}}}' | jq
```

---

## full.ts — Full Feature Demo

This example loads MCP configuration from `mcp.yaml` and uses [Langfuse](https://langfuse.com) as an external description provider. Tool descriptions are fetched from Langfuse prompts at request time, so you can update them without restarting the server.

### Prerequisites

1. **Install the Langfuse package:**

   ```bash
   npm install @langfuse/client
   ```

2. **Set environment variables:**

   ```bash
   export LANGFUSE_SECRET_KEY=sk-lf-...
   export LANGFUSE_PUBLIC_KEY=pk-lf-...
   export LANGFUSE_BASE_URL=https://cloud.langfuse.com
   ```

3. **Create two text prompts in your Langfuse dashboard:**

   | Prompt name                | Example content                                                                                              |
   | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
   | `get_weather_description`  | `Get current weather conditions including temperature, humidity, and sky conditions for any city worldwide.` |
   | `get_forecast_description` | `Get a multi-day weather forecast with daily high/low temperatures and expected conditions.`                 |

### Run

```bash
npx tsx packages/plugins/mcp/examples/full.ts
```

### How it works

The `mcp.yaml` config defines tools with inline queries and links each to a Langfuse prompt:

```yaml
name: weather-api
version: 1.0.0
tools:
  - name: get_weather
    source:
      type: inline
      query: |
        query GetWeather($location: String!) {
          weather(location: $location) { temperature conditions humidity location }
        }
    tool:
      title: Current Weather
      descriptionProvider:
        type: langfuse
        prompt: get_weather_description

providers:
  langfuse: {} # auto-instantiated from env vars
```

- `providers: { langfuse: {} }` — the Langfuse client is auto-instantiated using `LANGFUSE_*` env vars
- `descriptionProvider.prompt` — maps each tool to a Langfuse prompt by name
- Descriptions are resolved on every `tools/list` request — update a prompt in Langfuse and it takes effect immediately
- If Langfuse is unavailable, tools are still returned with their fallback descriptions (graceful degradation)

### Test

```bash
# List tools — descriptions come from Langfuse prompts
curl -s http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[] | {name, description}'

# Call a tool
curl -s http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_weather","arguments":{"location":"Tokyo"}}}' | jq
```

### Custom providers

You can mix YAML config with programmatic custom providers:

```typescript
import type { DescriptionProvider } from '@graphql-hive/plugin-mcp';

const myProvider: DescriptionProvider = {
  async fetchDescription(toolName, config) {
    return fetch(`https://my-cms.com/api/${config.prompt}`).then((r) =>
      r.text(),
    );
  },
};

useMCP(ctx, {
  ...yamlConfig, // note: yaml loading logic not shown here for demonstration purposes
  providers: { ...yamlConfig.providers, custom: myProvider },
});
```
