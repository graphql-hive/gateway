# extra-fields

## How to open in CodeSandbox?

This example is available online as a [CodeSandbox Devbox](https://codesandbox.io/docs/learn/devboxes/overview).

Visit [githubbox.com/graphql-hive/gateway/tree/main/examples/extra-fields](https://githubbox.com/graphql-hive/gateway/tree/main/examples/extra-fields).

ℹ️ You can open an example from other branches by changing the `/tree/main` to the branch name (`/tree/<branch_name>`) in the URL above.

## How to run locally?

1. Download example
   ```sh
   curl -L https://github.com/graphql-hive/gateway/raw/refs/heads/main/examples/extra-fields/example.tar.gz | tar -x
   ```

   ℹ️ You can download examples from other branches by changing the `/refs/heads/main` to the branch name (`/refs/heads/<branch_name>`) in the URL above.

1. Open example
   ```sh
   cd extra-fields
   ```
1. Install
   ```sh
   npm i
   ```
1. Start service foo
   ```sh
   npm run service:foo
   ```
1. Start service bar
   ```sh
   npm run service:bar
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

This example was auto-generated from the [extra-fields E2E test](/e2e/extra-fields) using our [example converter](/internal/examples).

You can browse the [extra-fields.e2e.ts test file](/e2e/extra-fields/extra-fields.e2e.ts) to understand what to expect.
