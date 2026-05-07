import { defineConfig } from '@graphql-hive/gateway';

let fetchCnt = 0;
const useGETForHashedQueries =
  process.env['USE_GET_FOR_HASHED_QUERIES'] === '1';
const useContentTypeForGETRequests =
  process.env['USE_CONTENT_TYPE_FOR_GET_REQUESTS'] === '1';

function getContentType(headers: unknown): string | null {
  if (!headers) {
    return null;
  }
  if (headers instanceof Headers) {
    return headers.get('content-type');
  }
  if (Array.isArray(headers)) {
    return (
      headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1] ??
      null
    );
  }
  return (
    Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'content-type',
    )?.[1] ?? null
  );
}

export const gatewayConfig = defineConfig({
  transportEntries: {
    greetings: {
      options: {
        apq: true,
        useGETForHashedQueries,
        useContentTypeForGETRequests,
      },
    },
  },
  plugins: () => [
    {
      onFetch({ options }) {
        fetchCnt++;
        const contentType = getContentType(options.headers);
        process.stdout.write(`fetch ${fetchCnt} ${options.body}\n`);
        process.stdout.write(
          `fetch-meta ${fetchCnt} ${options.method ?? 'POST'} ${contentType ?? ''}\n`,
        );
      },
    },
  ],
});
