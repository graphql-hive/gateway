import { defineConfig } from '@graphql-hive/gateway';
import { isAsyncIterable } from '@graphql-tools/utils';

export const gatewayConfig = defineConfig({
  plugins() {
    return [
      {
        onSubgraphExecute:
          () =>
          ({ result }) => {
            if (isAsyncIterable(result)) {
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
