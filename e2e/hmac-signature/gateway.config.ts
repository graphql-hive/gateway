import { defineConfig } from "@graphql-hive/gateway";

export const gatewayConfig = defineConfig({
    hmacSignature: {
        secret: 'HMAC_SIGNING_SECRET',
    }
});