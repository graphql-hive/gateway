import { createHmac } from 'node:crypto';
import {
  createGatewayRuntime,
  GatewayPlugin,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { MeshFetch } from '@graphql-mesh/types';
import { createSchema, createYoga, type Plugin } from 'graphql-yoga';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import {
  defaultParamsSerializer,
  useHmacSignatureValidation,
} from '../src/index';

describe('useHmacSignatureValidation', () => {
  test('should throw when header is missing or invalid', async () => {
    await using upstream = createYoga({
      schema: createSchema({
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
      }),
      plugins: [],
      logging: false,
    });
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: 'https://example.com/graphql',
      },
      plugins: () => [
        useHmacSignatureValidation({
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
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });

    expect(await response.json()).toEqual({
      errors: [
        {
          extensions: {},
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
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
        extensions: {
          'hmac-signature': 'invalid',
        },
      }),
    });

    expect(await response.json()).toEqual({
      errors: [
        {
          extensions: {},
          message: 'Unexpected error.',
        },
      ],
    });
  });

  test('should build a valid hmac and validate it correctly in a Yoga setup', async () => {
    const sharedSecret = 'topSecret';
    await using upstream = createYoga({
      schema: createSchema({
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
      }),
      plugins: [
        useHmacSignatureValidation({
          secret: sharedSecret,
        }),
      ],
      logging: false,
    });
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: 'https://example.com/graphql',
      },
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
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
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
      schema: createSchema({
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
      }),
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
      proxy: {
        endpoint: 'https://example.com/graphql',
      },
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
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(2);
    const upstreamReqParams =
      requestTrackerPlugin.onParams.mock.calls[1]![0].params;
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
      proxy: {
        endpoint: 'https://example.com/graphql',
      },
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
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(2);
    const upstreamReqParams =
      requestTrackerPlugin.onParams.mock.calls[1]![0].params;
    const upstreamExtensions = upstreamReqParams.extensions!;
    const upstreamHmacExtension = upstreamExtensions['hmac-signature'];
    expect(upstreamHmacExtension).toBeDefined();
    const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
    // Signature on the upstream call should match when manually validated
    expect(upstreamHmacExtension).toEqual(hashSHA256(secret, upstreamReqBody));
  });

  it('should allow to customize header name', async () => {
    const secret = 'secret';
    const customExtensionName = 'custom-hmac-signature';
    await using upstream = createUpstream();
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: 'https://example.com/graphql',
      },
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
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(2);
    const upstreamReqParams =
      requestTrackerPlugin.onParams.mock.calls[1]![0].params;
    const upstreamExtensions = upstreamReqParams.extensions!;
    const upstreamHmacExtension = upstreamExtensions[customExtensionName];
    expect(upstreamHmacExtension).toBeDefined();
    const upstreamReqBody = defaultParamsSerializer(upstreamReqParams);
    // Signature on the upstream call should match when manually validated
    expect(upstreamHmacExtension).toEqual(hashSHA256(secret, upstreamReqBody));
  });

  it('should allow to filter upstream calls', async () => {
    const secret = 'secret';
    await using upstream = createUpstream();
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: 'https://example.com/graphql',
      },
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
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });

    expect(response.status).toBe(200);
    expect(requestTrackerPlugin.onParams).toHaveBeenCalledTimes(2);
    expect(
      requestTrackerPlugin.onParams.mock.calls[0]?.[0].params.extensions?.[
        'hmac-signature'
      ],
    ).toBeFalsy();
    expect(
      requestTrackerPlugin.onParams.mock.calls[1]?.[0].params.extensions?.[
        'hmac-signature'
      ],
    ).toBeFalsy();
  });
});
