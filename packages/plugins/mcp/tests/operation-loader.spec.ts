import { createLoggerFromLogging } from '@graphql-hive/gateway-runtime';
import { describe, expect, it } from 'vitest';
import {
  loadOperationsFromString,
  resolveOperation,
} from '../src/operation-loader.js';

const logger = createLoggerFromLogging(false);

describe('loadOperationsFromString', () => {
  it('parses a single operation from a string', () => {
    const source = `
      query GetWeather($location: String!) {
        getWeatherData(location: $location) {
          temperature
          conditions
        }
      }
    `;
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.name).toBe('GetWeather');
    expect(ops[0]!.type).toBe('query');
    expect(ops[1]!.name).toBe('CreateOrder');
    expect(ops[1]!.type).toBe('mutation');
  });

  it('throws for anonymous operations', () => {
    const source = `query { getWeatherData { temperature } }`;
    expect(() => loadOperationsFromString(source, logger)).toThrow(
      'anonymous operations are not supported',
    );
  });

  it('extracts @mcpTool directive args from operation', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather", title: "Weather") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
    expect(ops[0]!.document).not.toContain('mcpTool');
    expect(ops[0]!.document).toContain('GetWeather');
  });

  it('returns undefined mcpDirective for operations without @mcpTool', () => {
    const source = `
      query GetWeather($location: String!) {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromString(source, logger);
    expect(ops[0]!.mcpDirective).toBeUndefined();
  });

  it('ignores @mcpTool directive missing name argument', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(description: "No name") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromString(source, logger);
    expect(ops[0]!.mcpDirective).toBeUndefined();
  });

  it('extracts descriptionProvider from @mcpTool directive', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", descriptionProvider: "langfuse:weather_description") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
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
    const ops = loadOperationsFromString(source, logger);
    expect(ops[0]!.selectionDescriptionProviders).toEqual({
      'node.id': 'langfuse:node.id',
    });
    expect(ops[0]!.document).not.toContain('mcpDescription');
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
    const ops = loadOperationsFromString(source, logger);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.mcpDirective).toEqual({ name: 'get_weather' });
    expect(ops[1]!.mcpDirective).toBeUndefined();
  });
});

describe('resolveOperation', () => {
  const ops = loadOperationsFromString(
    `
    query GetWeather($location: String!) {
      getWeatherData(location: $location) { temperature }
    }
    query GetForecast($location: String!, $days: Int) {
      getForecast(location: $location, days: $days) { date high low }
    }
  `,
    logger,
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
