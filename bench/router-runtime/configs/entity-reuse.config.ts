import { defineConfig } from '@graphql-hive/gateway';

// copies entities already in the response instead of fetching them again. Only planned by a
// `@graphql-hive/router-query-planner` that emits `entityReuse` on fetches, with older ones
// this is the same as `dedup`
export const gatewayConfig = defineConfig({
  entityReuse: true,
});
