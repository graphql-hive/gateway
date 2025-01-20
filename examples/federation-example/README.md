# federation-example

## How to open in CodeSandbox?

This example is available online as a [CodeSandbox Devbox](https://codesandbox.io/docs/learn/devboxes/overview).

Visit [githubbox.com/graphql-hive/gateway/tree/main/examples/federation-example](https://githubbox.com/graphql-hive/gateway/tree/main/examples/federation-example).

## How to run locally?

1. Install
   ```sh
   npm i
   ```
1. Start service accounts
   ```sh
   npm run service:accounts
   ```
1. Start service inventory
   ```sh
   npm run service:inventory
   ```
1. Start service products
   ```sh
   npm run service:products
   ```
1. Start service reviews
   ```sh
   npm run service:reviews
   ```
1. Compose
   ```sh
   npm run compose
   ```
1. Start the gateway
   ```sh
   npm run gateway
   ```

Then visit [localhost:4000/graphql](http://localhost:4000/graphql) to see Hive Gateway in action! 🚀

## Note

This example was auto-generated from the [federation-example E2E test](/e2e/federation-example) using our [example converter](/internal/examples).

You can browse the [federation-example.e2e.ts test file](/e2e/federation-example/federation-example.e2e.ts) to understand what to expect.
