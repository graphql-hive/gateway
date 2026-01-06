import { normalizedExecutor } from "@graphql-tools/executor";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { stitchSchemas } from "@graphql-tools/stitch";
import { parse, print } from "graphql";
import { describe, expect, it } from "vitest";

describe('Variable Delegation', () => {
    /**
     * If provided a variable with a null value for a nested array, it should be passed correctly to the subschema.
     */
    it('pass nested array variables correctly', async () => {
        const schema = makeExecutableSchema({
            typeDefs: /* GraphQL */ `
                type Query {
                    test(input: InputType!): [String!]
                }
                input InputType {
                    value: [String!]
                }
            `,
            resolvers: {
                Query: {
                    test: (_parent, args, _ctx, info) => {
                        console.log(print(info.operation), info.variableValues)
                        return args.input.value;
                    },
                },
            }
        });

        const document = parse(/* GraphQL */ `
            query Test($value: [String!]) {
                test(input: { value: $value } )
            }
        `);
        const variableValues = { value: null };

        const stitchedSchema = stitchSchemas({
            subschemas: [{ schema }],
        })

        const result = await normalizedExecutor({
            schema: stitchedSchema,
            document,
            variableValues,
        });

        expect(result).toEqual({
            data: {
                test: null
            }
        });
    });
})