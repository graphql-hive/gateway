import { createTenv } from "@internal/e2e";
import { expect, it } from "vitest";

const { gateway, service } = createTenv(__dirname);

it('works', async () => {
    const {
        execute
    } = await gateway({
        supergraph: {
            with: 'mesh',
            services: [
                await service('Test')
            ]
        }
    });

    const result = await execute({
        query: /* GraphQL */ `
            query {
                node(id: "1") {
                    id
                    ... on User {
                        name
                    }
                    self {
                        id
                        ... on User {
                            name
                        }
                    }
                }
            }
        `
    });

    expect(result.errors).toBeFalsy();
    expect(result.data.node).toEqual({
        id: '1',
        name: 'Alice',
        self: {
            id: '1',
            name: 'Alice'
        }
    });
})