import { describe, expect, it } from 'vitest';
import {createSchema, createYoga, Repeater} from "graphql-yoga";
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
    SpanExporter
} from "@opentelemetry/sdk-trace-base";
import {buildHTTPExecutor} from "@graphql-tools/executor-http";
import {useOpenTelemetry} from "@graphql-mesh/plugin-opentelemetry";
import {GraphQLError, parse} from "graphql";
import * as api from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {ATTR_GRAPHQL_DOCUMENT, ATTR_GRAPHQL_OPERATION_NAME} from "../src/attributes";
import {ATTR_GRAPHQL_OPERATION_TYPE} from "@opentelemetry/semantic-conventions/incubating";

const contextManager = new AsyncLocalStorageContextManager().enable();
api.context.setGlobalContextManager(contextManager);

describe('useOpenTelemetry', () => {
    const schema = createSchema({
        typeDefs: /* GraphQL */ `
            type Query {
                ping: String
                echo(message: String): String
                error: String
                context: String
            }

            type Subscription {
                counter(count: Int!): Int!
            }
        `,
        resolvers: {
            Query: {
                ping: () => {
                    expect(api.context.active()).not.toEqual(api.ROOT_CONTEXT); // proves that the context is propagated
                    return 'pong';
                },
                echo: (_, { message }) => {
                    expect(api.context.active()).not.toEqual(api.ROOT_CONTEXT);
                    return `echo: ${message}`;
                },
                error: () => {
                    throw new GraphQLError('boom');
                },
            },
            Subscription: {
                counter: {
                    subscribe: (_, args) => {
                        expect(api.context.active()).not.toEqual(api.ROOT_CONTEXT);
                        return new Repeater((push, end) => {
                            for (let i = args.count; i >= 0; i--) {
                                push({ counter: i });
                            }
                            end();
                        });
                    },
                },
            },
        },
    });

    const useTestOpenTracing = (
        exporter: SpanExporter,
    ) => {
        const provider = new BasicTracerProvider({
            spanProcessors: [new SimpleSpanProcessor(exporter)]
        });

        provider.register();
        return useOpenTelemetry({
            tracer: provider.getTracer("graphql"),
            spans: {
                parse: true,
                validate: true,
                execute: true,
                subscribe: true,
                subgraphExecute: true,
            }
        });
    };

    const createTestInstance = (exporter: SpanExporter) => {
        const yoga = createYoga({
            schema,
            plugins: [useTestOpenTracing(exporter)],
        });

        return buildHTTPExecutor({
            fetch: yoga.fetch,
        });
    };

    it('query should add spans', async () => {
        const exporter = new InMemorySpanExporter();
        const executor = createTestInstance(exporter);

        await executor({ document: parse(`query ping { ping }`) });

        const actual = exporter.getFinishedSpans();
        expect(actual.length).toBe(4);
        expect(actual?.[0]?.name).toBe('graphql.parse');
        expect(actual?.[1]?.name).toBe('graphql.validate');
        expect(actual?.[2]?.name).toBe('graphql.context-building');
        expect(actual?.[3]?.name).toBe('graphql.execute');
    });

    it('query should add attributes', async () => {
        const exporter = new InMemorySpanExporter();
        const executor = createTestInstance(exporter);

        await executor({ document: parse(`query ping { ping }`) });

        const actual = exporter.getFinishedSpans();
        expect(actual.length).toBe(4);
        expect(actual?.[3]?.attributes).toEqual({
            [ATTR_GRAPHQL_DOCUMENT]: "query ping {\n  ping\n}",
            [ATTR_GRAPHQL_OPERATION_NAME]: "ping",
            [ATTR_GRAPHQL_OPERATION_TYPE]: "query"
        })
    });

});
