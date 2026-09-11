import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeFetch, isDebug } from '@internal/testing';
import { describe, expect, it, vi } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';

async function writeFixture(files: Record<string, string>): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'hive-gateway-dev-fetcher-'));
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(cwd, name), contents, 'utf8');
  }
  return cwd;
}

describe('Hive dev fetcher supergraph source', () => {
  it('composes a supergraph locally from file-based subgraphs', async () => {
    const cwd = await writeFixture({
      'products.graphql': /* GraphQL */ `
        type Query {
          product(id: ID!): Product
        }
        type Product {
          id: ID!
          name: String!
        }
      `,
      'reviews.graphql': /* GraphQL */ `
        type Query {
          review(id: ID!): Review
        }
        type Review {
          id: ID!
          body: String!
        }
      `,
    });

    await using gateway = createGatewayRuntime({
      cwd,
      supergraph: {
        type: 'dev',
        services: [
          {
            name: 'products',
            url: 'http://products.localhost/graphql',
            source: 'file',
            schema: 'products.graphql',
          },
          {
            name: 'reviews',
            url: 'http://reviews.localhost/graphql',
            source: 'file',
            schema: 'reviews.graphql',
          },
        ],
      },
      logging: isDebug(),
    });

    await expect(
      executeFetch(gateway, {
        query: /* GraphQL */ `
          query {
            __schema {
              queryType {
                fields {
                  name
                }
              }
            }
          }
        `,
      }),
    ).resolves.toEqual({
      data: {
        __schema: {
          queryType: {
            fields: expect.arrayContaining([
              { name: 'product' },
              { name: 'review' },
            ]),
          },
        },
      },
    });
  });

  it('composes a supergraph remotely via the Hive registry', async () => {
    const cwd = await writeFixture({
      'products.graphql': /* GraphQL */ `
        type Query {
          product(id: ID!): Product
        }
        type Product {
          id: ID!
          name: String!
        }
      `,
    });

    const registry = 'http://registry.localhost/graphql';
    const registryFetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data: {
              schemaCompose: {
                __typename: 'SchemaComposeSuccess',
                valid: true,
                compositionResult: {
                  supergraphSdl: /* GraphQL */ `
                    type Query {
                      remoteField: String
                    }
                  `,
                },
              },
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );

    await using gateway = createGatewayRuntime({
      cwd,
      supergraph: {
        type: 'dev',
        services: [
          {
            name: 'products',
            url: 'http://products.localhost/graphql',
            source: 'file',
            schema: 'products.graphql',
          },
        ],
        remote: true,
        registry,
        token: 'secret-token',
        target: { byId: 'target-id' },
      },
      plugins: () => [
        {
          onFetch({ url, setFetchFn }) {
            if (url === registry) {
              setFetchFn(registryFetch);
            }
          },
        },
      ],
      logging: isDebug(),
    });

    await expect(
      executeFetch(gateway, {
        query: /* GraphQL */ `
          query {
            remoteField
          }
        `,
      }),
    ).resolves.toEqual({ data: { remoteField: null } });

    expect(registryFetch).toHaveBeenCalledTimes(1);
    const [, init] = registryFetch.mock.calls[0]!;
    expect((init as RequestInit).headers).toEqual(
      expect.objectContaining({ authorization: 'Bearer secret-token' }),
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.variables.input.target).toEqual({ byId: 'target-id' });
    expect(body.variables.input.services).toEqual([
      expect.objectContaining({ name: 'products' }),
    ]);
  });

  it('fails to load the schema when a subgraph file does not exist', async () => {
    const cwd = await writeFixture({});

    await using gateway = createGatewayRuntime({
      cwd,
      supergraph: {
        type: 'dev',
        services: [
          {
            name: 'products',
            url: 'http://products.localhost/graphql',
            source: 'file',
            schema: 'missing.graphql',
          },
        ],
      },
      logging: isDebug(),
    });

    await expect(gateway.getSchema()).rejects.toThrow(/ENOENT/);
  });
});
