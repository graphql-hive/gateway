import { defineConfig } from '@graphql-hive/gateway';

export const gatewayConfig = defineConfig({
  plugins() {
    return [
      {
        onSubgraphExecute:
          () =>
          ({ result }) => {
            if (Symbol.asyncIterator in result) {
              process.stdout.write('__ITERABLE__');
              return {
                onNext: () => {
                  process.stdout.write('__NEXT__');
                },
                onEnd: () => {
                  process.stdout.write('__END__');
                },
              };
            }
            return void 0;
          },
      },
    ];
  },
});
