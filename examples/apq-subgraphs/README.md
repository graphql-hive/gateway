# apq-subgraphs

## How to open in CodeSandbox?

This example is available online as a [CodeSandbox Devbox](https://codesandbox.io/docs/learn/devboxes/overview).

Visit [githubbox.com/graphql-hive/gateway/tree/main/examples/apq-subgraphs](https://githubbox.com/graphql-hive/gateway/tree/main/examples/apq-subgraphs).

ℹ️ You can open an example from other branches by changing the `/tree/main` to the branch name (`/tree/<branch_name>`) in the URL above.

## How to run locally?

1. Download example
   ```sh
   curl -L https://github.com/graphql-hive/gateway/raw/refs/heads/main/examples/apq-subgraphs/example.tar.gz | tar -x
   ```

   ℹ️ You can download examples from other branches by changing the `/refs/heads/main` to the branch name (`/refs/heads/<branch_name>`) in the URL above.

1. Open example
   ```sh
   cd apq-subgraphs
   ```
1. Install
   ```sh
   npm i
   ```
1. Start service greetings
   ```sh
   npm run service:greetings
   ```
1. Compose
   ```sh
   npm run compose
   ```
1. Start the gateway
   ```sh
   npm run gateway
   ```

🚀 Then visit [localhost:4000/graphql](http://localhost:4000/graphql) to see Hive Gateway in action!

## Note

This example was auto-generated from the [apq-subgraphs E2E test](/e2e/apq-subgraphs) using our [example converter](/internal/examples).

You can browse the [apq-subgraphs.e2e.ts test file](/e2e/apq-subgraphs/apq-subgraphs.e2e.ts) to understand what to expect.
