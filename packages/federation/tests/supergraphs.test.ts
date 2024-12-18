import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { filterSchema, getDirective } from '@graphql-tools/utils';
import { buildSchema, lexicographicSortSchema, printSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

describe('Supergraphs', () => {
  readdirSync(join(__dirname, 'fixtures', 'supergraphs')).forEach((fixture) => {
    describe(fixture, () => {
      const fixturePath = join(__dirname, 'fixtures', 'supergraphs', fixture);
      const supergraphSdl = readFileSync(fixturePath, 'utf8');
      it('matches', () => {
        const schema = getStitchedSchemaFromSupergraphSdl({ supergraphSdl });
        const sortedSchema = lexicographicSortSchema(schema);
        const sortedInputSchema = lexicographicSortSchema(
          buildSchema(supergraphSdl, {
            noLocation: true,
            assumeValid: true,
            assumeValidSDL: true,
          }),
        );
        const filteredInputSchema = filterSchema({
          schema: sortedInputSchema,
          typeFilter: (typeName) =>
            !typeName.startsWith('link__') &&
            !typeName.startsWith('join__') &&
            !typeName.startsWith('core__'),
          fieldFilter: (_, __, fieldConfig) =>
            !getDirective(sortedInputSchema, fieldConfig, 'inaccessible')
              ?.length,
          directiveFilter: typeName =>
            !typeName.startsWith('link__') &&
            !typeName.startsWith('join__') &&
            !typeName.startsWith('core__') &&
            typeName !== 'core' &&
            typeName !== 'link' &&
            typeName !== 'inaccessible',
          enumValueFilter: (_, __, enumValueConfig) =>
            !getDirective(sortedInputSchema, enumValueConfig, 'inaccessible')
              ?.length,
        });
        expect(printSchema(sortedSchema).trim()).toBe(
          printSchema(filteredInputSchema).trim(),
        );
      });
    });
  });
});
