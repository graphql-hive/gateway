import { createTenv } from "@internal/e2e";
import { describe, expect, it } from "vitest";

describe('Subgraph Regular', async () => {
    const tenv = createTenv(__dirname);
    it('callable as is', async () => {
        const gateway = await tenv.gateway({
            subgraph: {
                with: "mesh",
                services: [
                    await tenv.service('regular'),
                ],
                subgraphName: "regular",
            },
            pipeLogs: true,
        });
        const result = await gateway.execute({
            query: /* GraphQL */ `
                query {
                    greeting(from: "Alice", to: "Bob") {
                        from
                        to
                        message
                        fullMessage
                    }
                }
            `
        });
        expect(result).toEqual({
            data: {
                greeting: {
                    from: "Alice",
                    to: "Bob",
                    message: "Hello",
                    fullMessage: "Hello Bob from Alice"
                }
            }
        })
    })
})