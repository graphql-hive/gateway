# @graphql-hive/plugin-mcp

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) plugin for [Hive Gateway](https://the-guild.dev/graphql/hive/docs/gateway). Exposes your GraphQL API as MCP tools, resources, and resource templates that AI agents can discover and execute.

## How it works

The plugin turns your Hive Gateway into an MCP server. It maps GraphQL operations to MCP tools, so AI agents can discover and call your API through the standard MCP protocol.

```
AI Agent  --MCP JSON-RPC-->  /mcp endpoint  --GraphQL-->  your subgraphs
```

The gateway handles schema loading, input/output schema generation, argument validation, and response formatting. You define which operations to expose as tools, and the plugin does the rest.

Supported MCP methods: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `resources/templates/list`.

## Install

Requires Node.js >= 20 and `graphql` as a peer dependency.

```bash
npm install @graphql-hive/gateway-runtime @graphql-hive/plugin-mcp graphql
```

Both CommonJS and ESM are supported. [Langfuse](https://langfuse.com/) is an optional peer dependency, only needed if you use the built-in Langfuse description provider.

## Quick Start

### Programmatic

```typescript
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { useMCP } from '@graphql-hive/plugin-mcp';

const gateway = createGatewayRuntime({
  supergraph: 'supergraph.graphql',
  plugins: (ctx) => [
    useMCP(ctx, {
      name: 'my-api',
      tools: [
        {
          name: 'get_users',
          source: {
            type: 'inline',
            query: `query($limit: Int) { users(limit: $limit) { id name } }`,
          },
        },
      ],
    }),
  ],
});
```

### Directive-based

Define tools directly in your `.graphql` operation files using `@mcpTool`, `@mcpDescription`, and `@mcpHeader` directives:

```graphql
query GetWeather($location: String!)
@mcpTool(name: "get_weather", description: "Get current weather") {
  weather(location: $location) {
    temperature
    conditions
  }
}
```

Point the plugin to your operations directory:

```typescript
useMCP(ctx, {
  name: 'my-api',
  operationsPath: './operations',
});
```

All operations with `@mcpTool` are auto-registered as tools. Operations without the directive are available as sources for explicit tool configs via `source.type: 'graphql'`. Note that all operations must be named (anonymous operations are not supported).

`@mcpDescription` can also be placed on selection fields to add descriptions to the output schema:

```graphql
query GetForecast($location: String!, $days: Int)
@mcpTool(name: "get_forecast", description: "Weather forecast") {
  forecast(location: $location, days: $days) {
    date
    high
    low
    conditions @mcpDescription(provider: "langfuse:conditions_desc")
  }
}
```

`@mcpHeader` injects a variable from an HTTP header instead of exposing it in the tool's input schema. This is useful for auth context like company or user IDs that come from request headers rather than the LLM:

```graphql
query GetCompanyData($companyId: String! @mcpHeader(name: "x-company-id"))
@mcpTool(name: "get_company_data") {
  company(companyId: $companyId) {
    id
    name
    plan
  }
}
```

The `companyId` variable is hidden from `tools/list` and automatically populated from the `x-company-id` header on each `tools/call` request. If the header is missing, the tool returns an error.

For cases where you need more control (e.g. transforming the header value or falling back to a default), use `hidden: true` with a `preprocess` hook instead:

```typescript
{
  name: 'get_company_data',
  source: { type: 'inline', query: `query($companyId: String!) { ... }` },
  input: { schema: { properties: { companyId: { hidden: true } } } },
  hooks: {
    preprocess(args, { headers }) {
      args.companyId = headers['x-company-id'] || 'default-company';
    },
  },
}
```

To override which `.graphql` file a specific tool loads from (instead of using the global `operationsPath`), use `source.file`:

```typescript
{
  name: 'get_weather',
  source: {
    type: 'graphql',
    operationName: 'GetWeather',
    operationType: 'query',
    file: './custom-operations/weather.graphql',
  },
}
```

### YAML / JSON config

You can also define tools in a YAML or JSON file:

```yaml
# mcp.yaml
name: weather-api
version: 1.0.0

tools:
  - name: get_weather
    source:
      type: inline
      query: |
        query GetWeather($location: String!) {
          weather(location: $location) {
            temperature
            conditions
          }
        }
    tool:
      title: Current Weather
```

### Test it

```bash
# List tools
curl http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call a tool
curl http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_weather","arguments":{"location":"London"}}}'
```

## Tool configuration

A complete tool definition with all available options:

```typescript
{
  name: 'cancel_order',
  source: {
    type: 'inline',
    query: `mutation($orderId: String!, $confirmationId: String) {
      cancelOrder(orderId: $orderId, confirmationId: $confirmationId) { success message }
    }`,
  },
  tool: {
    title: 'Cancel Order',
    description: 'Cancel a pending order by ID',
    annotations: { destructiveHint: true, idempotentHint: false },
    execution: { taskSupport: 'optional' },
  },
  input: {
    schema: {
      properties: {
        orderId: { description: 'The order ID to cancel', examples: ['ORD-123'] },
        confirmationId: { alias: 'confirm', description: 'Confirmation code' },
      },
    },
  },
  output: {
    path: 'cancelOrder',
    contentAnnotations: { audience: ['user'], priority: 0.9 },
  },
  hooks: {
    preprocess: (args, context) => {
      if (!args['confirm']) return { error: 'Confirmation required' };
      return undefined;
    },
  },
}
```

All fields except `name` and `source` are optional.

## Input overrides

Rename arguments with aliases and add per-field descriptions:

```typescript
{
  name: 'get_weather',
  source: {
    type: 'inline',
    query: `query($location: String!) { weather(location: $location) { temperature } }`,
  },
  input: {
    schema: {
      properties: {
        location: {
          alias: 'city',
          description: 'City name to check weather for',
          examples: ['London', 'New York'],
          default: 'London',
        },
      },
    },
  },
}
```

Agents see `city` as the input parameter with the provided examples and default. The plugin maps it back to `location` when executing the query.

## Output extraction

Use `output.path` to return a subset of the GraphQL response instead of the full object:

```typescript
{
  name: 'search_cities',
  source: {
    type: 'inline',
    query: `query($query: String!) { cities(query: $query) { name country population } }`,
  },
  output: { path: 'cities' },
}
```

Without `output.path`, the agent receives `{ cities: [{ name: "London", ... }] }`. With `path: 'cities'`, it receives `[{ name: "London", ... }]` directly. The output schema in `tools/list` is narrowed to match.

Additional output options:

- `output.schema: false` suppresses the outputSchema for a specific tool (vs `suppressOutputSchema` which is global). Output schemas are also automatically suppressed when hooks are configured, since hooks may change the response shape.
- `output.descriptionProviders` adds dynamic descriptions to output fields, keyed by dot-notation path:

```typescript
output: {
  descriptionProviders: {
    'forecast.conditions': { type: 'langfuse', prompt: 'conditions_desc' },
  },
}
```

## Hooks

### Preprocess

Transform arguments or short-circuit execution before the GraphQL query runs:

```typescript
{
  name: 'gated_action',
  source: { type: 'inline', query: '...' },
  hooks: {
    preprocess: (args, context) => {
      // context: { toolName, headers, query }
      if (!args['_confirmed']) {
        return { needsConfirmation: true };
      }
      return undefined; // proceed with execution
    },
  },
}
```

### Postprocess

Transform the GraphQL result before returning it to the agent:

```typescript
{
  name: 'formatted_weather',
  source: { type: 'inline', query: '...' },
  hooks: {
    postprocess: (result, args, context) => {
      // context: { toolName, headers, query }
      const data = result as { weather: { temperature: number; conditions: string } };
      return `${data.weather.temperature}F and ${data.weather.conditions}`;
    },
  },
}
```

When postprocess returns a string, the result is sent as text content instead of structured content.

Both hooks receive a context object with `toolName` (the MCP tool name), `headers` (request headers from the agent), and `query` (the resolved GraphQL query string).

## Resources

Serve static content or dynamic data as MCP resources alongside your tools:

```typescript
useMCP(ctx, {
  name: 'my-api',
  resources: [
    {
      name: 'api-guide',
      uri: 'docs://api-guide',
      mimeType: 'text/markdown',
      text: '# API Guide\n\nUse get_users to fetch user data.',
    },
  ],
  resourceTemplates: [
    {
      uriTemplate: 'users://{id}',
      name: 'User Profile',
      description: 'Get a user profile by ID',
      mimeType: 'application/json',
      handler: async (params) => ({
        text: JSON.stringify({ id: params['id'], source: 'gateway' }),
      }),
    },
  ],
});
```

Resources support three content sources: `text` (inline string), `blob` (inline base64), or `file` (read from disk at startup):

```typescript
resources: [
  { name: 'guide', uri: 'docs://guide', text: '# Guide\n...' },
  {
    name: 'icon',
    uri: 'files://icon.png',
    mimeType: 'image/png',
    blob: 'iVBOR...',
  },
  { name: 'schema', uri: 'files://schema.graphql', file: './schema.graphql' },
];
```

Agents discover resources via `resources/list` and fetch them with `resources/read`. Templates allow dynamic URIs with parameters.

## Hive integration

Fetch operations directly from [Hive App Deployments](https://the-guild.dev/graphql/hive/docs/management/app-deployments). Operations with `@mcpTool` directives are auto-registered as tools, and the plugin polls for updates.

```typescript
useMCP(ctx, {
  name: 'my-api',
  hive: {
    token: process.env['HIVE_REGISTRY_TOKEN']!,
    target: 'my-org/my-project/production',
    appName: 'my-mcp-app',
    // appVersion: '1.0.0',    // pin to a specific version (omit for latest active)
    // pollIntervalMs: 60_000, // how often to check for new deployments (default: 60s)
  },
});
```

This means you can manage your MCP tools from Hive's UI and deploy new operations without restarting the gateway.

## Langfuse integration

The plugin has built-in support for [Langfuse](https://langfuse.com/) as a description provider. Tool and field descriptions are fetched from Langfuse prompts at startup and can be refreshed at runtime.

```bash
npm install @langfuse/client
```

Set your Langfuse credentials:

```bash
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Register the provider and reference it from tools:

```typescript
useMCP(ctx, {
  name: 'my-api',
  providers: {
    langfuse: {
      defaults: { label: 'production' },
    },
  },
  tools: [
    {
      name: 'get_weather',
      source: { type: 'inline', query: '...' },
      tool: {
        descriptionProvider: {
          type: 'langfuse',
          prompt: 'get_weather_description',
        },
      },
    },
  ],
});
```

You can also use `@mcpDescription` directives in `.graphql` files to reference providers:

```graphql
query GetWeather(
  $location: String! @mcpDescription(provider: "langfuse:location_field_desc")
) @mcpTool(name: "get_weather") {
  weather(location: $location) {
    temperature
    conditions
  }
}
```

You can override the Langfuse prompt label per request by adding a `?promptLabel=` query parameter to the MCP endpoint:

```bash
curl http://localhost:4000/mcp?promptLabel=staging \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Label precedence: per-request `?promptLabel=` > per-tool `options.label` > provider `defaults.label`.

> **Version vs label:** Langfuse treats `version` and `label` as mutually exclusive. When a tool specifies an explicit `version`, the plugin strips any label before calling Langfuse. A pinned version is an intentional contract ("use exactly this prompt version"), while a label is environment-level routing ("use whatever is tagged `production`"). Specificity wins.

To use a custom provider instead of Langfuse, pass any object with a `fetchDescription` method:

```typescript
providers: {
  myProvider: {
    fetchDescription: async (toolName, config) => {
      return `Description for ${toolName}`;
    },
  },
},
```

### Description precedence

When multiple sources define a description for a tool, the highest priority wins:

1. `descriptionProvider` (resolved at runtime from Langfuse or custom provider)
2. `tool.description` (explicit config)
3. `@mcpTool(description: "...")` directive
4. GraphQL schema description

The same precedence applies to per-field descriptions via `input.schema.properties.<field>.descriptionProvider`.

## Configuration reference

| Option                 | Type                          | Default        | Description                                                     |
| ---------------------- | ----------------------------- | -------------- | --------------------------------------------------------------- |
| `name`                 | `string`                      | (required)     | Server name in `initialize` responses                           |
| `version`              | `string`                      | `"1.0.0"`      | Server version                                                  |
| `title`                | `string`                      |                | Human-readable server title                                     |
| `description`          | `string`                      |                | Human-readable server description                               |
| `icons`                | `MCPIcon[]`                   |                | Server icons for client UIs                                     |
| `websiteUrl`           | `string`                      |                | Server website URL                                              |
| `path`                 | `string`                      | `"/mcp"`       | HTTP path for the MCP endpoint                                  |
| `operationsPath`       | `string`                      |                | Path to `.graphql` file(s) containing operations                |
| `operationsStr`        | `string`                      |                | Raw GraphQL operations string (alternative to file)             |
| `tools`                | `MCPToolConfig[]`             | `[]`           | Tool definitions                                                |
| `resources`            | `MCPResourceConfig[]`         | `[]`           | Static resource definitions                                     |
| `resourceTemplates`    | `MCPResourceTemplateConfig[]` | `[]`           | Dynamic resource templates                                      |
| `providers`            | `object`                      |                | Description provider instances (e.g. `{ langfuse: {} }`)        |
| `suppressOutputSchema` | `boolean`                     | `false`        | Suppress outputSchema in `tools/list`                           |
| `hive`                 | `MCPHiveConfig`               |                | Auto-fetch operations from Hive App Deployments                 |
| `instructions`         | `string`                      |                | Free-text instructions included in `initialize` for LLM context |
| `protocolVersion`      | `string`                      | `"2025-11-25"` | MCP protocol version to advertise                               |

## Features

- **Tool sources**: inline queries, file-based operations (`operationsPath`), or auto-registered via `@mcpTool` directives
- **Input overrides**: aliases, descriptions, description providers, and `hidden` per field
- **Header injection**: `@mcpHeader` directive to inject variables from HTTP headers (hidden from input schema)
- **Output extraction**: `output.path` to return a subset of the GraphQL response
- **Hooks**: `preprocess` (short-circuit or transform args) and `postprocess` (transform results)
- **Description providers**: resolve tool/field descriptions dynamically (built-in [Langfuse](https://langfuse.com/) support, or bring your own)
- **Resources**: static text or binary content served via `resources/read`
- **Resource templates**: dynamic URI-based resources with custom handlers
- **Annotations**: tool hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and content annotations (`audience`, `priority`)
- **Task support**: per-tool `execution.taskSupport` (`'forbidden'`, `'optional'`, `'required'`) for long-running operations
- **Hive integration**: auto-fetch operations from Hive App Deployments

## Examples

See [`examples/`](./examples/) for runnable demos covering all features.

## Development

```bash
# Unit/integration tests
npx vitest run packages/plugins/mcp/tests/

# E2E tests
npx vitest run e2e/mcp-plugin/
```

## License

MIT
