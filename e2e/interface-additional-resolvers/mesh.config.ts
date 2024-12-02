import { defineConfig, loadGraphQLHTTPSubgraph } from "@graphql-mesh/compose-cli";
import { Opts } from "@internal/testing";

const opts = Opts(process.argv);

export const composeConfig = defineConfig({
    subgraphs: [
        {
            sourceHandler: loadGraphQLHTTPSubgraph('Test', {
                endpoint: `http://localhost:${opts.getServicePort('Test')}/graphql`,
            })
        }
    ],
    additionalTypeDefs: /* GraphQL */ `
        extend interface Node {
            self: Node!
                @resolveTo(
                    sourceName: "Test"
                    sourceTypeName: "Query"
                    sourceFieldName: "node"
                    sourceArgs: {
                        id: "{root.id}"
                    }
                    requiredSelectionSet: "{ id }"
                )
        }

        extend type User implements Node {
            self: Node!
        }
    `
})