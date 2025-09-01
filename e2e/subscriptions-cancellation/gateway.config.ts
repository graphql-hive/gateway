import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  plugins() {
    return [
      {
        onSubgraphExecute:
          () =>
          ({ result }) => {
            if (Symbol.asyncIterator in result) {
              process.stdout.write('__ITERABLE_GW__');
              return {
                onNext: () => {
                  process.stdout.write('__NEXT_GW__');
                },
                onEnd: () => {
                  process.stdout.write('__END_GW__');
                },
              };
            }
            return void 0;
          },
      } as GatewayPlugin,
    ];
  },
});
