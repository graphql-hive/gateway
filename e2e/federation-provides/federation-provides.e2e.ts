import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Federation @provides', () => {
  const { gateway, service } = createTenv(__dirname);

  // This is the exact scenario reported by users: subgraph B declares
  // `@provides(fields: "name description")` on a query field, and the client
  // only asks for `id` and `name`. The gateway should NOT forward
  // `description` to the providing subgraph just because it appears in
  // `@provides`.
  it('only sends @provides fields the client requested', async () => {
    await using serviceA = await service('a');
    await using serviceB = await service('b');
    await using gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [serviceA, serviceB],
      },
    });

    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          entity {
            id
            name
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'B:name',
        },
      },
    });

    // Owner subgraph must NOT be hit - B can fully provide what was requested.
    const ALogs = serviceA.getStd('out');
    expect(ALogs).not.toContain('received query');

    // B must receive a query with `name` (and `id`) but NOT `description`.
    const BLogs = serviceB.getStd('out');
    const BReceivedQueries = BLogs.split('\n').filter((line) =>
      line.includes('received query'),
    );
    expect(BReceivedQueries).toHaveLength(1);
    const BQuery = BReceivedQueries[0]!;
    expect(BQuery).toMatch(/\bname\b/);
    expect(BQuery).toMatch(/\bid\b/);
    expect(BQuery).not.toMatch(/\bdescription\b/);
  });

  it('sends every @provides field that the client did request', async () => {
    await using serviceA = await service('a');
    await using serviceB = await service('b');
    await using gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [serviceA, serviceB],
      },
    });

    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          entity {
            id
            name
            description
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'B:name',
          description: 'B:description',
        },
      },
    });

    const ALogs = serviceA.getStd('out');
    expect(ALogs).not.toContain('received query');

    const BLogs = serviceB.getStd('out');
    const BReceivedQueries = BLogs.split('\n').filter((line) =>
      line.includes('received query'),
    );
    expect(BReceivedQueries).toHaveLength(1);
    expect(BReceivedQueries[0]!).toMatch(/\bname\b/);
    expect(BReceivedQueries[0]!).toMatch(/\bdescription\b/);
  });

  it('falls back to the owning subgraph for non-provided fields', async () => {
    await using serviceA = await service('a');
    await using serviceB = await service('b');
    await using gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [serviceA, serviceB],
      },
    });

    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          entity {
            id
            name
            extra
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        entity: {
          id: '1',
          name: 'B:name',
          extra: 'A:extra',
        },
      },
    });

    // Owner is hit only for `extra`, not for `name`.
    const ALogs = serviceA.getStd('out');
    const AReceivedQueries = ALogs.split('\n').filter((line) =>
      line.includes('received query'),
    );
    expect(AReceivedQueries).toHaveLength(1);
    const AQuery = AReceivedQueries[0]!;
    expect(AQuery).toMatch(/\bextra\b/);
    expect(AQuery).not.toMatch(/(?<!__type)\bname\b/);

    // B is asked for `name` (via @provides), not for `description`.
    const BLogs = serviceB.getStd('out');
    const BReceivedQueries = BLogs.split('\n').filter((line) =>
      line.includes('received query'),
    );
    expect(BReceivedQueries).toHaveLength(1);
    const BQuery = BReceivedQueries[0]!;
    expect(BQuery).toMatch(/\bname\b/);
    expect(BQuery).not.toMatch(/\bdescription\b/);
  });

  // The gateway must keep `@include` / `@skip` directives that wrap a
  // `@provides` field intact when forwarding the query to the providing
  // subgraph. If the wrapper were dropped, the providing subgraph would
  // unconditionally resolve the field, defeating the client's directive.
  it('preserves @skip / @include directives wrapping a @provides field', async () => {
    await using serviceA = await service('a');
    await using serviceB = await service('b');
    await using gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [serviceA, serviceB],
      },
    });

    const skipResult = await gw.execute({
      query: /* GraphQL */ `
        query Q($skipName: Boolean!) {
          entity {
            id
            ... on Entity @skip(if: $skipName) {
              name
            }
          }
        }
      `,
      variables: { skipName: true },
    });

    expect(skipResult).toEqual({ data: { entity: { id: '1' } } });

    const ALogs = serviceA.getStd('out');
    expect(ALogs).not.toContain('received query');

    const BLogs = serviceB.getStd('out');
    const BReceivedQueries = BLogs.split('\n').filter((line) =>
      line.includes('received query'),
    );
    expect(BReceivedQueries).toHaveLength(1);
    const BQuery = BReceivedQueries[0]!;
    // The directive itself must survive the rewrite.
    expect(BQuery).toMatch(/@skip\(\s*if:\s*\$skipName\s*\)/);
    // And the unrequested provides field must still not be forwarded.
    expect(BQuery).not.toMatch(/\bdescription\b/);

    const includeResult = await gw.execute({
      query: /* GraphQL */ `
        query Q($includeName: Boolean!) {
          entity {
            id
            ... on Entity @include(if: $includeName) {
              name
            }
          }
        }
      `,
      variables: { includeName: true },
    });

    expect(includeResult).toEqual({
      data: { entity: { id: '1', name: 'B:name' } },
    });

    const BLogsAfter = serviceB.getStd('out');
    const BReceivedQueriesAfter = BLogsAfter.split('\n').filter((line) =>
      line.includes('received query'),
    );
    expect(BReceivedQueriesAfter).toHaveLength(2);
    const BQueryInclude = BReceivedQueriesAfter[1]!;
    expect(BQueryInclude).toMatch(/@include\(\s*if:\s*\$includeName\s*\)/);
    expect(BQueryInclude).toMatch(/\bname\b/);
    expect(BQueryInclude).not.toMatch(/\bdescription\b/);
  });
});
