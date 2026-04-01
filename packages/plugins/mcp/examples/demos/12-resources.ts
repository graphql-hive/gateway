// Step 12: Serve static resources for AI agent context.
//
// Resources are read-only content that MCP clients can discover (resources/list) and fetch (resources/read).
// They provide background context to AI agents, API guides, changelogs, configuration files, etc.
// Content is resolved once at startup (inline text, file, or base64 blob).
//
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq '.result.capabilities'
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":2,"method":"resources/list","params":{}}' | jq '.result.resources[] | {uri, name, mimeType, size}'
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"docs://api-guide"}}' | jq '.result.contents[0].text'
// curl -s http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"docs://readme"}}' | jq '.result.contents[0].text[:200]'

import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { useMCP } from '@graphql-hive/plugin-mcp';
import { createSchema, createYoga } from 'graphql-yoga';

const exampleDir = dirname(dirname(fileURLToPath(import.meta.url)));

const mcpOptions = {
  name: 'weather-api',
  version: '1.0.0',
  tools: [
    {
      name: 'get_weather',
      source: {
        type: 'inline',
        query: `query GetWeather($location: String!) {
          weather(location: $location) { temperature conditions humidity location }
        }`,
      },
    },
  ],
  // NEW: Static resources
  resources: [
    // Inline text resource
    {
      name: 'api-guide',
      uri: 'docs://api-guide',
      title: 'API Guide',
      description: 'How to use the Weather API',
      mimeType: 'text/markdown',
      text: [
        '# Weather API Guide',
        '',
        '## Tools',
        '- **get_weather** — current conditions for a city',
        '',
        '## Tips',
        '- Use city names like "London", "New York", "Tokyo"',
        '- Unknown cities return default values',
      ].join('\n'),
      // Annotations hint to MCP clients how to use this resource
      annotations: {
        audience: ['assistant'] as ('user' | 'assistant')[],
        priority: 0.9,
      },
    },
    // File-based resource (read at startup)
    {
      name: 'readme',
      uri: 'docs://readme',
      title: 'Project README',
      description: 'Full project README with setup instructions',
      mimeType: 'text/markdown',
      file: join(exampleDir, 'README.md'),
    },
  ],
};

const weatherData: Record<
  string,
  { temperature: number; conditions: string; humidity: number }
> = {
  'new york': { temperature: 72, conditions: 'Partly Cloudy', humidity: 65 },
  london: { temperature: 58, conditions: 'Rainy', humidity: 85 },
  tokyo: { temperature: 68, conditions: 'Sunny', humidity: 55 },
};

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      weather("City name" location: String!): Weather!
    }
    type Weather {
      temperature: Float!
      conditions: String!
      humidity: Int!
      location: String!
    }
  `,
  resolvers: {
    Query: {
      weather: (_: unknown, { location }: { location: string }) => {
        const data = weatherData[location.toLowerCase()] || {
          temperature: 70,
          conditions: 'Unknown',
          humidity: 50,
        };
        return { ...data, location };
      },
    },
  },
});

const subgraphYoga = createYoga({ schema });
const subgraphServer = createServer(subgraphYoga);
subgraphServer.listen(4001, () => {
  console.log('Subgraph running at http://localhost:4001/graphql');
});

const gateway = createGatewayRuntime({
  proxy: { endpoint: 'http://localhost:4001/graphql' },
  plugins: (ctx) => [useMCP(ctx, mcpOptions)],
});

const gatewayServer = createServer(gateway);
gatewayServer.listen(4000, () => {
  console.log('Gateway running at http://localhost:4000/graphql');
  console.log('MCP endpoint at http://localhost:4000/mcp');
});
