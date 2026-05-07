import { createTenv } from '@internal/e2e';
import { stripIgnoredCharacters } from 'graphql';
import { describe, expect, it } from 'vitest';
import { hashSHA256 } from '../../packages/executors/http/src/utils';

const { service, gateway } = createTenv(__dirname);

describe('APQ to the upstream', () => {
  it('works', async () => {
    const gw = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('greetings')],
      },
    });
    const query = stripIgnoredCharacters(/* GraphQL */ `
      {
        hello
      }
    `);
    const sha256Hash = await hashSHA256(query);
    await expect(gw.execute({ query })).resolves.toEqual({
      data: {
        hello: 'world',
      },
    });
    // First it sends the request with query
    expect(gw.getStd('both')).toContain(
      `fetch 1 ${JSON.stringify({
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      })}`,
    );
    // Then it sends the query with the hash
    // In the following requests the query won't be needed
    expect(gw.getStd('both')).toContain(
      `fetch 2 ${JSON.stringify({
        query,
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      })}`,
    );

    await expect(gw.execute({ query })).resolves.toEqual({
      data: {
        hello: 'world',
      },
    });

    // The query is not sent again
    expect(gw.getStd('both')).toContain(
      `fetch 3 ${JSON.stringify({
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      })}`,
    );

    // The query is not sent again
    expect(gw.getStd('both')).not.toContain(
      `fetch 4 ${JSON.stringify({
        query,
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      })}`,
    );
  });

  it('uses GET for hashed APQ queries without adding content-type by default', async () => {
    const gw = await gateway({
      env: {
        USE_GET_FOR_HASHED_QUERIES: 1,
      },
      supergraph: {
        with: 'mesh',
        services: [
          await service('greetings', {
            env: {
              DISABLE_CSRF_PREVENTION: 1,
            },
          }),
        ],
      },
    });
    const query = stripIgnoredCharacters(/* GraphQL */ `
      {
        hello
      }
    `);
    const sha256Hash = await hashSHA256(query);

    await expect(gw.execute({ query })).resolves.toEqual({
      data: {
        hello: 'world',
      },
    });

    expect(gw.getStd('both')).toContain('fetch-meta 1 GET ');
    expect(gw.getStd('both')).not.toContain(
      'fetch-meta 1 GET application/json',
    );
    expect(gw.getStd('both')).toContain(
      `fetch 2 ${JSON.stringify({
        query,
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      })}`,
    );
  });

  it('can opt into content-type for hashed GET APQ requests', async () => {
    const gw = await gateway({
      env: {
        USE_GET_FOR_HASHED_QUERIES: 1,
        USE_CONTENT_TYPE_FOR_GET_REQUESTS: 1,
      },
      supergraph: {
        with: 'mesh',
        services: [await service('greetings')],
      },
    });
    const query = stripIgnoredCharacters(/* GraphQL */ `
      {
        hello
      }
    `);
    const sha256Hash = await hashSHA256(query);

    await expect(gw.execute({ query })).resolves.toEqual({
      data: {
        hello: 'world',
      },
    });

    expect(gw.getStd('both')).toContain('fetch-meta 1 GET application/json');
    expect(gw.getStd('both')).toContain(
      `fetch 2 ${JSON.stringify({
        query,
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash,
          },
        },
      })}`,
    );
  });
});
