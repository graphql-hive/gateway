import {
  getMultipartContentType,
  INCREMENTAL_DELIVERY_SPECS,
} from '@graphql-tools/utils';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

describe('buildHTTPExecutor incrementalSpec Accept', () => {
  it('defaults to bare multipart/mixed (no forced spec) for upstream', async () => {
    let accept: string | null = null;
    await using executor = buildHTTPExecutor({
      endpoint: 'http://localhost/graphql',
      fetch: async (_url, init) => {
        accept = new Headers(init?.headers).get('accept');
        return new Response(JSON.stringify({ data: { hello: 'world' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await executor({
      document: parse(`query { hello }`),
    });
    expect(accept).toContain(getMultipartContentType());
    expect(accept).not.toContain('deferSpec=');
    expect(accept).not.toContain('incrementalSpec=');
  });

  it('sends v0.2 Accept when incrementalSpec is set on the request', async () => {
    let accept: string | null = null;
    await using executor = buildHTTPExecutor({
      endpoint: 'http://localhost/graphql',
      fetch: async (_url, init) => {
        accept = new Headers(init?.headers).get('accept');
        return new Response(JSON.stringify({ data: { hello: 'world' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await executor({
      document: parse(`query { hello }`),
      incrementalSpec: 'v0.2',
    });
    expect(accept).toContain(
      getMultipartContentType(
        INCREMENTAL_DELIVERY_SPECS.find((s) => s.id === 'v0.2')!,
        { echoSpec: true },
      ),
    );
    expect(accept).toContain('incrementalSpec=v0.2');
  });

  it('honors buildHTTPExecutor({ incrementalSpec }) when forcing a format', async () => {
    let accept: string | null = null;
    await using executor = buildHTTPExecutor({
      endpoint: 'http://localhost/graphql',
      incrementalSpec: 'v0.2',
      fetch: async (_url, init) => {
        accept = new Headers(init?.headers).get('accept');
        return new Response(JSON.stringify({ data: { hello: 'world' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await executor({
      document: parse(`query { hello }`),
    });
    expect(accept).toContain('incrementalSpec=v0.2');
  });

  it('can force v0.1 (deferSpec=20220824) when stitching needs path/label patches', async () => {
    let accept: string | null = null;
    await using executor = buildHTTPExecutor({
      endpoint: 'http://localhost/graphql',
      incrementalSpec: 'v0.1',
      fetch: async (_url, init) => {
        accept = new Headers(init?.headers).get('accept');
        return new Response(JSON.stringify({ data: { hello: 'world' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    await executor({
      document: parse(`query { hello }`),
    });
    expect(accept).toContain('deferSpec=20220824');
  });
});
