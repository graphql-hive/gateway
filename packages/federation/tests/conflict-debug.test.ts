import { createRouter } from '@graphql-hive/federation-gateway-audit';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import {
  ExecutionResult,
} from '@graphql-tools/utils';
import { beforeAll, describe, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

describe('Debug requires-with-argument-conflict', () => {
  const auditRouter = createRouter();
  let supergraphSdl: string;
  let tests: any[];

  beforeAll(async () => {
    const supergraphsRes = await auditRouter.fetch('http://localhost/supergraphs');
    const supergraphPaths: string[] = await supergraphsRes.json();
    const supergraphPath = supergraphPaths.find(p => p.includes('requires-with-argument-conflict'));
    if (!supergraphPath) throw new Error('Test suite not found');
    
    const supergraphRes = await auditRouter.fetch(supergraphPath);
    supergraphSdl = await supergraphRes.text();
    
    const testsRes = await auditRouter.fetch(supergraphPath.replace('/supergraph', '/tests'));
    tests = await testsRes.json();
  });

  it('debug - intercept entity calls', async () => {
    const interceptedRequests: Array<{ url: string; body: string }> = [];
    
    const instrumentedFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('/a') && init?.body) {
        interceptedRequests.push({ url: urlStr, body: init.body as string });
      }
      return auditRouter.fetch(url as any, init as any);
    };
    
    const runtime = createGatewayRuntime({
      logging: false,
      maskedErrors: false,
      supergraph: supergraphSdl,
      plugins: () => [useCustomFetch(instrumentedFetch as any)],
    });
    
    const response = await runtime.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: tests[0].query }),
    });
    const result: ExecutionResult = await response.json();
    
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('\nEntity calls to subgraph A:');
    for (const req of interceptedRequests) {
      console.log('URL:', req.url);
      try {
        const body = JSON.parse(req.body);
        console.log('Query:', body.query);
        console.log('Variables:', JSON.stringify(body.variables, null, 2));
      } catch {
        console.log('Body:', req.body);
      }
    }
  });
});
