import { LegacyLogger, Logger } from '@graphql-hive/logger';
import type { YamlConfig } from '@graphql-mesh/types';
import {
  getInContextSDK,
  resolveAdditionalResolversWithoutImport,
} from '@graphql-mesh/utils';
import type {
  DelegationPlanBuilder,
  StitchingInfo,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import { getStitchedSchemaFromSupergraphSdl } from '@graphql-tools/federation';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { createMergedTypeResolver } from '@graphql-tools/stitch';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import {
  asArray,
  getDirectiveExtensions,
  getDocumentNodeFromSchema,
  IResolvers,
  MapperKind,
  mapSchema,
  memoize1,
  TypeSource,
} from '@graphql-tools/utils';
import {
  isEnumType,
  Kind,
  visit,
  type GraphQLSchema,
  type ObjectTypeDefinitionNode,
} from 'graphql';
import type {
  UnifiedGraphHandler,
  UnifiedGraphHandlerOpts,
  UnifiedGraphHandlerResult,
} from '../unifiedGraphManager';
import {
  compareSubgraphNames,
  OnDelegationPlanDoneHook,
  wrapMergedTypeResolver,
} from '../utils';
import { handleFederationSubschema } from './subgraph';

// Memoize to avoid re-parsing the same schema AST
// Workaround for unsupported directives on composition: restore extra directives
export const restoreExtraDirectives = memoize1(function restoreExtraDirectives(
  schema: GraphQLSchema,
) {
  const queryType = schema.getQueryType();
  if (!queryType) {
    throw new Error('Query type is required');
  }
  const queryTypeExtensions = getDirectiveExtensions<{
    extraSchemaDefinitionDirective?: { directives: Record<string, any[]> };
  }>(queryType);
  const extraSchemaDefinitionDirectives =
    queryTypeExtensions?.extraSchemaDefinitionDirective;
  if (extraSchemaDefinitionDirectives?.length) {
    schema = mapSchema(schema, {
      [MapperKind.TYPE]: (type) => {
        const typeDirectiveExtensions = getDirectiveExtensions(type) || {};
        const TypeCtor = Object.getPrototypeOf(type).constructor;
        if (type.name === queryType.name) {
          const typeConfig = type.toConfig();
          // Cleanup extra directives on Query type
          return new TypeCtor({
            ...typeConfig,
            extensions: {
              ...(type.extensions || {}),
              directives: {
                ...typeDirectiveExtensions,
                extraSchemaDefinitionDirective: [],
              },
            },
            // Cleanup ASTNode to prevent conflicts
            astNode: undefined,
          });
        }
      },
    });
    if (extraSchemaDefinitionDirectives?.length) {
      const schemaDirectives = getDirectiveExtensions(schema);
      for (const extensionObj of extraSchemaDefinitionDirectives) {
        if (extensionObj != null) {
          const { directives } = extensionObj;
          for (const directiveName in directives) {
            const directiveObjects = directives[directiveName];
            if (Array.isArray(directiveObjects)) {
              schemaDirectives[directiveName] ||= [];
              schemaDirectives[directiveName].push(...directiveObjects);
            }
          }
        }
      }
      const schemaExtensions: Record<string, unknown> = (schema.extensions ||=
        {});
      schemaExtensions['directives'] = schemaDirectives;
    }
  }
  return schema;
});

export function getStitchingDirectivesTransformerForSubschema() {
  const { stitchingDirectivesTransformer } = stitchingDirectives({
    keyDirectiveName: 'stitch__key',
    computedDirectiveName: 'stitch__computed',
    mergeDirectiveName: 'merge',
    canonicalDirectiveName: 'stitch__canonical',
  });
  return stitchingDirectivesTransformer;
}

interface EnumDirectives {
  [key: string]: any;
  join__graph?: {
    name: string;
  };
}

export function handleResolveToDirectives(
  typeDefsOpt: TypeSource,
  additionalTypeDefs: TypeSource,
  additionalResolvers: IResolvers[],
) {
  const mergedTypeDefs = mergeTypeDefs([typeDefsOpt, additionalTypeDefs]);
  visit(mergedTypeDefs, {
    [Kind.FIELD_DEFINITION](field, _key, _parent, _path, ancestors) {
      const fieldDirectives = getDirectiveExtensions<{
        resolveTo: YamlConfig.AdditionalStitchingResolverObject;
      }>({ astNode: field });
      const resolveToDirectives = fieldDirectives?.resolveTo;
      if (resolveToDirectives?.length) {
        const targetTypeName = (
          ancestors[ancestors.length - 1] as ObjectTypeDefinitionNode
        ).name.value;
        const targetFieldName = field.name.value;
        for (const resolveToDirective of resolveToDirectives) {
          additionalResolvers.push(
            resolveAdditionalResolversWithoutImport({
              ...resolveToDirective,
              targetTypeName,
              targetFieldName,
            }),
          );
        }
      }
    },
  });
  return mergedTypeDefs;
}

export const handleFederationSupergraph: UnifiedGraphHandler = function ({
  unifiedGraph,
  onSubgraphExecute,
  onDelegationPlanHooks,
  onDelegationStageExecuteHooks,
  onDelegateHooks,
  batchDelegateOptions,
  additionalTypeDefs: additionalTypeDefsFromConfig = [],
  additionalResolvers: additionalResolversFromConfig = [],
  // no logger was provided, use a muted logger for consistency across plugin hooks
  log: rootLog = new Logger({ level: false }),
}: UnifiedGraphHandlerOpts): UnifiedGraphHandlerResult {
  const additionalTypeDefs = [...asArray(additionalTypeDefsFromConfig)];
  const additionalResolvers = [...asArray(additionalResolversFromConfig)];
  let subschemas: SubschemaConfig[] = [];
  const stitchingDirectivesTransformer =
    getStitchingDirectivesTransformerForSubschema();
  // Workaround to get the real name of the subschema
  const realSubgraphNameMap = new Map<string, string>();
  const joinGraphType = unifiedGraph.getType('join__Graph');
  if (isEnumType(joinGraphType)) {
    for (const enumValue of joinGraphType.getValues()) {
      const enumValueDirectives =
        getDirectiveExtensions<EnumDirectives>(enumValue);
      const joinGraphDirectives = enumValueDirectives?.join__graph;
      if (joinGraphDirectives?.length) {
        for (const joinGraphDirective of joinGraphDirectives) {
          if (joinGraphDirective) {
            realSubgraphNameMap.set(enumValue.name, joinGraphDirective.name);
          }
        }
      }
    }
  }

  const unifiedGraphDirectives = getDirectiveExtensions(unifiedGraph);

  let executableUnifiedGraph = getStitchedSchemaFromSupergraphSdl({
    supergraphSdl: getDocumentNodeFromSchema(unifiedGraph),
    batchDelegateOptions,
    /**
     * This visits over the subgraph schema to get;
     * - Extra Type Defs and Resolvers (additionalTypeDefs & additionalResolvers)
     * - Transport Entries (transportEntryMap)
     * - Type Merging Configuration for the subgraph (subschemaConfig.merge)
     * - Set the executor for the subschema (subschemaConfig.executor)
     */
    onSubschemaConfig: (subschemaConfig) =>
      handleFederationSubschema({
        subschemaConfig,
        unifiedGraphDirectives,
        realSubgraphNameMap,
        additionalTypeDefs,
        stitchingDirectivesTransformer,
        onSubgraphExecute,
      }),
    onStitchingOptions(opts) {
      subschemas = opts.subschemas;
      opts.typeDefs = handleResolveToDirectives(
        opts.typeDefs,
        additionalTypeDefs,
        additionalResolvers,
      );
      // @ts-expect-error - Typings are wrong
      opts.resolvers = additionalResolvers;
      // @ts-expect-error - Typings are wrong
      opts.inheritResolversFromInterfaces = true;

      if (onDelegationStageExecuteHooks?.length) {
        for (const subschema of subschemas) {
          if (subschema.merge) {
            for (const typeName in subschema.merge) {
              const mergedTypeConfig = subschema.merge[typeName];
              if (mergedTypeConfig) {
                const originalResolver = createMergedTypeResolver(
                  mergedTypeConfig,
                  typeName,
                );
                if (originalResolver) {
                  mergedTypeConfig.resolve = wrapMergedTypeResolver(
                    originalResolver,
                    typeName,
                    onDelegationStageExecuteHooks,
                    rootLog,
                  );
                }
              }
            }
          }
        }
      }
    },
    onSubgraphAST(_name, subgraphAST) {
      return visit(subgraphAST, {
        [Kind.OBJECT_TYPE_DEFINITION](node) {
          const typeName = node.name.value;
          return {
            ...node,
            fields: node.fields?.filter((fieldNode) => {
              const fieldDirectives = getDirectiveExtensions<{
                resolveTo: YamlConfig.AdditionalStitchingResolverObject;
                additionalField: {};
              }>({ astNode: fieldNode });
              const resolveToDirectives = fieldDirectives.resolveTo;
              if (resolveToDirectives?.length) {
                additionalTypeDefs.push({
                  kind: Kind.DOCUMENT,
                  definitions: [
                    {
                      kind: Kind.OBJECT_TYPE_DEFINITION,
                      name: { kind: Kind.NAME, value: typeName },
                      fields: [fieldNode],
                    },
                  ],
                });
              }
              const additionalFieldDirectives = fieldDirectives.additionalField;
              if (additionalFieldDirectives?.length) {
                return false;
              }
              return true;
            }),
          };
        },
      });
    },
  });
  const inContextSDK = getInContextSDK(
    executableUnifiedGraph,
    // @ts-expect-error Legacy Mesh RawSource is not compatible with new Mesh
    subschemas,
    LegacyLogger.from(rootLog),
    onDelegateHooks || [],
  );
  const stitchingInfo = executableUnifiedGraph.extensions?.[
    'stitchingInfo'
  ] as StitchingInfo;
  if (stitchingInfo && onDelegationPlanHooks?.length) {
    for (const typeName in stitchingInfo.mergedTypes) {
      const mergedTypeInfo = stitchingInfo.mergedTypes[typeName];
      if (mergedTypeInfo) {
        const originalDelegationPlanBuilder =
          mergedTypeInfo.nonMemoizedDelegationPlanBuilder;
        mergedTypeInfo.nonMemoizedDelegationPlanBuilder = (
          supergraph,
          sourceSubschema,
          variables,
          fragments,
          fieldNodes,
          context,
          info,
        ) => {
          let delegationPlanBuilder = originalDelegationPlanBuilder;
          function setDelegationPlanBuilder(
            newDelegationPlanBuilder: DelegationPlanBuilder,
          ) {
            delegationPlanBuilder = newDelegationPlanBuilder;
          }
          const onDelegationPlanDoneHooks: OnDelegationPlanDoneHook[] = [];
          let log = context.log as Logger;
          if (sourceSubschema.name) {
            log = log.child({
              subgraph: sourceSubschema.name,
            });
          }
          for (const onDelegationPlan of onDelegationPlanHooks) {
            const onDelegationPlanDone = onDelegationPlan({
              supergraph,
              subgraph: sourceSubschema.name!,
              sourceSubschema,
              typeName: mergedTypeInfo.typeName,
              variables,
              fragments,
              fieldNodes,
              log,
              context,
              info,
              delegationPlanBuilder,
              setDelegationPlanBuilder,
            });
            if (onDelegationPlanDone) {
              onDelegationPlanDoneHooks.push(onDelegationPlanDone);
            }
          }
          let delegationPlan = delegationPlanBuilder(
            supergraph,
            sourceSubschema,
            variables,
            fragments,
            fieldNodes,
            context,
            info,
          );
          function setDelegationPlan(
            newDelegationPlan: ReturnType<DelegationPlanBuilder>,
          ) {
            delegationPlan = newDelegationPlan;
          }
          for (const onDelegationPlanDone of onDelegationPlanDoneHooks) {
            onDelegationPlanDone({
              delegationPlan,
              setDelegationPlan,
            });
          }
          return delegationPlan;
        };
      }
    }
  }
  return {
    unifiedGraph: executableUnifiedGraph,
    inContextSDK,
    getSubgraphSchema(subgraphName) {
      const subgraph = subschemas.find(
        (s) => s.name && compareSubgraphNames(s.name, subgraphName),
      );
      if (!subgraph) {
        throw new Error(`Subgraph ${subgraphName} not found`);
      }
      return subgraph.schema;
    },
  };
};
