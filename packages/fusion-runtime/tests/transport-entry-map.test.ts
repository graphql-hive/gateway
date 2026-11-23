import { getDirectiveExtensions } from '@graphql-tools/utils';
import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getTransportEntryMapUsingFusionAndFederationDirectives } from '../src/utils';

describe('getTransportEntryMapUsingFusionAndFederationDirectives', () => {
  it('reads transport from schema @join__directive(name: "transport")', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @link(
        url: String
        as: String
        for: String
        import: [String]
      ) repeatable on SCHEMA
      directive @join__graph(name: String!, url: String) on ENUM_VALUE
      directive @join__directive(
        graphs: [join__Graph!]
        name: String!
        args: join__DirectiveArguments
      ) repeatable on SCHEMA | OBJECT | FIELD_DEFINITION | INTERFACE

      scalar join__DirectiveArguments

      enum join__Graph {
        THRIFT @join__graph(name: "thrift", url: "http://thrift.local")
      }

      schema
        @join__directive(
          graphs: [THRIFT]
          name: "transport"
          args: {
            kind: "thrift"
            location: "http://thrift.local"
            options: { serviceName: "Demo" }
          }
        ) {
        query: Query
      }

      type Query {
        hello: String
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['thrift']).toMatchObject({
      subgraph: 'thrift',
      kind: 'thrift',
      location: 'http://thrift.local',
    });
    expect(map['thrift']?.options).toEqual({ serviceName: 'Demo' });
  });

  it('infers kind connect from field @join__directive(name: "connect")', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @join__graph(name: String!, url: String) on ENUM_VALUE
      directive @join__directive(
        graphs: [join__Graph!]
        name: String!
        args: join__DirectiveArguments
      ) repeatable on SCHEMA | OBJECT | FIELD_DEFINITION | INTERFACE

      scalar join__DirectiveArguments

      enum join__Graph {
        REVIEWS @join__graph(name: "reviews", url: "")
      }

      type Query {
        review(id: ID!): String
          @join__directive(
            graphs: [REVIEWS]
            name: "connect"
            args: { http: { GET: "/reviews/{$args.id}" } }
          )
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['reviews']).toMatchObject({
      subgraph: 'reviews',
      kind: 'connect',
    });
  });

  it('infers connect from SCHEMA @source with http.baseURL, not Mesh type @source', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @join__graph(name: String!, url: String) on ENUM_VALUE
      directive @join__directive(
        graphs: [join__Graph!]
        name: String!
        args: join__DirectiveArguments
      ) repeatable on SCHEMA | OBJECT | FIELD_DEFINITION | INTERFACE

      scalar join__DirectiveArguments

      enum join__Graph {
        HTTP @join__graph(name: "http", url: "http://api.local")
        CONNECTORS @join__graph(name: "connectors", url: "")
      }

      schema
        @join__directive(
          graphs: [CONNECTORS]
          name: "source"
          args: { name: "widgets", http: { baseURL: "http://widgets.local" } }
        ) {
        query: Query
      }

      type Author
        @join__directive(
          graphs: [HTTP]
          name: "source"
          args: { name: "AuthorWithBooks" }
        ) {
        id: ID!
      }

      type Query {
        author(id: ID!): Author
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['connectors']).toMatchObject({
      subgraph: 'connectors',
      kind: 'connect',
      location: 'http://widgets.local',
    });
    // Mesh stitching type `@source` must not flip HTTP transport to connect.
    expect(map['http']).toMatchObject({
      subgraph: 'http',
      kind: 'http',
      location: 'http://api.local',
    });
  });

  it('accepts Mesh core @link v0.1 and rejects unsupported versions', () => {
    const ok = buildSchema(/* GraphQL */ `
      directive @link(url: String, import: [String]) repeatable on SCHEMA

      schema
        @link(
          url: "https://specs.graphql-mesh.com/core/v0.1"
          import: ["@source"]
        ) {
        query: Query
      }

      type Query {
        hello: String
      }
    `);
    expect(() =>
      getTransportEntryMapUsingFusionAndFederationDirectives(ok),
    ).not.toThrow();

    const bad = buildSchema(/* GraphQL */ `
      directive @link(url: String, import: [String]) repeatable on SCHEMA

      schema @link(url: "https://specs.graphql-mesh.com/core/v0.2") {
        query: Query
      }

      type Query {
        hello: String
      }
    `);
    expect(() =>
      getTransportEntryMapUsingFusionAndFederationDirectives(bad),
    ).toThrow(/unsupported Mesh spec "core" version v0\.2/);
  });

  it('merges native schema @transport over join__graph url defaults', () => {
    const schema = buildSchema(/* GraphQL */ `
      directive @transport(
        subgraph: String
        kind: String
        location: String
        options: transport__Options
      ) repeatable on SCHEMA
      directive @join__graph(name: String!, url: String) on ENUM_VALUE

      scalar transport__Options

      enum join__Graph {
        API @join__graph(name: "api", url: "http://from-join")
      }

      schema
        @transport(
          subgraph: "api"
          kind: "http"
          location: "http://from-transport"
          options: { timeout: 5 }
        ) {
        query: Query
      }

      type Query {
        hello: String
      }
    `);

    const map = getTransportEntryMapUsingFusionAndFederationDirectives(schema);
    expect(map['api']).toMatchObject({
      subgraph: 'api',
      kind: 'http',
      location: 'http://from-transport',
    });
    expect(map['api']?.options).toEqual({ timeout: 5 });
    // Ensure directives stayed readable for regression.
    expect(getDirectiveExtensions(schema)?.['transport']?.length).toBe(1);
  });
});
