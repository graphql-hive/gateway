import { getFragmentsFromDocument } from '@graphql-tools/executor';
import {
  buildStitchPlan,
  collectExecutableHops,
  type StitchPlanNode,
} from '@graphql-tools/stitch';
import { Kind, parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

/**
 * Minimal federation supergraph where inventory resolves fields on two entity
 * types under separate root branches. Wave-per-subgraph fold should emit one
 * inventory hop (BatchFetch / covering), not two.
 */
const SUPERGRAPH_SDL = /* GraphQL */ `
  schema
    @link(url: "https://specs.apollo.dev/link/v1.0")
    @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION) {
    query: Query
  }

  directive @join__graph(name: String!, url: String!) on ENUM_VALUE
  directive @join__field(
    graph: join__Graph
    requires: join__FieldSet
    provides: join__FieldSet
    type: String
    external: Boolean
    override: String
    usedOverridden: Boolean
  ) on FIELD_DEFINITION | INPUT_FIELD_DEFINITION
  directive @join__type(
    graph: join__Graph!
    key: join__FieldSet
    extension: Boolean! = false
    resolvable: Boolean! = true
    isInterfaceObject: Boolean! = false
  ) on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR
  directive @link(
    url: String
    as: String
    for: link__Purpose
    import: [link__Import]
  ) repeatable on SCHEMA

  scalar join__FieldSet
  scalar link__Import
  enum link__Purpose {
    SECURITY
    EXECUTION
  }
  enum join__Graph {
    BOOKS @join__graph(name: "books", url: "http://books")
    MAGAZINES @join__graph(name: "magazines", url: "http://magazines")
    INVENTORY @join__graph(name: "inventory", url: "http://inventory")
  }

  type Book
    @join__type(graph: BOOKS, key: "id")
    @join__type(graph: INVENTORY, key: "id") {
    id: ID!
    title: String @join__field(graph: BOOKS)
    inStock: Boolean @join__field(graph: INVENTORY)
  }

  type Magazine
    @join__type(graph: MAGAZINES, key: "id")
    @join__type(graph: INVENTORY, key: "id") {
    id: ID!
    title: String @join__field(graph: MAGAZINES)
    inStock: Boolean @join__field(graph: INVENTORY)
  }

  type Query {
    book(id: ID!): Book @join__field(graph: BOOKS)
    magazine(id: ID!): Magazine @join__field(graph: MAGAZINES)
  }
`;

function countPlanHttpHops(root: StitchPlanNode) {
  const hops: Parameters<typeof collectExecutableHops>[1] = [];
  collectExecutableHops(root, hops, {});
  return {
    http: hops.filter((h) => h.kind === 'Fetch' || h.kind === 'BatchFetch')
      .length,
    batch: hops.filter((h) => h.kind === 'BatchFetch').length,
  };
}

describe('backbone wave-per-subgraph fold (federation)', () => {
  it('folds Book||Magazine inventory under separate roots to ≤1 inventory hop', () => {
    const schema = getStitchedSchemaFromSupergraphSdl({
      supergraphSdl: SUPERGRAPH_SDL,
    });
    const document = parse(/* GraphQL */ `
      query DualInventory {
        book(id: "1") {
          id
          title
          inStock
        }
        magazine(id: "2") {
          id
          title
          inStock
        }
      }
    `);
    const op = document.definitions.find(
      (d) => d.kind === Kind.OPERATION_DEFINITION,
    )!;
    const plan = buildStitchPlan(
      schema,
      op,
      getFragmentsFromDocument(document),
      {},
    );
    expect(plan.incomplete).toBe(false);
    const { http } = countPlanHttpHops(plan.root);
    // Known target: 2 root Fetches + ≤1 inventory wave (Router-style fold).
    // Without wave fold this was 2 entity Fetches (http ≥ 4).
    expect(http).toBeLessThanOrEqual(3);
    const hops: Parameters<typeof collectExecutableHops>[1] = [];
    collectExecutableHops(plan.root, hops, {});
    const inventoryHops = hops.filter(
      (h) =>
        (h.kind === 'BatchFetch' &&
          h.aliases.some((a) => a.entityTypeName === 'Book') &&
          h.aliases.some((a) => a.entityTypeName === 'Magazine')) ||
        (h.kind === 'Fetch' &&
          !h.rootField &&
          (h.entityTypeName === 'Book' || h.entityTypeName === 'Magazine')),
    );
    expect(inventoryHops.length).toBeLessThanOrEqual(1);
  });
});
