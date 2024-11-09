import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  plugins() {
    return [
      {
        onSubgraphExecute:
          () =>
          ({ result }) => {
            if (Symbol.asyncIterator in result) {
              process.stdout.write('ITERABLE');
              return {
                onNext: () => {
                  process.stdout.write('>NEXT');
                },
                onEnd: () => {
                  process.stdout.write('>END');
                },
              };
            }
            return void 0;
          },
      },
    ];
  },
});
