import { createPrefixTransform, defineConfig, loadGraphQLHTTPSubgraph } from "@graphql-mesh/compose-cli";
import { Opts } from "@internal/testing";

const opts = Opts(process.argv);

const regularPort = opts.getServicePort("different-root-name");

export const composeConfig = defineConfig({
    subgraphs: [
        {
            sourceHandler: loadGraphQLHTTPSubgraph('regular', {
                endpoint: `http://localhost:${regularPort}/graphql`,
            }),
            transforms: [
                createPrefixTransform({
                    value: 'Regular'
                })
            ]
        }
    ]
})