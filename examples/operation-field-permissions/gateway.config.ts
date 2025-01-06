import { useOperationFieldPermissions } from '@envelop/operation-field-permissions';
import { defineConfig, GatewayContext } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  plugins: () => [
    useOperationFieldPermissions({
      getPermissions(ctx: GatewayContext) {
        const auth = ctx.request.headers.get('authorization');
        if (
          auth ===
          'Bearer TOKEN' /** NOTE: proper token validity check goes here */
        ) {
          // allow all fields
          return new Set(['*']);
        }
        // allow only introspection
        return new Set(['Query.registrationOpen']);
      },
    }) as any, // TODO: fix generic in envelop
  ],
});
