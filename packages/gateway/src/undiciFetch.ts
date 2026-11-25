import { STATUS_CODES } from 'node:http';
import { pipeline, Readable } from 'node:stream';
import zlib from 'node:zlib';
import type { GatewayConfig } from '@graphql-hive/gateway-runtime';
import type { MeshFetch } from '@graphql-mesh/types';
import { fetch as defaultFetch, Response } from '@whatwg-node/fetch';
import { Agent, request, type Dispatcher } from 'undici';

/** What the gateway's fetch asks for when nothing else does, like `@whatwg-node/fetch`. */
const DEFAULT_ACCEPT_ENCODING = 'gzip, deflate, br';

/**
 * Responses read as they come instead of at once, they might never end. Like subscriptions over
 * SSE and incremental delivery.
 */
function isStreamed(contentType: string | undefined) {
  return (
    !!contentType &&
    (contentType.includes('text/event-stream') ||
      contentType.includes('multipart/'))
  );
}

/** A decompressing stream for the `content-encoding`, like `@whatwg-node/fetch`. */
function decompressor(encoding: string | undefined) {
  switch (encoding) {
    case 'x-gzip':
    case 'gzip':
      return zlib.createGunzip();
    case 'x-deflate':
    case 'deflate':
      return zlib.createInflate();
    case 'x-deflate-raw':
    case 'deflate-raw':
      return zlib.createInflateRaw();
    case 'br':
      return zlib.createBrotliDecompress();
    case 'zstd':
      return zlib.createZstdDecompress?.();
  }
  return undefined;
}

/** The whole of a decompressing stream for `bytes`. */
function decompress(bytes: Uint8Array, stream: zlib.Gunzip): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.end(bytes);
  });
}

/** The headers lowercased, without making a `Headers` of a plain object, the usual case. */
function headersObject(init: HeadersInit | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (init == null) {
    return headers;
  }
  if (Array.isArray(init)) {
    for (const [name, value] of init) {
      headers[name!.toLowerCase()] = value!;
    }
  } else if (typeof (init as Headers).forEach === 'function') {
    (init as Headers).forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
  } else {
    for (const name in init) {
      const value = (init as Record<string, string | undefined>)[name];
      if (value != null) {
        headers[name.toLowerCase()] = value;
      }
    }
  }
  return headers;
}

function isRedirect(status: number) {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

/**
 * A `fetch` sending requests with undici's `request`, which costs a lot less CPU per request than
 * `node:http` behind `@whatwg-node/fetch`, the gateway's default otherwise. It answers with the
 * same `Response` as `@whatwg-node/fetch`, its body read at once unless it's streamed, and works
 * like it: asks for compressed responses and decompresses them, follows redirects and sends
 * `user-agent: node`. A `Request`, a body other than a string or bytes, or a URL other than
 * `http:` or `https:` goes to `@whatwg-node/fetch` instead.
 */
export function createUndiciFetch(
  dispatcher: Dispatcher = new Agent(),
): MeshFetch {
  const undiciFetch = (
    info: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof info === 'string'
        ? info
        : info instanceof URL
          ? info.href
          : undefined;
    const body = init?.body;
    if (
      url === undefined ||
      !(url.startsWith('http:') || url.startsWith('https:')) ||
      (body != null &&
        typeof body !== 'string' &&
        !(body instanceof Uint8Array)) ||
      // `@whatwg-node/fetch`'s own options
      (init && 'agent' in init)
    ) {
      return defaultFetch(info as string, init);
    }
    const headers = headersObject(init?.headers);
    headers['accept-encoding'] ||= DEFAULT_ACCEPT_ENCODING;
    headers['user-agent'] ||= 'node';
    const signal = init?.signal ?? undefined;
    return request(url, {
      method: (init?.method ?? 'GET') as Dispatcher.HttpMethod,
      headers,
      body,
      signal,
      dispatcher,
    }).then(
      async (res) => {
        const status = res.statusCode;
        const resHeaders = res.headers;
        const location = resHeaders['location'];
        const redirect = init?.redirect ?? 'follow';
        if (typeof location === 'string' && isRedirect(status)) {
          if (redirect === 'error') {
            res.body.resume();
            throw new Error('Redirects are not allowed');
          }
          if (redirect === 'follow') {
            res.body.resume();
            const redirected = await undiciFetch(
              new URL(location, url).href,
              init,
            );
            Object.defineProperty(redirected, 'redirected', { value: true });
            return redirected;
          }
        }
        const contentEncoding = resHeaders['content-encoding'];
        const stream = decompressor(
          typeof contentEncoding === 'string' ? contentEncoding : undefined,
        );
        const contentType = resHeaders['content-type'];
        let responseBody: Uint8Array | Readable | null;
        if (
          status === 204 ||
          status === 205 ||
          status === 304 ||
          init?.method?.toUpperCase() === 'HEAD'
        ) {
          // a `Response` with one of these can't have a body
          res.body.resume();
          responseBody = null;
        } else if (
          isStreamed(typeof contentType === 'string' ? contentType : undefined)
        ) {
          responseBody = stream
            ? // destroyed with the response on errors, which then reach the reader
              pipeline(res.body, stream, () => {})
            : res.body;
        } else {
          const bytes = await res.body.bytes();
          responseBody = stream ? await decompress(bytes, stream) : bytes;
        }
        return new Response(responseBody as BodyInit | null, {
          status,
          statusText: STATUS_CODES[status] ?? '',
          headers: resHeaders as Record<string, string>,
          // @ts-expect-error `@whatwg-node/fetch` takes the url of the response
          url,
        });
      },
      (error) => {
        // aborted like `fetch` is, with the reason of the signal
        if (signal?.aborted) {
          throw signal.reason;
        }
        throw error;
      },
    );
  };
  return undiciFetch as MeshFetch;
}

/**
 * The fetch API of the gateway, with {@link createUndiciFetch} as its `fetch` in Node when none is
 * given. Not in Bun, which has its own.
 */
export function withDefaultFetch(
  fetchAPI: GatewayConfig['fetchAPI'],
): GatewayConfig['fetchAPI'] {
  if (
    fetchAPI?.fetch ||
    !globalThis.process?.versions?.node ||
    'Bun' in globalThis
  ) {
    return fetchAPI;
  }
  return { ...fetchAPI, fetch: createUndiciFetch() };
}
