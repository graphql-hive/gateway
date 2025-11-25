import { createHmac } from 'node:crypto';
import { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import {
  createGatewayTester,
  GatewayTesterConfig,
  GatewayTesterRemoteSchemaConfigYoga,
} from '@graphql-hive/gateway-testing';
import { stripIgnoredCharacters } from 'graphql';
import { createSchema, type Plugin } from 'graphql-yoga';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import {
  defaultParamsSerializer,
  useHmacSignatureValidation,
} from '../src/index';

const upstreamSchema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      hello: String
    }
  `,
  resolvers: {
    Query: {
      hello: () => 'world',
    },
  },
});
const exampleQuery = stripIgnoredCharacters(/* GraphQL */ `
  query {
    hello
  }
`);
for (const [name, configure] of Object.entries({
  'as proxy': (yoga?: GatewayTesterRemoteSchemaConfigYoga) =>
    ({
      proxy: { name: 'upstream', schema: upstreamSchema, yoga },
    }) as GatewayTesterConfig,
  'as subgraph': (yoga?: GatewayTesterRemoteSchemaConfigYoga) =>
    ({
      subgraphs: [
        {
          name: 'upstream',
          schema: upstreamSchema,
          yoga,
        },
      ],
    }) as GatewayTesterConfig,
})) {
  describe(`when used ${name}`, () => {
    describe('useHmacSignatureValidation', () => {
      test('should throw when header is missing or invalid', async () => {
        await using gateway = createGatewayTester({
          ...configure(),
          plugins: () => [
            useHmacSignatureValidation({
              secret: 'topSecret',
            }),
          ],
        });

        await expect(
          gateway.execute({
            query: exampleQuery,
          }),
        ).resolves.toEqual({
          errors: [
            expect.objectContaining({
              message:
                'Missing HMAC signature: extension hmac-signature not found in request.',
            }),
          ],
        });

        await expect(
          gateway.execute({
            query: exampleQuery,
            extensions: {
              'hmac-signature': 'invalid',
            },
          }),
        ).resolves.toEqual({
          errors: [
            expect.objectContaining({
              message:
                'Invalid HMAC signature: extension hmac-signature does not match the body content.',
            }),
          ],
        });
      });

      test('should build a valid hmac and validate it correctly in a Yoga setup', async () => {
        const sharedSecret = 'topSecret';
        await using gateway = createGatewayTester({
          ...configure({
            plugins: [
              useHmacSignatureValidation({
                secret: sharedSecret,
              }),
            ],
          }),
          hmacSignature: {
            secret: sharedSecret,
          },
          plugins: () => [
            {
              onSubgraphExecute(payload) {
                payload.executionRequest.extensions ||= {};
                payload.executionRequest.extensions['addedToPayload'] = true;
              },
            } satisfies GatewayPlugin,
          ],
        });

        await expect(
          gateway.execute({
            query: exampleQuery,
          }),
        ).resolves.toMatchInlineSnapshot(`
          {
            "data": {
              "hello": "world",
            },
          }
        `);
      });
    });

    function hashSHA256(secret: string, body: string | undefined) {
      if (!body) {
        throw new Error('Body is required');
      }
      return createHmac('sha256', secret).update(body).digest('base64');
    }

    describe('useHmacUpstreamSignature', () => {
      const requestTrackerPlugin = {
        onParams: vi.fn((() => {}) as Plugin['onParams']),
      };
      beforeEach(() => {
        requestTrackerPlugin.onParams.mockClear();
      });

      it('should build valid hmac signature based on the request body even when its modified in other plugins', async () => {
        const secret = 'secret';
        await using gateway = createGatewayTester({
          ...configure({ plugins: [requestTrackerPlugin] }),
          hmacSignature: {
            secret,
          },
          plugins: () => [
            {
              onSubgraphExecute(payload) {
                payload.executionRequest.extensions ||= {};
                payload.executionRequest.extensions['addedToPayload'] = true;
              },
            } satisfies GatewayPlugin,
          ],
        });

        await expect(
          gateway.execute({
            query: exampleQuery,
          }),
        ).resolves.toMatchInlineSnapshot(`
          {
            "data": {
              "hello": "world",
            },
          }
        `);

        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'as proxy' ? 2 : 1,
        );
        const upstreamReqParams =
          requestTrackerPlugin.onParams.mock.calls[
            name === 'as proxy' ? 1 : 0
          ]![0].params;
        const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
        expect(upstreamReqParams).toEqual({
          extensions: {
            addedToPayload: true,
            'hmac-signature': hashSHA256(secret, upstreamReqBody),
          },
          query: expect.stringContaining('{hello}'),
        });
      });

      it('should include hmac signature based on the request body', async () => {
        const secret = 'secret';
        await using gateway = createGatewayTester({
          ...configure({ plugins: [requestTrackerPlugin] }),
          hmacSignature: {
            secret,
          },
        });

        await expect(
          gateway.execute({
            query: exampleQuery,
          }),
        ).resolves.toMatchInlineSnapshot(`
          {
            "data": {
              "hello": "world",
            },
          }
        `);

        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'as proxy' ? 2 : 1,
        );
        const upstreamReqParams =
          requestTrackerPlugin.onParams.mock.calls[
            name === 'as proxy' ? 1 : 0
          ]![0].params;
        const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
        expect(upstreamReqParams).toEqual({
          extensions: {
            // addedToPayload: true, not added by other plugin
            'hmac-signature': hashSHA256(secret, upstreamReqBody),
          },
          query: expect.stringContaining('{hello}'),
        });
      });

      it('should allow to customize header name', async () => {
        const secret = 'secret';
        const customExtensionName = 'custom-hmac-signature';
        await using gateway = createGatewayTester({
          ...configure({ plugins: [requestTrackerPlugin] }),
          hmacSignature: {
            secret,
            extensionName: customExtensionName,
          },
        });

        await expect(
          gateway.execute({
            query: exampleQuery,
          }),
        ).resolves.toMatchInlineSnapshot(`
          {
            "data": {
              "hello": "world",
            },
          }
        `);

        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'as proxy' ? 2 : 1,
        );
        const upstreamReqParams =
          requestTrackerPlugin.onParams.mock.calls[
            name === 'as proxy' ? 1 : 0
          ]![0].params;
        const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
        expect(upstreamReqParams).toEqual({
          extensions: {
            [customExtensionName]: hashSHA256(secret, upstreamReqBody),
          },
          query: expect.stringContaining('{hello}'),
        });
      });

      it('should allow to filter upstream calls', async () => {
        const secret = 'secret';
        await using gateway = createGatewayTester({
          ...configure({ plugins: [requestTrackerPlugin] }),
          hmacSignature: {
            secret,
            shouldSign: () => false,
          },
        });

        await expect(
          gateway.execute({
            query: exampleQuery,
          }),
        ).resolves.toMatchInlineSnapshot(`
          {
            "data": {
              "hello": "world",
            },
          }
        `);

        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'as proxy' ? 2 : 1,
        );
        const upstreamReqParams =
          requestTrackerPlugin.onParams.mock.calls[
            name === 'as proxy' ? 1 : 0
          ]![0].params;
        expect(upstreamReqParams).toEqual({
          query: expect.stringContaining('{hello}'),
        });
      });
    });
  });
}
