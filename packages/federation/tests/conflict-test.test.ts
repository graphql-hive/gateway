import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createRouter } from '@graphql-hive/federation-gateway-audit';
import {
  createGatewayRuntime,
  GatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import {
  ExecutionResult,
} from '@graphql-tools/utils';
import {
  buildSchema,
  GraphQLSchema,
  printSchema,
} from 'graphql';
import { beforeAll, describe, expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from './packages/federation/src/supergraph';

describe('Requires-with-argument-conflict only', () => {
  const auditRouter = createRouter();
  const supergraphName = 'requires-with-argument-conflict';
  type SupergraphTestDefinition = { query: string; expected: any }[];
  let supergraphSdl: string;
  let tests: SupergraphTestDefinition;
  let gatewayRuntime: GatewayRuntime;

  beforeAll(async () => {
    const supergraphsRes = await auditRouter.fetch('http://localhost/supergraphs');
    const supergraphPaths: string[] = await supergraphsRes.json();
    const supergraphPath = supergraphPaths.find(p => p.includes('requires-with-argument-conflict'));
    if (!supergraphPath) throw new Error('Test suite not found');
    
    const supergraphRes = await auditRouter.fetch(supergraphPath);
    supergraphSdl = await supergraphRes.text();
    
    const testsRes = await auditRouter.fetch(supergraphPath.replace('/supergraph', '/tests'));
    tests = await testsRes.json();
    
    console.log('SDL:', supergraphSdl);
    
    gatewayRuntime = createGatewayRuntime({
      logging: false,
      maskedErrors: false,
      supergraph: supergraphSdl,
      plugins: () => [useCustomFetch(auditRouter.fetch)],
    });
  });

  it('test-query-0', async () => {
    const test = tests[0];
    const response = await gatewayRuntime.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: test.query }),
    });
    const result: ExecutionResult = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('Expected:', JSON.stringify(test.expected, null, 2));
    result.errors?.forEach(err => console.error('Error:', err));
    const received = { data: result.data ?? null, errors: !!result.errors?.length };
    const expected = { data: test.expected.data ?? null, errors: test.expected.errors ?? false };
    expect(received).toEqual(expected);
  });
});
