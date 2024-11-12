import { createEncapsulateTransform } from '@graphql-mesh/fusion-composition';
import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { isAsyncIterable } from '@graphql-tools/utils';
import { Repeater } from '@repeaterjs/repeater';
import { GraphQLSchema, parse } from 'graphql';
import { beforeEach, describe, expect, it } from 'vitest';
import { composeAndGetExecutor, composeAndGetPublicSchema } from '../utils';

describe('encapsulate', () => {
  let schema: GraphQLSchema;
  beforeEach(() => {
    schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          getSomething: String
          getSomethingElse: String
        }

        type Mutation {
          doSomething: String
          doSomethingElse: String
        }

        type Subscription {
          notify: String!
        }
      `,
      resolvers: {
        Query: {
          getSomething: () => 'boop',
        },
        Mutation: {
          doSomething: () => 'noop',
        },
        Subscription: {
          notify: {
            subscribe: () =>
              new Repeater((push, stop) => {
                const interval = setInterval(
                  () =>
                    push({
                      notify: 'boop',
                    }),
                  1000,
                );
                return stop.then(() => clearInterval(interval));
              }),
          },
        },
      },
    });
  });

  it('groups Mutation correctly', async () => {
    const transform = createEncapsulateTransform();
    const newSchema = await composeAndGetPublicSchema([
      {
        schema,
        transforms: [transform],
        name: 'TEST',
      },
    ]);
    const mutationType = newSchema.getMutationType();
    const mutationFields = mutationType?.getFields();
    expect(mutationFields?.['TEST']).toBeDefined();
    expect(mutationFields?.['notify']).not.toBeDefined();
    expect(mutationFields?.['TEST']?.type.toString()).toBe('TESTMutation!');
  });
  it('groups Subscription correctly', async () => {
    const transform = createEncapsulateTransform();
    const newSchema = await composeAndGetPublicSchema([
      {
        schema,
        transforms: [transform],
        name: 'TEST',
      },
    ]);
    const subscriptionType = newSchema.getSubscriptionType();
    const subscriptionFields = subscriptionType?.getFields();
    expect(subscriptionFields?.['TEST']).toBeDefined();
    expect(subscriptionFields?.['getSomething']).not.toBeDefined();
    expect(subscriptionFields?.['TEST']?.type.toString()).toBe(
      'TESTSubscription!',
    );
  });
  it('groups Query correctly', async () => {
    const transform = createEncapsulateTransform();
    const newSchema = await composeAndGetPublicSchema([
      {
        schema,
        transforms: [transform],
        name: 'TEST',
      },
    ]);
    const queryType = newSchema.getQueryType();
    const queryFields = queryType?.getFields();
    expect(queryFields?.['TEST']).toBeDefined();
    expect(queryFields?.['TEST']?.type?.toString()).toBe('TESTQuery!');
    expect(queryFields?.['getSomething']).not.toBeDefined();
  });
  it('executes queries the same way and preserves the execution flow', async () => {
    const resultBefore = await normalizedExecutor({
      schema,
      document: parse(`{ getSomething }`),
    });
    if (isAsyncIterable(resultBefore)) {
      throw new Error('Expected a result, but got an async iterable');
    }
    expect(resultBefore.data.getSomething).toBe('boop');
    const transform = createEncapsulateTransform();
    const executor = composeAndGetExecutor([
      {
        schema,
        transforms: [transform],
        name: 'TEST',
      },
    ]);

    const resultAfter = await executor({
      query: `{ TEST { getSomething } }`,
    });

    expect(resultAfter.TEST.getSomething).toBe('boop');
  });
});
