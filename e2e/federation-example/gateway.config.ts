import { defineConfig } from "@graphql-hive/gateway";

export const gatewayConfig = defineConfig({
    jit: true,
    contentEncoding: true,
})