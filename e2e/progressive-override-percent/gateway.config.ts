import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  progressiveOverride: (label) => {
    const result = true; // For testing, always take the override
    console.log(
      `[gateway] progressiveOverride called with label: "${label}", returning "${result}"`,
    );
    return result;
  },
});
