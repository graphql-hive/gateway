import { buildSubgraphSchema } from "@graphql-tools/federation";
import { parse } from "graphql";
import { describe, expect, it } from "vitest";
import { composeAndGetExecutor } from "./utils";

describe('handleFederationSubschema', () => {
    it('combine federation merging and custom merging', async () => {
        const users = buildSubgraphSchema({
            typeDefs: parse(/* GraphQL */ `

                directive @merge(keyField: String) on FIELD_DEFINITION


                type Query {
                    userById(id: ID!): User @merge(keyField: "id")
                }

                type User {
                    id: ID!
                    name: String
                    posts: [Post]
                }

                type Post @key(fields: "id") {
                    id: ID!
                    author: User
                }

            `),
            resolvers: {
                Query: {
                    userById(_root, { id }) {
                        return { id, name: `User ${id}` };
                    },
                },
                Post: {
                    __resolveReference(post) {
                        return { id: post.id };
                    },
                    author(post) {
                        return { id: post.id, name: `User ${post.id}` };
                    }
                },
                User: {
                    posts() {
                        return [{ id: '1' }];
                    }
                },
            }
        });
        const posts = buildSubgraphSchema({
            typeDefs: parse(/* GraphQL */ `

                type Query {
                    posts: [Post]
                }

                type Post @key(fields: "id") {
                    id: ID!
                    title: String
                }

             `),
            resolvers: {
                Query: {
                    posts() {
                        return [{ id: '1', title: 'Post 1' }];
                    },
                },
                Post: {
                    __resolveReference(post) {
                        return { id: post.id };
                    },
                    title(post) {
                        return `Post ${post.id}`;
                    }
                }
            }
        });
        const executor = composeAndGetExecutor([
            {
                schema: users,
                name: 'users',
            },
            {
                schema: posts,
                name: 'posts',
            }
        ]);
        const result = await executor({
            query: /* GraphQL */ `
                query {
                    userById(id: "1") {
                        id
                        name
                        posts {
                            id
                            title
                            author {
                                id
                                name
                            }
                        }
                    }
                    posts {
                        id
                        title
                        author {
                            id
                            name
                        }
                    }
                }
            `
        });
        expect(result).toMatchObject({
            userById: {
                id: '1',
                name: 'User 1',
                posts: [
                    {
                        id: '1',
                        title: 'Post 1',
                        author: {
                            id: '1',
                            name: 'User 1'
                        },
                    },
                ],
            },
            posts: [
                {
                    id: '1',
                    title: 'Post 1',
                    author: {
                        id: '1',
                        name: 'User 1'
                    },
                },
            ],
        });

    })
})