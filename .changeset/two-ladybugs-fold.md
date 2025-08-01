---
'@graphql-hive/gateway': patch
'@graphql-hive/plugin-aws-sigv4': patch
---

Support `Promise` as a result of `outgoing`;

So you can use credentials providers from `@aws-sdk/credential-providers` package.
[See more](https://www.npmjs.com/package/@aws-sdk/credential-providers#fromnodeproviderchain).

```ts
import { defineConfig } from '@graphql-hive/gateway';
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const config = defineConfig({
  plugins: [
    useAWSSigv4({
      outgoing: fromNodeProviderChain({
            // This provider accepts any input of fromEnv(), fromSSO(), fromTokenFile(),
            // fromIni(), fromProcess(), fromInstanceMetadata(), fromContainerMetadata()
            // that exist in the default credential chain.

            // Optional client overrides. This is passed to an inner credentials client
            // that may be STS, SSO, or other instantiated to resolve the credentials.
            // Region and profile are inherited from the upper client if present
            // unless overridden, so it should not be necessary to set those.
            //
            // Warning: setting a region here may override the region set in
            // the config file for the selected profile if profile-based
            // credentials are used.
            clientConfig: {},
        }),
    }),
  ],
});
```