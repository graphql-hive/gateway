import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Progressive Override', () => {
  const { gateway, service, composeWithApollo } = createTenv(__dirname);
  it('composes as expected', async () => {
    await using serviceA = await service('a');
    await using serviceB = await service('b');
    const supergraph = await composeWithApollo({
      services: [serviceA, serviceB],
      maskServicePorts: true,
    });
    expect(supergraph.result).toMatchSnapshot();
  });
  it('progressive_override_label_test', async () => {
    const query = /* GraphQL */ `
      query {
        feed {
          id
        }
      }
    `;
    {
      await using serviceA = await service('a');
      await using serviceB = await service('b');
      await using gw = await gateway({
        supergraph: {
          with: 'apollo',
          services: [serviceA, serviceB],
        },
        env: {
          // @override(label: "feed_in_b")
          OVERRIDE_LABELS: 'feed_in_b',
        },
      });
      const result = await gw.execute({ query });
      expect(result).toEqual({
        data: {
          feed: [{ id: 'b-1' }, { id: 'b-2' }, { id: 'b-3' }],
        },
      });

      // No request in A
      const ALogs = serviceA.getStd('out');
      expect(ALogs).not.toContain('received query');

      // Request in B
      const BLogs = serviceB.getStd('out');
      expect(BLogs).toContain('received query');
    }
    {
      await using serviceA = await service('a');
      await using serviceB = await service('b');
      await using gw = await gateway({
        supergraph: {
          with: 'apollo',
          services: [serviceA, serviceB],
        },
        env: {
          // @override(label: "feed_in_b")
          OVERRIDE_LABELS: 'different_flag',
        },
      });
      const result = await gw.execute({ query });
      expect(result).toEqual({
        data: {
          feed: [{ id: 'a-1' }, { id: 'a-2' }, { id: 'a-3' }],
        },
      });

      // Request in A
      const ALogs = serviceA.getStd('out');
      expect(ALogs).toContain('received query');

      // No request in B
      const BLogs = serviceB.getStd('out');
      expect(BLogs).not.toContain('received query');
    }
  });
  it('progressive_override_percentage_test', async () => {
    const query = /* GraphQL */ `
      query {
        aFeed {
          createdAt
        }
        bFeed {
          createdAt
        }
      }
    `;

    {
      await using serviceA = await service('a');
      await using serviceB = await service('b');
      await using gw = await gateway({
        supergraph: {
          with: 'apollo',
          services: [serviceA, serviceB],
        },
        env: {
          // @override(label: "percentage(75)")
          PROGRESSIVE_OVERRIDE_RNG: '0.5',
        },
      });

      const result = await gw.execute({ query });
      expect(result).toEqual({
        data: {
          aFeed: [
            { createdAt: 'from-b:a-1' },
            { createdAt: 'from-b:a-2' },
            { createdAt: 'from-b:a-3' },
          ],
          bFeed: [
            { createdAt: 'from-b:b-1' },
            { createdAt: 'from-b:b-2' },
            { createdAt: 'from-b:b-3' },
          ],
        },
      });

      const ALogs = serviceA.getStd('out');
      const AReceivedQueries = ALogs.split('\n').filter((line) =>
        line.includes('received query'),
      );
      expect(AReceivedQueries).toMatchInlineSnapshot(`
              [
                "[service-a] received query: {aFeed{__typename id}}",
              ]
            `);
      const BLogs = serviceB.getStd('out');
      const BReceivedQueries = BLogs.split('\n').filter((line) =>
        line.includes('received query'),
      );
      expect(BReceivedQueries).toMatchInlineSnapshot(`
              [
                "[service-b] received query: {bFeed{__typename createdAt id}}",
                "[service-b] received query: query($representations:[_Any!]!){_entities(representations:$representations){__typename ...on Post{createdAt id}}}",
              ]
            `);
    }

    {
      await using serviceA = await service('a');
      await using serviceB = await service('b');
      await using gw = await gateway({
        supergraph: {
          with: 'apollo',
          services: [serviceA, serviceB],
        },
        env: {
          // @override(label: "percentage(75)")
          PROGRESSIVE_OVERRIDE_RNG: '0.9',
        },
      });

      const result = await gw.execute({ query });
      expect(result).toEqual({
        data: {
          aFeed: [
            { createdAt: 'from-a:a-1' },
            { createdAt: 'from-a:a-2' },
            { createdAt: 'from-a:a-3' },
          ],
          bFeed: [
            { createdAt: 'from-a:b-1' },
            { createdAt: 'from-a:b-2' },
            { createdAt: 'from-a:b-3' },
          ],
        },
      });

      const ALogs = serviceA.getStd('out');
      const AReceivedQueries = ALogs.split('\n').filter((line) =>
        line.includes('received query'),
      );
      expect(AReceivedQueries).toMatchInlineSnapshot(`
              [
                "[service-a] received query: {aFeed{__typename createdAt id}}",
                "[service-a] received query: query($representations:[_Any!]!){_entities(representations:$representations){__typename ...on Post{createdAt id}}}",
              ]
            `);
      const BLogs = serviceB.getStd('out');
      const BReceivedQueries = BLogs.split('\n').filter((line) =>
        line.includes('received query'),
      );
      expect(BReceivedQueries).toMatchInlineSnapshot(`
              [
                "[service-b] received query: {bFeed{__typename id}}",
              ]
            `);
    }
  });
});
