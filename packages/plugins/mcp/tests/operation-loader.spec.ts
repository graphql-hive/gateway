import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  loadOperationsFromDocument,
  parseInlineHeaderDirectives,
  resolveOperation,
} from '../src/operation-loader.js';

const logger = createLoggerFromLogging(false);

describe('loadOperationsFromDocument', () => {
  it('parses a single operation from a string', () => {
    const source = `
      query GetWeather($location: String!) {
        getWeatherData(location: $location) {
          temperature
          conditions
        }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops).toHaveLength(1);
    expect(ops[0]!.name).toBe('GetWeather');
    expect(ops[0]!.type).toBe('query');
    expect(ops[0]!.document).toContain('GetWeather');
  });

  it('parses multiple operations from a string', () => {
    const source = `
      query GetWeather($location: String!) {
        getWeatherData(location: $location) { temperature }
      }
      mutation CreateOrder($input: OrderInput!) {
        createOrder(input: $input) { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops).toHaveLength(2);
    expect(ops[0]!.name).toBe('GetWeather');
    expect(ops[0]!.type).toBe('query');
    expect(ops[1]!.name).toBe('CreateOrder');
    expect(ops[1]!.type).toBe('mutation');
  });

  it('throws for anonymous operations', () => {
    const source = `query { getWeatherData { temperature } }`;
    expect(() =>
      loadOperationsFromDocument({ log: logger }, parse(source)),
    ).toThrow('anonymous operations are not supported');
  });

  it('extracts @mcpTool directive args from operation', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather", title: "Weather") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops).toHaveLength(1);
    expect(ops[0]!.mcpDirective).toEqual({
      name: 'get_weather',
      description: 'Get weather',
      title: 'Weather',
    });
  });

  it('strips @mcpTool directive from printed document', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.document).not.toContain('mcpTool');
    expect(ops[0]!.document).toContain('GetWeather');
  });

  it('returns undefined mcpDirective for operations without @mcpTool', () => {
    const source = `
      query GetWeather($location: String!) {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective).toBeUndefined();
  });

  it('ignores @mcpTool directive missing name argument', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(description: "No name") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective).toBeUndefined();
  });

  it('extracts descriptionProvider from @mcpTool directive', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:weather_description") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective).toEqual({
      name: 'get_weather',
      descriptionProvider: 'langfuse:weather_description',
    });
  });

  it('extracts descriptionProvider with version from @mcpTool directive', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:weather_description:3") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective).toEqual({
      name: 'get_weather',
      descriptionProvider: 'langfuse:weather_description:3',
    });
  });

  it('extracts @mcpDescription from variable definitions', () => {
    const source = `
      query GetWeather($location: String! @mcpDescription(provider: "langfuse:weather.location:3")) @mcpTool(name: "get_weather") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.fieldDescriptionProviders).toEqual({
      location: 'langfuse:weather.location:3',
    });
  });

  it('extracts @mcpDescription from multiple variables', () => {
    const source = `
      query Search(
        $q: String! @mcpDescription(provider: "langfuse:search.query")
        $limit: Int
        $offset: Int @mcpDescription(provider: "langfuse:search.offset:2")
      ) @mcpTool(name: "search") {
        search(q: $q, limit: $limit, offset: $offset) { title }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.fieldDescriptionProviders).toEqual({
      q: 'langfuse:search.query',
      offset: 'langfuse:search.offset:2',
    });
  });

  it('strips @mcpDescription from printed document', () => {
    const source = `
      query GetWeather($location: String! @mcpDescription(provider: "langfuse:loc")) @mcpTool(name: "get_weather") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.document).not.toContain('mcpDescription');
    expect(ops[0]!.document).not.toContain('mcpTool');
    expect(ops[0]!.document).toContain('GetWeather');
    expect(ops[0]!.document).toContain('$location');
  });

  it('returns undefined fieldDescriptionProviders when no @mcpDescription present', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.fieldDescriptionProviders).toBeUndefined();
  });

  it('extracts @mcpDescription from selection set fields', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) {
          date
          conditions @mcpDescription(provider: "langfuse:forecast.conditions:3")
        }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.selectionDescriptionProviders).toEqual({
      'forecast.conditions': 'langfuse:forecast.conditions:3',
    });
  });

  it('extracts @mcpDescription from nested selection set fields', () => {
    const source = `
      query GetData @mcpTool(name: "get_data") {
        user {
          name @mcpDescription(provider: "langfuse:user.name")
          address {
            city @mcpDescription(provider: "langfuse:user.address.city:2")
          }
        }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.selectionDescriptionProviders).toEqual({
      'user.name': 'langfuse:user.name',
      'user.address.city': 'langfuse:user.address.city:2',
    });
  });

  it('strips @mcpDescription from selection set in printed document', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) {
          date
          conditions @mcpDescription(provider: "langfuse:forecast.conditions")
        }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.document).not.toContain('mcpDescription');
    expect(ops[0]!.document).toContain('conditions');
    expect(ops[0]!.document).toContain('date');
  });

  it('returns undefined selectionDescriptionProviders when no @mcpDescription in selection set', () => {
    const source = `
      query GetForecast($location: String!) @mcpTool(name: "forecast") {
        forecast(location: $location) { date conditions }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.selectionDescriptionProviders).toBeUndefined();
  });

  it('combines @mcpDescription on variables and selection fields', () => {
    const source = `
      query Search(
        $q: String! @mcpDescription(provider: "langfuse:search.query")
      ) @mcpTool(name: "search") {
        results(q: $q) {
          title @mcpDescription(provider: "langfuse:search.title")
          score
        }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.fieldDescriptionProviders).toEqual({
      q: 'langfuse:search.query',
    });
    expect(ops[0]!.selectionDescriptionProviders).toEqual({
      'results.title': 'langfuse:search.title',
    });
    expect(ops[0]!.document).not.toContain('mcpDescription');
  });

  it('skips inline fragments without breaking extraction of sibling fields', () => {
    const source = `
      query GetNode($id: ID!) @mcpTool(name: "get_node") {
        node(id: $id) {
          id @mcpDescription(provider: "langfuse:node.id")
          ... on User {
            name
          }
          ... on Post {
            title
          }
        }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.selectionDescriptionProviders).toEqual({
      'node.id': 'langfuse:node.id',
    });
    expect(ops[0]!.document).not.toContain('mcpDescription');
  });

  it('extracts @mcpHeader from variable definitions', () => {
    const source = `
      query GetCompany($companyId: String! @mcpHeader(name: "x-company-id")) @mcpTool(name: "get_company") {
        company(companyId: $companyId) { id name }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.headerMappings).toEqual({
      companyId: 'x-company-id',
    });
  });

  it('extracts @mcpHeader from multiple variables', () => {
    const source = `
      query GetData(
        $companyId: String! @mcpHeader(name: "x-company-id")
        $userId: String! @mcpHeader(name: "x-user-id")
        $query: String!
      ) @mcpTool(name: "get_data") {
        data(companyId: $companyId, userId: $userId, query: $query) { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.headerMappings).toEqual({
      companyId: 'x-company-id',
      userId: 'x-user-id',
    });
  });

  it('strips @mcpHeader from printed document', () => {
    const source = `
      query GetCompany($companyId: String! @mcpHeader(name: "x-company-id")) @mcpTool(name: "get_company") {
        company(companyId: $companyId) { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.document).not.toContain('mcpHeader');
    expect(ops[0]!.document).toContain('$companyId');
    expect(ops[0]!.document).toContain('GetCompany');
  });

  it('returns undefined headerMappings when no @mcpHeader present', () => {
    const source = `
      query GetWeather($location: String!) {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.headerMappings).toBeUndefined();
  });

  it('extracts @mcpHeader and @mcpDescription on the same variable', () => {
    const source = `
      query GetCompany(
        $companyId: String! @mcpHeader(name: "x-company-id") @mcpDescription(provider: "langfuse:company_id")
      ) @mcpTool(name: "get_company") {
        company(companyId: $companyId) { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.headerMappings).toEqual({
      companyId: 'x-company-id',
    });
    expect(ops[0]!.fieldDescriptionProviders).toEqual({
      companyId: 'langfuse:company_id',
    });
    expect(ops[0]!.document).not.toContain('mcpHeader');
    expect(ops[0]!.document).not.toContain('mcpDescription');
  });

  it('throws for @mcpHeader missing name argument', () => {
    const source = `
      query GetCompany($companyId: String! @mcpHeader) @mcpTool(name: "get_company") {
        company(companyId: $companyId) { id }
      }
    `;
    expect(() =>
      loadOperationsFromDocument({ log: logger }, parse(source)),
    ).toThrow('@mcpHeader on variable "$companyId"');
  });

  it('extracts meta from @mcpTool directive', () => {
    const source = `
      query SearchDocs($query: String!) @mcpTool(
        name: "search_docs"
        description: "Search documentation"
        meta: { entitlement: "docs_access", permissions: ["read", "write"], version: 2 }
      ) {
        searchDocs(query: $query) { title }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective).toEqual({
      name: 'search_docs',
      description: 'Search documentation',
      meta: {
        entitlement: 'docs_access',
        permissions: ['read', 'write'],
        version: 2,
      },
    });
  });

  it('extracts meta with nested objects from @mcpTool directive', () => {
    const source = `
      query GetData @mcpTool(
        name: "get_data"
        meta: { auth: { role: "admin", level: 3 }, tags: ["a", "b"] }
      ) {
        getData { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective!.meta).toEqual({
      auth: { role: 'admin', level: 3 },
      tags: ['a', 'b'],
    });
  });

  it('extracts meta with boolean and float values', () => {
    const source = `
      query GetData @mcpTool(
        name: "get_data"
        meta: { enabled: true, threshold: 0.5 }
      ) {
        getData { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective!.meta).toEqual({
      enabled: true,
      threshold: 0.5,
    });
  });

  it('extracts meta with null and enum values', () => {
    const source = `
      query GetData @mcpTool(
        name: "get_data"
        meta: { removed: null, status: ACTIVE }
      ) {
        getData { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective!.meta).toEqual({
      removed: null,
      status: 'ACTIVE',
    });
  });

  it('ignores non-object meta and logs warning', () => {
    const source = `
      query GetData @mcpTool(
        name: "get_data"
        meta: "invalid"
      ) {
        getData { id }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops[0]!.mcpDirective).toEqual({ name: 'get_data' });
    expect(ops[0]!.mcpDirective!.meta).toBeUndefined();
  });

  it('handles mixed operations with and without @mcpTool', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather") {
        weather(location: $location) { temperature }
      }
      query GetForecast($location: String!) {
        forecast(location: $location) { date }
      }
    `;
    const ops = loadOperationsFromDocument({ log: logger }, parse(source));
    expect(ops).toHaveLength(2);
    expect(ops[0]!.mcpDirective).toEqual({ name: 'get_weather' });
    expect(ops[1]!.mcpDirective).toBeUndefined();
  });
});

describe('resolveOperation', () => {
  const ops = loadOperationsFromDocument(
    { log: logger },
    parse(`
    query GetWeather($location: String!) {
      getWeatherData(location: $location) { temperature }
    }
    query GetForecast($location: String!, $days: Int) {
      getForecast(location: $location, days: $days) { date high low }
    }
  `),
  );

  it('finds operation by name and type', () => {
    const op = resolveOperation(ops, 'GetWeather', 'query');
    expect(op).toBeDefined();
    expect(op!.name).toBe('GetWeather');
  });

  it('returns undefined for non-existent operation', () => {
    const op = resolveOperation(ops, 'NonExistent', 'query');
    expect(op).toBeUndefined();
  });

  it('returns undefined for wrong type', () => {
    const op = resolveOperation(ops, 'GetWeather', 'mutation');
    expect(op).toBeUndefined();
  });
});

describe('parseInlineHeaderDirectives', () => {
  it('extracts @mcpHeader from anonymous inline query', () => {
    const result = parseInlineHeaderDirectives(
      { log: logger },
      `query($companyId: String! @mcpHeader(name: "x-company-id")) { company(companyId: $companyId) { id } }`,
    );
    expect(result.headerMappings).toEqual({ companyId: 'x-company-id' });
    expect(result.query).not.toContain('mcpHeader');
    expect(result.query).toContain('$companyId');
  });

  it('returns original query when no @mcpHeader present', () => {
    const original = `query($id: ID!) { user(id: $id) { name } }`;
    const result = parseInlineHeaderDirectives({ log: logger }, original);
    expect(result.headerMappings).toBeUndefined();
    expect(result.query).toBe(original);
  });
});
