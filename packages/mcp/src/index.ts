import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { zodObjectToInputSchema } from './utils';

const mcp = new McpServer(
  {
    name: 'randomer',
    version: '0.0.0',
  },
  {
    capabilities: {
      logging: {},
    },
  },
);

const tool = mcp.registerTool(
  'random-number',
  {
    // done in request handler
  },
  async (ctx) => {
    return {
      content: [
        {
          type: 'text',
          text: Math.random().toString(),
        },
      ],
    };
  },
);

// only if langfuse is active
tool.update({
  description:
    'UPDATED! A tool that generates a random number between 0 and 1.',
});

//

mcp.server.setRequestHandler('tools/list', async (req, ctx) => {
  return {
    tools: [
      {
        name: 'random-number',
        description: 'A tool that generates a random number between 0 and 1.',
        inputSchema: zodObjectToInputSchema(null),
      },
    ],
  };
});
