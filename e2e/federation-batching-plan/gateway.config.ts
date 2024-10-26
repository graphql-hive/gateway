import { defineConfig, GatewayPlugin } from '@graphql-hive/gateway';
import { print } from 'graphql';

export function useExplainQueryPlan(): GatewayPlugin {
  const plans = new WeakMap<
    Request,
    { subgraphName: string; query: string; variables: unknown }[]
  >();
  return {
    onExecute({
      args: {
        contextValue: { request },
      },
    }) {
      plans.set(request, []);
      return {
        onExecuteDone({ result, setResult }) {
          const plan = plans.get(request)!;

          // stabilise
          plan.sort((a, b) => a.query.localeCompare(b.query));

          setResult({
            ...result,
            extensions: {
              // @ts-expect-error this will always be an ExecutionResult
              ...result['extensions'],
              plan,
            },
          });
        },
      };
    },
    onSubgraphExecute({
      subgraphName,
      executionRequest: { context, document, variables },
    }) {
      const plan = plans.get(context!.request)!;
      plan.push({ subgraphName, query: print(document), variables });
    },
  };
}

export const gatewayConfig = defineConfig({
  plugins: () => [useExplainQueryPlan()],
});
