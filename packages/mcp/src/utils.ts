import { Tool } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { standardSchemaToJsonSchema } from './standardSchema';

export const EMPTY_OBJECT_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {},
};

export function zodObjectToInputSchema(
  maybeObj: z.ZodObject | null,
): Tool['inputSchema'] {
  if (!maybeObj) return EMPTY_OBJECT_JSON_SCHEMA;
  return standardSchemaToJsonSchema(maybeObj, 'input') as Tool['inputSchema'];
}

export function zodObjectToOutputSchema(maybeObj: z.ZodObject | null) {
  if (!maybeObj) return EMPTY_OBJECT_JSON_SCHEMA;
  return standardSchemaToJsonSchema(maybeObj, 'output') as Tool['outputSchema'];
}
