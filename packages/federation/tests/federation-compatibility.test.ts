import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { normalizedExecutor } from '@graphql-tools/executor';
import {
  ExecutionResult,
  filterSchema,
  getDirective,
  MapperKind,
  mapSchema,
} from '@graphql-tools/utils';
import { assertSingleExecutionValue } from '@internal/testing';
import {
  buildSchema,
  getNamedType,
  GraphQLSchema,
  isEnumType,
  lexicographicSortSchema,
  parse,
  printSchema,
  validate,
} from 'graphql';
import { createRouter } from 'graphql-federation-gateway-audit';
import { beforeAll, describe, expect, it } from 'vitest';
import { getStitchedSchemaFromSupergraphSdl } from '../src/supergraph';

describe('Federation Compatibility', () => {
  const auditRouter = createRouter();
  const supergraphList = readdirSync(
    join(
      __dirname,
      '../../../node_modules/graphql-federation-gateway-audit/src/test-suites',
    ),
  );
  const supergraphSdlMap = new Map<string, string>();
  const supergraphTestMap = new Map<string, any>();
  beforeAll(async () => {
    const supergraphPathListRes = await auditRouter.fetch(
      'http://localhost/supergraphs',
    );
    if (!supergraphPathListRes.ok) {
      const error = await supergraphPathListRes.text();
      throw new Error(`Failed to fetch supergraph list: ${error}`);
    }
    const supergraphPathList = await supergraphPathListRes.json();
    for (const supergraphPath of supergraphPathList) {
      if (supergraphPath) {
        const supergraphRes = await auditRouter.fetch(supergraphPath);
        const supergraphPathParts = supergraphPath.split('/');
        const supergraphName =
          supergraphPathParts[supergraphPathParts.length - 2];
        const supergraphSdl = await supergraphRes.text();
        supergraphSdlMap.set(supergraphName, supergraphSdl);
        const testsPath = supergraphPath.replace('/supergraph', '/tests');
        const testsRes = await auditRouter.fetch(testsPath);
        const testsContent = await testsRes.json();
        supergraphTestMap.set(supergraphName, testsContent);
      }
    }
  });

  for (const supergraphName of supergraphList) {
    describe(supergraphName, () => {
      let stitchedSchema: GraphQLSchema;
      let supergraphSdl: string;
      const testFile = readFileSync(
        join(
          __dirname,
          '../../../node_modules/graphql-federation-gateway-audit/src/test-suites',
          supergraphName,
          'test.ts',
        ),
        'utf-8',
      );
      let tests: { query: string; expected: any }[] = new Array<{
        query: string;
        expected: any;
      }>(testFile.match(/createTest\(/g)?.length ?? 0).fill({
        query: '',
        expected: {},
      });
      beforeAll(() => {
        supergraphSdl = supergraphSdlMap.get(supergraphName)!;
        tests = supergraphTestMap.get(supergraphName)!;
        stitchedSchema = getStitchedSchemaFromSupergraphSdl({
          supergraphSdl,
          httpExecutorOpts: {
            fetch: auditRouter.fetch,
          },
          batch: true,
        });
      });
      it('generates the expected schema', () => {
        const inputSchema = buildSchema(supergraphSdl, {
          noLocation: true,
          assumeValid: true,
          assumeValidSDL: true,
        });
        const filteredInputSchema = mapSchema(
          filterSchema({
            schema: inputSchema,
            typeFilter: (typeName, type) =>
              !typeName.startsWith('link__') &&
              !typeName.startsWith('join__') &&
              !typeName.startsWith('core__') &&
              !getDirective(inputSchema, type as any, 'inaccessible')?.length,
            fieldFilter: (_, __, fieldConfig) =>
              !getDirective(inputSchema, fieldConfig, 'inaccessible')?.length,
            argumentFilter: (_, __, ___, argConfig) =>
              !getDirective(inputSchema, argConfig as any, 'inaccessible')
                ?.length,
            enumValueFilter: (_, __, valueConfig) =>
              !getDirective(inputSchema, valueConfig, 'inaccessible')?.length,
            directiveFilter: () => false,
          }),
          {
            [MapperKind.ARGUMENT]: (config) => {
              if (config.defaultValue != null) {
                const namedType = getNamedType(config.type);
                if (isEnumType(namedType)) {
                  const defaultVal = namedType.getValue(
                    config.defaultValue.toString(),
                  );
                  if (!defaultVal) {
                    return {
                      ...config,
                      defaultValue: undefined,
                    };
                  }
                }
              }
              return undefined;
            },
          },
        );
        const sortedInputSchema = lexicographicSortSchema(filteredInputSchema);
        const sortedStitchedSchema = lexicographicSortSchema(stitchedSchema);
        // For Stitching's sanity, if an interface is not implemented by any object type, it should be converted to an object type
        // You can see the difference when you commented this condition out.
        if (supergraphName === 'non-resolvable-interface-object') {
          return;
        }
        expect(printSchema(sortedStitchedSchema).trim()).toBe(
          printSchema(sortedInputSchema).trim(),
        );
      });
      tests.forEach((_, i) => {
        describe(`test-query-${i}`, () => {
          it('gives the correct result', async () => {
            const test = tests[i];
            if (!test) {
              throw new Error(`Test ${i} not found`);
            }
            const document = parse(test.query, { noLocation: true });
            const validationErrors = validate(stitchedSchema, document);
            let result: ExecutionResult;
            if (validationErrors.length > 0) {
              result = {
                errors: validationErrors,
              };
            } else {
              const execRes = await normalizedExecutor({
                schema: stitchedSchema,
                document,
              });
              assertSingleExecutionValue(execRes);
              result = execRes;
            }
            const received = {
              data: result.data ?? null,
              errors: !!result.errors?.length,
            };

            const expected = {
              data: test.expected.data ?? null,
              errors: test.expected.errors ?? false,
            };

            try {
              expect(received).toEqual(expected);
            } catch (e) {
              result.errors?.forEach((err) => {
                console.error(err);
              });
              throw e;
            }
          });
        });
      });
    });
  }
});
