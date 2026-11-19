import { createDefaultExecutor } from '@graphql-tools/delegate';
import type { StitchingInfo } from '@graphql-tools/delegate';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { ExecutionResult } from '@graphql-tools/utils';
import { parse, print } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  buildStitchPlan,
  createBackboneExecutor,
  type StitchPlanNode,
} from '../src/backbone/index';
import { stitchSchemas } from '../src/stitchSchemas';

async function exec(
  executor: ReturnType<typeof createBackboneExecutor>,
  request: Parameters<typeof executor>[0],
): Promise<ExecutionResult> {
  return (await executor(request)) as ExecutionResult;
}

describe('stitching backbone', () => {
  const authors = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type User {
        id: ID!
        email: String
      }
      type Query {
        userById(id: ID!): User
      }
    `,
    resolvers: {
      Query: {
        userById: (_: unknown, { id }: { id: string }) => ({
          id,
          email: `${id}@example.com`,
        }),
      },
    },
  });

  const chirps = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Chirp {
        id: ID!
        text: String
        author: User
      }
      type User {
        id: ID!
        chirps: [Chirp]
      }
      type Query {
        userById(id: ID!): User
      }
    `,
    resolvers: {
      Query: {
        userById: (_: unknown, { id }: { id: string }) => ({ id }),
      },
      User: {
        chirps: (user: { id: string }) => [
          { id: `c-${user.id}`, text: 'hello', author: { id: user.id } },
        ],
      },
      Chirp: {
        author: (chirp: { author: { id: string } }) => chirp.author,
      },
    },
  });

  function createStitched() {
    return stitchSchemas({
      subschemas: [
        {
          schema: chirps,
          executor: createDefaultExecutor(chirps),
          merge: {
            User: {
              fieldName: 'userById',
              args: (originalResult: { id: string }) => ({
                id: originalResult.id,
              }),
              selectionSet: '{ id }',
            },
          },
          batch: true,
        },
        {
          schema: authors,
          executor: createDefaultExecutor(authors),
          merge: {
            User: {
              fieldName: 'userById',
              args: (originalResult: { id: string }) => ({
                id: originalResult.id,
              }),
              selectionSet: '{ id }',
            },
          },
          batch: true,
        },
      ],
    });
  }

  it('builds a complete plan for a merged type query', () => {
    const schema = createStitched();
    const document = parse(/* GraphQL */ `
      query ($id: ID!) {
        userById(id: $id) {
          id
          email
          chirps {
            id
            text
          }
        }
      }
    `);
    const operation = document.definitions[0] as any;
    const plan = buildStitchPlan(schema, operation, {}, { id: '1' });
    expect(plan.incompleteReasons).toEqual([]);
    // Final plans flatten Sequence barriers; schedule is cached when there is
    // no Condition.
    expect(plan.root.kind === 'Fetch' || plan.root.kind === 'Parallel').toBe(
      true,
    );
    expect(plan.schedule).toBeDefined();
    expect(plan.schedule!.waits.length).toBeGreaterThan(0);
  });

  it('executes a merged query via the backbone executor', async () => {
    const schema = createStitched();
    const executor = createBackboneExecutor(schema);
    const result = await exec(executor, {
      document: parse(/* GraphQL */ `
        query ($id: ID!) {
          userById(id: $id) {
            id
            email
            chirps {
              id
              text
            }
          }
        }
      `),
      variables: { id: '1' },
      context: {},
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      userById: {
        id: '1',
        email: '1@example.com',
        chirps: [{ id: 'c-1', text: 'hello' }],
      },
    });
  });

  it('stamps runIf for root @skip/@include and caches a schedule', async () => {
    const schema = createStitched();
    const document = parse(/* GraphQL */ `
      query ($id: ID!, $skipEmail: Boolean!) {
        userById(id: $id) @skip(if: $skipEmail) {
          id
          email
        }
      }
    `);
    const operation = document.definitions[0] as any;
    const planSkip = buildStitchPlan(
      schema,
      operation,
      {},
      {
        id: '1',
        skipEmail: true,
      },
    );
    const planInclude = buildStitchPlan(
      schema,
      operation,
      {},
      {
        id: '1',
        skipEmail: false,
      },
    );
    expect(planSkip.incompleteReasons).toEqual([]);
    // runIf keeps the hop set fixed (no Condition) so schedule caches.
    expect(planSkip.root.kind).not.toBe('Condition');
    expect(planSkip.schedule).toBeDefined();
    const hop =
      planSkip.root.kind === 'Fetch'
        ? planSkip.root
        : planSkip.root.kind === 'Parallel'
          ? planSkip.root.nodes.find((n) => n.kind === 'Fetch')
          : undefined;
    expect(hop?.kind).toBe('Fetch');
    expect((hop as any).runIf).toEqual([
      { variable: 'skipEmail', equals: false },
    ]);
    // Same structure regardless of variable map (one cached plan shape).
    expect(planInclude.root.kind).toBe(planSkip.root.kind);

    const executor = createBackboneExecutor(schema);
    const skipped = await exec(executor, {
      document,
      variables: { id: '1', skipEmail: true },
      context: {},
    });
    expect(skipped.errors).toBeUndefined();
    expect(skipped.data).toEqual({});

    const included = await exec(executor, {
      document,
      variables: { id: '1', skipEmail: false },
      context: {},
    });
    expect(included.errors).toBeUndefined();
    expect(included.data).toEqual({
      userById: { id: '1', email: '1@example.com' },
    });
  });

  it('marks additionalResolvers as islands and still hydrates merge keys', async () => {
    const schema = stitchSchemas({
      subschemas: [
        {
          schema: authors,
          executor: createDefaultExecutor(authors),
          merge: {
            User: {
              fieldName: 'userById',
              args: (originalResult: { id: string }) => ({
                id: originalResult.id,
              }),
              selectionSet: '{ id }',
            },
          },
          batch: true,
        },
      ],
      typeDefs: /* GraphQL */ `
        extend type Query {
          me: User
        }
      `,
      resolvers: {
        Query: {
          me: () => ({ id: '42' }),
        },
      },
    });

    const stitchingInfo = schema.extensions?.['stitchingInfo'] as StitchingInfo;
    expect(stitchingInfo.localFields.get('Query')?.has('me')).toBe(true);

    const executor = createBackboneExecutor(schema);
    const result = await exec(executor, {
      document: parse(/* GraphQL */ `
        {
          me {
            id
            email
          }
        }
      `),
      context: {},
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      me: { id: '42', email: '42@example.com' },
    });
  });

  it('plans pure __typename as Island (no schema-execute escape)', async () => {
    const schema = createStitched();
    const document = parse(/* GraphQL */ `
      {
        __typename
      }
    `);
    const plan = buildStitchPlan(
      schema,
      document.definitions[0] as any,
      {},
      {},
    );
    expect(plan.incompleteReasons).toEqual([]);
    expect(plan.root.kind).toBe('Island');
    expect((plan.root as any).fieldNode.name.value).toBe('__typename');

    const executor = createBackboneExecutor(schema);
    const result = await exec(executor, { document, context: {} });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ __typename: 'Query' });
  });

  it('plans nested additionalResolvers as Island under a Fetch path', async () => {
    const books = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Book {
          id: ID!
          title: String
          authorId: ID!
        }
        type Query {
          books: [Book]
        }
      `,
      resolvers: {
        Query: {
          books: () => [
            { id: 'b1', title: 'Dune', authorId: 'a1' },
            { id: 'b2', title: 'Neuromancer', authorId: 'a2' },
          ],
        },
      },
    });
    const authors = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Author {
          id: ID!
          name: String
        }
        type Query {
          authors(ids: [ID!]!): [Author]!
        }
      `,
      resolvers: {
        Query: {
          authors: (_: unknown, { ids }: { ids: string[] }) =>
            ids.map((id) => ({ id, name: `Author ${id}` })),
        },
      },
    });
    const schema = stitchSchemas({
      subschemas: [
        {
          schema: books,
          executor: createDefaultExecutor(books),
        },
        {
          schema: authors,
          executor: createDefaultExecutor(authors),
          merge: {
            Author: {
              fieldName: 'authors',
              selectionSet: '{ id }',
              key: ({ id }: { id: string }) => id,
              argsFromKeys: (ids: readonly string[]) => ({ ids }),
            },
          },
          batch: true,
        },
      ],
      typeDefs: /* GraphQL */ `
        extend type Book {
          author: Author
        }
      `,
      resolvers: {
        Book: {
          author: {
            selectionSet: '{ authorId }',
            resolve: (book: { authorId: string }) => ({ id: book.authorId }),
          },
        },
      },
    });

    const stitchingInfo = schema.extensions?.['stitchingInfo'] as StitchingInfo;
    expect(stitchingInfo.localFields.get('Book')?.has('author')).toBe(true);

    const document = parse(/* GraphQL */ `
      {
        books {
          title
          author {
            id
            name
          }
        }
      }
    `);
    const plan = buildStitchPlan(
      schema,
      document.definitions[0] as any,
      {},
      {},
    );
    expect(plan.incompleteReasons).toEqual([]);

    const hasNestedAuthorIsland = (n: any): boolean => {
      if (!n) return false;
      if (
        n.kind === 'Island' &&
        n.parentTypeName === 'Book' &&
        n.fieldNode?.name?.value === 'author' &&
        Array.isArray(n.flattenPaths)
      ) {
        return true;
      }
      if (n.nodes) return n.nodes.some(hasNestedAuthorIsland);
      if (n.continue) return hasNestedAuthorIsland(n.continue);
      if (n.ifClause || n.elseClause) {
        return (
          hasNestedAuthorIsland(n.ifClause) ||
          hasNestedAuthorIsland(n.elseClause)
        );
      }
      return false;
    };
    expect(hasNestedAuthorIsland(plan.root)).toBe(true);

    const executor = createBackboneExecutor(schema);
    const result = await exec(executor, { document, context: {} });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      books: [
        { title: 'Dune', author: { id: 'a1', name: 'Author a1' } },
        { title: 'Neuromancer', author: { id: 'a2', name: 'Author a2' } },
      ],
    });
  });
});

describe('backbone performance smoke', () => {
  const authors = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type User {
        id: ID!
        email: String
      }
      type Query {
        userById(id: ID!): User
      }
    `,
    resolvers: {
      Query: {
        userById: (_: unknown, { id }: { id: string }) => ({
          id,
          email: `${id}@ex.com`,
        }),
      },
    },
  });
  const chirps = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Chirp {
        id: ID!
        text: String
      }
      type User {
        id: ID!
        chirps: [Chirp]
      }
      type Query {
        userById(id: ID!): User
      }
    `,
    resolvers: {
      Query: {
        userById: (_: unknown, { id }: { id: string }) => ({ id }),
      },
      User: {
        chirps: (u: { id: string }) => [{ id: `c-${u.id}`, text: 'hello' }],
      },
    },
  });

  const schema = stitchSchemas({
    subschemas: [
      {
        schema: chirps,
        executor: createDefaultExecutor(chirps),
        merge: {
          User: {
            fieldName: 'userById',
            args: (o: { id: string }) => ({ id: o.id }),
            selectionSet: '{ id }',
          },
        },
        batch: true,
      },
      {
        schema: authors,
        executor: createDefaultExecutor(authors),
        merge: {
          User: {
            fieldName: 'userById',
            args: (o: { id: string }) => ({ id: o.id }),
            selectionSet: '{ id }',
          },
        },
        batch: true,
      },
    ],
  });

  const document = parse(/* GraphQL */ `
    query ($id: ID!) {
      userById(id: $id) {
        id
        email
        chirps {
          id
          text
        }
      }
    }
  `);

  async function measure(label: string, run: () => Promise<unknown>) {
    // warmup
    for (let i = 0; i < 50; i++) await run();
    const n = 200;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) await run();
    const ms = performance.now() - t0;
    return { label, hz: (n / ms) * 1000, meanMs: ms / n };
  }

  it('planned execute stays within 2x of schema execute on this microbench', async () => {
    const schemaExec = createDefaultExecutor(schema);
    const planned = createBackboneExecutor(schema);
    const request = {
      document,
      variables: { id: '1' },
      context: {},
    };

    const schemaStats = await measure('schema', () =>
      Promise.resolve(schemaExec(request)),
    );
    const plannedStats = await measure('planned', () =>
      Promise.resolve(planned(request)),
    );

    // Sanity: both return the same shape
    const a = (await schemaExec(request)) as ExecutionResult;
    const b = (await planned(request)) as ExecutionResult;
    expect(b.data).toEqual(a.data);

    // Planned path should not be dramatically slower than schema on this
    // workload (plan is cached). Allow 2x slack for CI noise.
    expect(plannedStats.meanMs).toBeLessThan(schemaStats.meanMs * 2 + 0.5);
  });
});

function countFetches(node: StitchPlanNode): {
  root: number;
  entity: number;
  island: number;
} {
  const acc = { root: 0, entity: 0, island: 0 };
  const walk = (n: StitchPlanNode) => {
    if (n.kind === 'Fetch') {
      if (n.rootField) acc.root++;
      else acc.entity++;
    } else if (n.kind === 'Island') {
      acc.island++;
      if (n.continue) walk(n.continue);
    } else if (n.kind === 'Sequence' || n.kind === 'Parallel') {
      for (const c of n.nodes) walk(c);
    } else if (n.kind === 'Condition') {
      if (n.ifClause) walk(n.ifClause);
      if (n.elseClause) walk(n.elseClause);
    } else if (n.kind === 'BatchFetch') {
      acc.entity += n.aliases.length;
    }
  };
  walk(node);
  return acc;
}

function listFetches(node: StitchPlanNode): string[] {
  const out: string[] = [];
  const walk = (n: StitchPlanNode) => {
    if (n.kind === 'Fetch') {
      const kind = n.rootField ? 'root' : 'entity';
      const sel = print(n.selectionSet).replace(/\s+/g, ' ').trim();
      out.push(`${kind}:${n.entityTypeName ?? n.rootField?.name.value} ${sel}`);
    } else if (n.kind === 'Island') {
      out.push(`island:${n.fieldNode.name.value}`);
      if (n.continue) walk(n.continue);
    } else if (n.kind === 'Sequence' || n.kind === 'Parallel') {
      for (const c of n.nodes) walk(c);
    } else if (n.kind === 'Condition') {
      if (n.ifClause) walk(n.ifClause);
      if (n.elseClause) walk(n.elseClause);
    }
  };
  walk(node);
  return out;
}

describe('backbone plan quality', () => {
  const authors = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type User {
        id: ID!
        email: String
      }
      type Query {
        userById(id: ID!): User
        users: [User]
      }
    `,
    resolvers: {
      Query: {
        userById: (_: unknown, { id }: { id: string }) => ({
          id,
          email: `${id}@ex.com`,
        }),
        users: () => [{ id: '1', email: '1@ex.com' }],
      },
    },
  });

  const chirps = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Chirp {
        id: ID!
        text: String
      }
      type User {
        id: ID!
        chirps: [Chirp]
      }
      type Query {
        userById(id: ID!): User
      }
    `,
    resolvers: {
      Query: {
        userById: (_: unknown, { id }: { id: string }) => ({ id }),
      },
      User: {
        chirps: (u: { id: string }) => [{ id: `c-${u.id}`, text: 'hello' }],
      },
    },
  });

  const schema = stitchSchemas({
    subschemas: [
      {
        schema: chirps,
        executor: createDefaultExecutor(chirps),
        merge: {
          User: {
            fieldName: 'userById',
            args: (o: { id: string }) => ({ id: o.id }),
            selectionSet: '{ id }',
          },
        },
        batch: true,
      },
      {
        schema: authors,
        executor: createDefaultExecutor(authors),
        merge: {
          User: {
            fieldName: 'userById',
            args: (o: { id: string }) => ({ id: o.id }),
            selectionSet: '{ id }',
          },
        },
        batch: true,
      },
    ],
  });

  it('plans a single root fetch + one entity fetch for cross-subgraph User fields', () => {
    const document = parse(/* GraphQL */ `
      query ($id: ID!) {
        userById(id: $id) {
          id
          email
          chirps {
            id
            text
          }
        }
      }
    `);
    const plan = buildStitchPlan(
      schema,
      document.definitions[0] as any,
      {},
      { id: '1' },
    );
    expect(plan.incomplete).toBe(false);
    const counts = countFetches(plan.root);
    // Shared root `userById`: either Parallel roots (chirps + authors) with no
    // entity hop, or 1 root + 1 entity - both match router-quality coverage.
    expect(counts.island).toBe(0);
    expect(counts.root + counts.entity).toBeGreaterThanOrEqual(2);
    expect(counts.root).toBeGreaterThanOrEqual(1);
    const fetches = listFetches(plan.root);
    expect(fetches.some((f) => f.includes('email'))).toBe(true);
    expect(fetches.some((f) => f.includes('chirps'))).toBe(true);
  });

  it('plans parallel root fetches for independent root fields', () => {
    const document = parse(/* GraphQL */ `
      {
        users {
          id
          email
        }
        userById(id: "1") {
          id
          chirps {
            text
          }
        }
      }
    `);
    const plan = buildStitchPlan(
      schema,
      document.definitions[0] as any,
      {},
      {},
    );
    expect(plan.incomplete).toBe(false);
    const counts = countFetches(plan.root);
    expect(counts.root).toBeGreaterThanOrEqual(2);
  });
});

describe('backbone aggressive BatchFetch + entityReuse', () => {
  function createBookMagazineSchema(inventoryCalls: { n: number }) {
    const products = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        interface Product {
          id: ID!
        }
        type Book implements Product {
          id: ID!
          title: String
        }
        type Magazine implements Product {
          id: ID!
          title: String
        }
        type Query {
          products: [Product]
        }
      `,
      resolvers: {
        Product: {
          __resolveType: (obj: { __typename?: string }) =>
            obj.__typename ?? 'Book',
        },
        Query: {
          products: () => [
            { __typename: 'Book', id: 'b1', title: 'B' },
            { __typename: 'Magazine', id: 'm1', title: 'M' },
          ],
        },
      },
    });
    const inventory = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Book {
          id: ID!
          inStock: Boolean
        }
        type Magazine {
          id: ID!
          inStock: Boolean
        }
        type Query {
          _book(id: ID!): Book
          _magazine(id: ID!): Magazine
        }
      `,
      resolvers: {
        Query: {
          _book: (_: unknown, { id }: { id: string }) => {
            inventoryCalls.n++;
            return { id, inStock: true };
          },
          _magazine: (_: unknown, { id }: { id: string }) => {
            inventoryCalls.n++;
            return { id, inStock: false };
          },
        },
      },
    });
    return stitchSchemas({
      subschemas: [
        {
          schema: products,
          executor: createDefaultExecutor(products),
          batch: true,
        },
        {
          schema: inventory,
          executor: createDefaultExecutor(inventory),
          merge: {
            Book: {
              fieldName: '_book',
              selectionSet: '{ id }',
              args: (o: { id: string }) => ({ id: o.id }),
            },
            Magazine: {
              fieldName: '_magazine',
              selectionSet: '{ id }',
              args: (o: { id: string }) => ({ id: o.id }),
            },
          },
          batch: true,
        },
      ],
    });
  }

  it('BatchFetches concrete Book||Magazine entity hops under the same root path', () => {
    const schema = createBookMagazineSchema({ n: 0 });
    const document = parse(/* GraphQL */ `
      {
        products {
          id
          ... on Book {
            inStock
          }
          ... on Magazine {
            inStock
          }
        }
      }
    `);
    const plan = buildStitchPlan(
      schema,
      document.definitions[0] as any,
      {},
      {},
    );
    expect(plan.incompleteReasons).toEqual([]);
    const batches: Array<Extract<StitchPlanNode, { kind: 'BatchFetch' }>> = [];
    const walk = (n: StitchPlanNode) => {
      if (n.kind === 'BatchFetch') batches.push(n);
      else if (n.kind === 'Parallel' || n.kind === 'Sequence') {
        for (const c of n.nodes) walk(c);
      } else if (n.kind === 'Island' && n.continue) walk(n.continue);
    };
    walk(plan.root);
    expect(batches.length).toBeGreaterThanOrEqual(1);
    const types = new Set(batches.flatMap((b) => b.aliases.map((a) => a.entityTypeName)));
    expect(types.has('Book')).toBe(true);
    expect(types.has('Magazine')).toBe(true);
    // One HTTP hop for both concrete types under products.
    expect(batches[0]!.aliases.length).toBeGreaterThanOrEqual(2);
    expect(plan.schedule).toBeDefined();
  });

  it('executes BatchFetch Book||Magazine and returns stock fields', async () => {
    const calls = { n: 0 };
    const schema = createBookMagazineSchema(calls);
    const executor = createBackboneExecutor(schema);
    const result = await exec(executor, {
      document: parse(/* GraphQL */ `
        {
          products {
            id
            ... on Book {
              inStock
            }
            ... on Magazine {
              inStock
            }
          }
        }
      `),
      variables: {},
      context: {},
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      products: [
        { id: 'b1', inStock: true },
        { id: 'm1', inStock: false },
      ],
    });
  });

  it('entityReuse skips a redundant entity hop when fields are already present', async () => {
    let entityCalls = 0;
    const accounts = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          name: String
        }
        type Query {
          me: User
          user(id: ID!): User
        }
      `,
      resolvers: {
        Query: {
          me: () => {
            entityCalls++;
            return { id: '1', name: 'Ada' };
          },
          user: (_: unknown, { id }: { id: string }) => {
            entityCalls++;
            return { id, name: 'Ada' };
          },
        },
      },
    });
    const schema = stitchSchemas({
      subschemas: [
        {
          schema: accounts,
          executor: createDefaultExecutor(accounts),
          merge: {
            User: {
              fieldName: 'user',
              selectionSet: '{ id }',
              args: (o: { id: string }) => ({ id: o.id }),
            },
          },
          batch: true,
        },
      ],
    });
    const document = parse(/* GraphQL */ `
      {
        me {
          id
          name
        }
      }
    `);
    // With reuse on, root already projected name - entity follow-up (if any)
    // should not add another call beyond the root.
    const withReuse = createBackboneExecutor(schema, { entityReuse: true });
    const before = entityCalls;
    const result = await exec(withReuse, {
      document,
      variables: {},
      context: {},
    });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ me: { id: '1', name: 'Ada' } });
    const reusedCalls = entityCalls - before;

    entityCalls = 0;
    const without = createBackboneExecutor(schema, { entityReuse: false });
    await exec(without, { document, variables: {}, context: {} });
    // Reuse path must not call more than the baseline single-subgraph root.
    expect(reusedCalls).toBeLessThanOrEqual(entityCalls);
    expect(reusedCalls).toBeGreaterThanOrEqual(1);
  });
});

