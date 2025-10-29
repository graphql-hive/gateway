---
'@graphql-mesh/fusion-runtime': minor
'@graphql-tools/federation': minor
'@graphql-hive/gateway-runtime': minor
---

Support promises in `progressiveOverride` option

```ts
import { defineConfig } from '@graphql-hive/gateway';
export const gatewayConfig = defineConfig({
    async progressiveOverride(label: string, context: GatewayContext) {
        if (label === 'my_label') {
            const serviceResponse = await fetch('http://example.com/should_override', {
                headers: {
                    'x-some-header': context.headers['x-some-header'],
                }
            });
            const result = await serviceResponse.json();
            return result?.override;
        }
        return false;
    }
})
```
