import { defineConfig } from '@graphql-hive/gateway';

let fetchCnt = 0;
const useGETForHashedQueries =
  process.env['USE_GET_FOR_HASHED_QUERIES'] === '1';
const useContentTypeForGETRequests =
  process.env['USE_CONTENT_TYPE_FOR_GET_REQUESTS'] === '1';

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
        const contentType = options.headers
          ? new Headers(options.headers as HeadersInit).get('content-type')
          : null;
        process.stdout.write(`fetch ${fetchCnt} ${options.body}\n`);
        process.stdout.write(
          `fetch-meta ${fetchCnt} ${options.method ?? 'POST'} ${contentType ?? ''}\n`,
        );
      },
    },
  ],
});
