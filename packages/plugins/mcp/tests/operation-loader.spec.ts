import { describe, expect, it } from 'vitest';
import {
  loadOperationsFromString,
  resolveOperation,
} from '../src/operation-loader.js';

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
    const ops = loadOperationsFromString(source);
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
    const ops = loadOperationsFromString(source);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.name).toBe('GetWeather');
    expect(ops[0]!.type).toBe('query');
    expect(ops[1]!.name).toBe('CreateOrder');
    expect(ops[1]!.type).toBe('mutation');
  });

  it('throws for anonymous operations', () => {
    const source = `query { getWeatherData { temperature } }`;
    expect(() => loadOperationsFromString(source)).toThrow(
      'anonymous operations are not supported',
    );
  });

  it('extracts @mcpTool directive args from operation', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(name: "get_weather", description: "Get weather", title: "Weather") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromString(source);
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
    const ops = loadOperationsFromString(source);
    expect(ops[0]!.document).not.toContain('mcpTool');
    expect(ops[0]!.document).toContain('GetWeather');
  });

  it('returns undefined mcpDirective for operations without @mcpTool', () => {
    const source = `
      query GetWeather($location: String!) {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromString(source);
    expect(ops[0]!.mcpDirective).toBeUndefined();
  });

  it('ignores @mcpTool directive missing name argument', () => {
    const source = `
      query GetWeather($location: String!) @mcpTool(description: "No name") {
        weather(location: $location) { temperature }
      }
    `;
    const ops = loadOperationsFromString(source);
    expect(ops[0]!.mcpDirective).toBeUndefined();
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
    const ops = loadOperationsFromString(source);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.mcpDirective).toEqual({ name: 'get_weather' });
    expect(ops[1]!.mcpDirective).toBeUndefined();
  });
});

describe('resolveOperation', () => {
  const ops = loadOperationsFromString(`
    query GetWeather($location: String!) {
      getWeatherData(location: $location) { temperature }
    }
    query GetForecast($location: String!, $days: Int) {
      getForecast(location: $location, days: $days) { date high low }
    }
  `);

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
