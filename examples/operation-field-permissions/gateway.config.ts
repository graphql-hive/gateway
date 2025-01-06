import { useOperationFieldPermissions } from '@envelop/operation-field-permissions';
import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  plugins: () => [
    useOperationFieldPermissions({
      getPermissions() {
        return new Set(['Query.allowed']);
      },
    }) as any, // TODO: fix generic in envelop
  ],
});
