import { defineConfig } from '@graphql-hive/gateway';

let fetchCnt = 0;
export const gatewayConfig = defineConfig({
  transportEntries: {
    greetings: {
      options: {
        apq: true,
      },
    },
  },
  plugins: () => [
    {
      onFetch({ options }) {
        fetchCnt++;
        process.stdout.write(`fetch ${fetchCnt} ${options.body}\n`);
      },
    },
  ],
});
