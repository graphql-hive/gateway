import { LegacyLogger } from '@graphql-hive/logger';
import { UnifiedGraphManagerOptions } from '@graphql-mesh/fusion-runtime';
import { defaultImportFn, isUrl, readFileOrUrl } from '@graphql-mesh/utils';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import {
  isDocumentNode,
  isValidPath,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import { isSchema } from 'graphql';
import type { GatewayConfigContext } from './types';

export type UnifiedGraphSchema = Awaited<
  ReturnType<UnifiedGraphManagerOptions<unknown>['getUnifiedGraph']>
>;

export type UnifiedGraphConfig =
  | UnifiedGraphSchema
  | Promise<UnifiedGraphSchema>
  | ((
      configContext: GatewayConfigContext,
    ) => UnifiedGraphSchema | Promise<UnifiedGraphSchema>);

export function handleUnifiedGraphConfig(
  config: UnifiedGraphConfig,
  configContext: GatewayConfigContext,
): MaybePromise<UnifiedGraphSchema> {
  return handleMaybePromise(
    () => (typeof config === 'function' ? config(configContext) : config),
    (schema) => handleUnifiedGraphSchema(schema, configContext),
  );
}

export function getUnifiedGraphSDL(unifiedGraphSchema: UnifiedGraphSchema) {
  if (isSchema(unifiedGraphSchema)) {
    return printSchemaWithDirectives(unifiedGraphSchema);
  } else if (isDocumentNode(unifiedGraphSchema)) {
    return defaultPrintFn(unifiedGraphSchema);
  }
  return unifiedGraphSchema;
}

export function handleUnifiedGraphSchema(
  unifiedGraphSchema: UnifiedGraphSchema,
  configContext: GatewayConfigContext,
): MaybePromise<UnifiedGraphSchema> {
  if (
    typeof unifiedGraphSchema === 'string' &&
    (isValidPath(unifiedGraphSchema) || isUrl(unifiedGraphSchema))
  ) {
    return readFileOrUrl<string>(unifiedGraphSchema, {
      fetch: configContext.fetch,
      cwd: configContext.cwd,
      logger: LegacyLogger.from(configContext.log),
      allowUnknownExtensions: true,
      importFn: defaultImportFn,
    });
  }
  return unifiedGraphSchema;
}
