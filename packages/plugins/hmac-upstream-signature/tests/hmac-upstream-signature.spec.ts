import { createHmac } from 'node:crypto';
import {
  createGatewayRuntime,
  GatewayPlugin,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { Logger } from '@graphql-hive/logger';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { MeshFetch } from '@graphql-mesh/types';
import { GraphQLSchema, stripIgnoredCharacters } from 'graphql';
import { createSchema, createYoga, type Plugin } from 'graphql-yoga';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import {
  defaultParamsSerializer,
  useHmacSignatureValidation,
} from '../src/index';

const cases = {
  asProxy: () => ({
    proxy: {
      endpoint: 'https://upstream/graphql',
    },
  }),
  asSubgraph: (upstreamSchema: GraphQLSchema) => ({
    supergraph: getUnifiedGraphGracefully([
      {
        name: 'upstream',
        schema: upstreamSchema,
        url: 'http://upstream/graphql',
      },
    ]),
  }),
};
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
    __typename
    hello
  }
`);
for (const [name, createConfig] of Object.entries(cases)) {
  describe(`when used ${name}`, () => {
    describe('useHmacSignatureValidation', () => {
      test('should throw when header is missing or invalid', async () => {
        await using upstream = createYoga({
          schema: upstreamSchema,
          plugins: [],
          logging: false,
        });
        await using gateway = createGatewayRuntime({
          ...createConfig(upstreamSchema),
          plugins: () => [
            useHmacSignatureValidation({
              log: new Logger({ level: false }),
              secret: 'topSecret',
            }),
            useCustomFetch(upstream.fetch as MeshFetch),
          ],
          logging: false,
        });

        let response = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: exampleQuery,
          }),
        });

        expect(await response.json()).toEqual({
          errors: [
            {
              extensions: {
                code: 'INTERNAL_SERVER_ERROR',
              },
              message: 'Unexpected error.',
            },
          ],
        });
        response = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: exampleQuery,
            extensions: {
              'hmac-signature': 'invalid',
            },
          }),
        });

        expect(await response.json()).toEqual({
          errors: [
            {
              extensions: {
                code: 'INTERNAL_SERVER_ERROR',
              },
              message: 'Unexpected error.',
            },
          ],
        });
      });

      test('should build a valid hmac and validate it correctly in a Yoga setup', async () => {
        const sharedSecret = 'topSecret';
        await using upstream = createYoga({
          schema: upstreamSchema,
          plugins: [
            useHmacSignatureValidation({
              log: new Logger({ level: false }),
              secret: sharedSecret,
            }),
          ],
          logging: false,
        });
        await using gateway = createGatewayRuntime({
          ...createConfig(upstreamSchema),
          hmacSignature: {
            secret: sharedSecret,
          },
          plugins: () => [
            useCustomFetch(
              // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
              upstream.fetch,
            ),
            {
              onSubgraphExecute(payload) {
                payload.executionRequest.extensions ||= {};
                payload.executionRequest.extensions['addedToPayload'] = true;
              },
            } satisfies GatewayPlugin,
          ],
          logging: false,
        });

        const response = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: exampleQuery,
          }),
        });

        expect(response.status).toBe(200);
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
      function createUpstream() {
        return createYoga({
          schema: upstreamSchema,
          plugins: [requestTrackerPlugin],
          logging: false,
        });
      }
      beforeEach(() => {
        requestTrackerPlugin.onParams.mockClear();
      });

      it('should build valid hmac signature based on the request body even when its modified in other plugins', async () => {
        const secret = 'secret';
        await using upstream = createUpstream();
        await using gateway = createGatewayRuntime({
          ...createConfig(upstreamSchema),
          hmacSignature: {
            secret,
          },
          plugins: () => [
            useCustomFetch(
              // We cast instead of using @ts-expect-error because when `upstream` is not defined, it doesn't error
              // If you want to try, remove `upstream` variable above, then add ts-expect-error here.
              upstream.fetch as MeshFetch,
            ),
            {
              onSubgraphExecute(payload) {
                payload.executionRequest.extensions ||= {};
                payload.executionRequest.extensions['addedToPayload'] = true;
              },
            } satisfies GatewayPlugin,
          ],
          logging: false,
        });

        const response = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: exampleQuery,
          }),
        });

        expect(response.status).toBe(200);
        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'asProxy' ? 2 : 1,
        );
        const callIndex = name === 'asProxy' ? 1 : 0;
        const upstreamReqParams =
          requestTrackerPlugin.onParams.mock.calls[callIndex]![0].params;
        const upstreamExtensions = upstreamReqParams.extensions!;
        expect(upstreamExtensions['hmac-signature']).toBeDefined();
        const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
        expect(upstreamReqParams.extensions?.['addedToPayload']).toBeTruthy();
        // Signature on the upstream call should match when manually validated
        expect(upstreamExtensions['hmac-signature']).toEqual(
          hashSHA256(secret, upstreamReqBody),
        );
      });

      it('should include hmac signature based on the request body', async () => {
        const secret = 'secret';
        await using upstream = createUpstream();
        await using gateway = createGatewayRuntime({
          ...createConfig(upstreamSchema),
          hmacSignature: {
            secret,
          },
          plugins: () => [useCustomFetch(upstream.fetch as MeshFetch)],
          logging: false,
        });

        const response = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: exampleQuery,
          }),
        });

        expect(response.status).toBe(200);
        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'asProxy' ? 2 : 1,
        );
        const callIndex = name === 'asProxy' ? 1 : 0;
        const upstreamReqParams =
          requestTrackerPlugin.onParams.mock.calls[callIndex]![0].params;
        const upstreamExtensions = upstreamReqParams.extensions!;
        const upstreamHmacExtension = upstreamExtensions['hmac-signature'];
        expect(upstreamHmacExtension).toBeDefined();
        const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
        // Signature on the upstream call should match when manually validated
        expect(upstreamHmacExtension).toEqual(
          hashSHA256(secret, upstreamReqBody),
        );
      });

      it('should allow to customize header name', async () => {
        const secret = 'secret';
        const customExtensionName = 'custom-hmac-signature';
        await using upstream = createUpstream();
        await using gateway = createGatewayRuntime({
          ...createConfig(upstreamSchema),
          hmacSignature: {
            secret,
            extensionName: customExtensionName,
          },
          plugins: () => [useCustomFetch(upstream.fetch as MeshFetch)],
          logging: false,
        });

        const response = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: exampleQuery,
          }),
        });

        expect(response.status).toBe(200);
        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'asProxy' ? 2 : 1,
        );
        const callIndex = name === 'asProxy' ? 1 : 0;
        const upstreamReqParams =
          requestTrackerPlugin.onParams.mock.calls[callIndex]![0].params;
        const upstreamExtensions = upstreamReqParams.extensions!;
        const upstreamHmacExtension = upstreamExtensions[customExtensionName];
        expect(upstreamHmacExtension).toBeDefined();
        const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
        // Signature on the upstream call should match when manually validated
        expect(upstreamHmacExtension).toEqual(
          hashSHA256(secret, upstreamReqBody),
        );
      });

      it('should allow to filter upstream calls', async () => {
        const secret = 'secret';
        await using upstream = createUpstream();
        await using gateway = createGatewayRuntime({
          ...createConfig(upstreamSchema),
          hmacSignature: {
            secret,
            shouldSign: () => false,
          },
          plugins: () => [useCustomFetch(upstream.fetch as MeshFetch)],
          logging: false,
        });

        const response = await gateway.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: exampleQuery,
          }),
        });

        expect(response.status).toBe(200);
        expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(
          name === 'asProxy' ? 2 : 1,
        );
        for (const call of requestTrackerPlugin.onParams.mock.calls) {
          expect(call[0].params.extensions?.['hmac-signature']).toBeUndefined();
        }
      });
    });
  });
}
