import { createTenv } from "@internal/e2e";
import { describe, expect, it } from "vitest";


describe("Polling", async () => {
    const { service, gateway } = createTenv(__dirname);
    const gw = await gateway({
        supergraph: {
            with: 'mesh',
            services: [
                await service('Graph')
            ]
        }
    })
    it('should not break the long running query while polling and schema remaining the same', async () => {
        const res = await gw.execute({
            query: /* GraphQL */ `
                query {
                    hello
                }
            `
        });
        expect(res).toMatchObject({
            data: {
                hello: 'Hello world!'
            }
        });
    }, 30_000);
})