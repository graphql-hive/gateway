import { YamlConfig } from '@graphql-mesh/types';
import type {
  MergedTypeConfig,
  SubschemaConfig,
  Transform,
} from '@graphql-tools/delegate';
import {
  astFromField,
  getDirectiveExtensions,
  MapperKind,
  mapSchema,
  type TypeSource,
} from '@graphql-tools/utils';
import {
  HoistField,
  PruneSchema,
  RenameInputObjectFields,
  RenameInterfaceFields,
  RenameObjectFieldArguments,
  RenameObjectFields,
  RenameTypes,
  TransformEnumValues,
} from '@graphql-tools/wrap';
import type {
  GraphQLArgument,
  GraphQLArgumentConfig,
  GraphQLFieldConfigArgumentMap,
} from 'graphql';
import {
  DirectiveLocation,
  GraphQLDirective,
  GraphQLSchema,
  GraphQLString,
  isInterfaceType,
  isObjectType,
  isOutputType,
  Kind,
  parseType,
  typeFromAST,
  visit,
} from 'graphql';
import {
  compareSubgraphNames,
  TransportEntry,
  type getOnSubgraphExecute,
} from '../utils';

export interface HandleFederationSubschemaOpts {
  subschemaConfig: SubschemaConfig & { endpoint?: string };
  unifiedGraphDirectives?: Record<string, any>;
  realSubgraphNameMap?: Map<string, string>;
  additionalTypeDefs: TypeSource[];
  stitchingDirectivesTransformer: (
    subschemaConfig: SubschemaConfig,
  ) => SubschemaConfig;
  onSubgraphExecute: ReturnType<typeof getOnSubgraphExecute>;
}

export function handleFederationSubschema({
  subschemaConfig,
  unifiedGraphDirectives,
  realSubgraphNameMap,
  additionalTypeDefs,
  stitchingDirectivesTransformer,
  onSubgraphExecute,
}: HandleFederationSubschemaOpts) {
  // Fix name
  const subgraphName =
    (subschemaConfig.name =
      realSubgraphNameMap?.get(subschemaConfig.name || '') ||
      subschemaConfig.name) || '';
  const subgraphDirectives = getDirectiveExtensions<{
    transport: TransportEntry;
    [key: string]: any;
  }>(subschemaConfig.schema);

  // We need to add subgraph specific directives from supergraph to the subgraph schema
  // So the executor can use it
  const directivesToLook = unifiedGraphDirectives || subgraphDirectives;
  for (const directiveName in directivesToLook) {
    if (
      !subgraphDirectives[directiveName]?.length &&
      unifiedGraphDirectives?.[directiveName]?.length
    ) {
      const directives = unifiedGraphDirectives[directiveName];
      for (const directive of directives) {
        if (directive.subgraph && directive.subgraph !== subgraphName) {
          continue;
        }
        subgraphDirectives[directiveName] ||= [];
        subgraphDirectives[directiveName].push(directive);
      }
    }
  }
  const subgraphExtensions: Record<string, unknown> =
    (subschemaConfig.schema.extensions ||= {});
  subgraphExtensions['directives'] = subgraphDirectives;

  interface TypeDirectives {
    source: SourceDirective;
    [key: string]: any;
  }
  interface ArgDirectives {
    source: SourceDirective;
    [key: string]: any;
  }
  interface FieldDirectives {
    additionalField: {};
    merge: {};
    resolveTo: YamlConfig.AdditionalStitchingResolverObject;
    source: SourceDirective;
    hoist: any;
    [key: string]: any;
  }
  interface SourceDirective {
    subgraph: string;
    name?: string;
    type?: string;
  }
  const renameTypeNames: Record<string, string> = {};
  const renameTypeNamesReversed: Record<string, string> = {};
  const renameFieldByObjectTypeNames: Record<
    string,
    Record<string, string>
  > = {};
  const renameFieldByInputTypeNames: Record<
    string,
    Record<string, string>
  > = {};
  const renameFieldByInterfaceTypeNames: Record<
    string,
    Record<string, string>
  > = {};
  const renameEnumValueByEnumTypeNames: Record<
    string,
    Record<string, string>
  > = {};
  const renameFieldByTypeNamesReversed: Record<
    string,
    Record<string, string>
  > = {};
  const renameArgByFieldByTypeNames: Record<
    string,
    Record<string, Record<string, string>>
  > = {};
  const transforms: Transform[] = (subschemaConfig.transforms ||= []);
  const entitiesWithKeys = new Set<[string, string[]]>();
  let mergeDirectiveUsed = false;
  subschemaConfig.schema = mapSchema(subschemaConfig.schema, {
    [MapperKind.TYPE]: (type) => {
      const typeDirectives = getDirectiveExtensions<TypeDirectives>(type);
      const keyDirectives = typeDirectives['key'];
      const keys: string[] = [];
      if (keyDirectives?.length) {
        for (const keyDirective of keyDirectives) {
          const fields = keyDirective.fields;
          if (fields) {
            keys.push(fields);
          }
        }
        entitiesWithKeys.add([type.name, keys]);
      }
      const sourceDirectives = typeDirectives.source;
      const sourceDirective = sourceDirectives?.find((directive) =>
        compareSubgraphNames(directive.subgraph, subgraphName),
      );
      if (sourceDirective != null) {
        const realName = sourceDirective.name || type.name;
        if (type.name !== realName) {
          renameTypeNames[realName] = type.name;
          renameTypeNamesReversed[type.name] = realName;
          return new (Object.getPrototypeOf(type).constructor)({
            ...type.toConfig(),
            name: realName,
          });
        }
      }
    },
    [MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName, schema) => {
      const fieldDirectives =
        getDirectiveExtensions<FieldDirectives>(fieldConfig);
      if (fieldDirectives.merge?.length) {
        mergeDirectiveUsed = true;
      }
      const resolveToDirectives = fieldDirectives.resolveTo;
      if (resolveToDirectives?.length) {
        const type = schema.getType(typeName);
        if (!isObjectType(type)) {
          throw new Error(
            `Type ${typeName} for field ${fieldName} is not an object type`,
          );
        }
        const fieldMap = type.getFields();
        const field = fieldMap[fieldName];
        if (!field) {
          throw new Error(`Field ${typeName}.${fieldName} not found`);
        }
        additionalTypeDefs.push({
          kind: Kind.DOCUMENT,
          definitions: [
            {
              kind: Kind.OBJECT_TYPE_DEFINITION,
              name: { kind: Kind.NAME, value: typeName },
              fields: [astFromField(field, schema)],
            },
          ],
        });
      }
      const additionalFieldDirectives = fieldDirectives.additionalField;
      if (additionalFieldDirectives?.length) {
        return null;
      }
      const sourceDirectives = fieldDirectives.source;
      const sourceDirective = sourceDirectives?.find((directive) =>
        compareSubgraphNames(directive.subgraph, subgraphName),
      );
      const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
      const realName = sourceDirective?.name ?? fieldName;
      if (fieldName !== realName) {
        if (!renameFieldByObjectTypeNames[realTypeName]) {
          renameFieldByObjectTypeNames[realTypeName] = {};
        }
        renameFieldByObjectTypeNames[realTypeName][realName] = fieldName;
        if (!renameFieldByTypeNamesReversed[realTypeName]) {
          renameFieldByTypeNamesReversed[realTypeName] = {};
        }
        renameFieldByTypeNamesReversed[realTypeName][fieldName] = realName;
      }
      const hoistDirectives = fieldDirectives.hoist;
      if (hoistDirectives?.length) {
        for (const hoistDirective of hoistDirectives) {
          if (hoistDirective.subgraph === subgraphName) {
            const pathConfig: {
              fieldName: string;
              argFilter?: (arg: GraphQLArgument) => boolean;
            }[] = hoistDirective.pathConfig.map((annotation: any) => {
              if (typeof annotation === 'string') {
                return {
                  fieldName: annotation,
                  argFilter: () => true,
                };
              }
              return {
                fieldName: annotation.fieldName,
                argFilter: annotation.filterArgs
                  ? (arg: any) => !annotation.filterArgs.includes(arg.name)
                  : () => true,
              };
            });
            transforms.push(
              new HoistField(realTypeName, pathConfig, fieldName),
              new PruneSchema(),
            );
          }
        }
      }
      const newArgs: GraphQLFieldConfigArgumentMap = {};
      if (fieldConfig.args) {
        for (const argName in fieldConfig.args) {
          const argConfig: GraphQLArgumentConfig = fieldConfig.args[argName]!;
          const argDirectives =
            getDirectiveExtensions<ArgDirectives>(argConfig);
          const argSourceDirectives = argDirectives.source;
          const argSourceDirective = argSourceDirectives?.find((directive) =>
            compareSubgraphNames(directive.subgraph, subgraphName),
          );
          if (argSourceDirective != null) {
            const realArgName = argSourceDirective.name ?? argName;
            newArgs[realArgName] = argConfig;
            if (realArgName !== argName) {
              if (!renameArgByFieldByTypeNames[realTypeName]) {
                renameArgByFieldByTypeNames[realTypeName] = {};
              }
              if (!renameArgByFieldByTypeNames[realTypeName][realName]) {
                renameArgByFieldByTypeNames[realTypeName][realName] = {};
              }
              renameArgByFieldByTypeNames[realTypeName][realName][realArgName] =
                argName;
            }
          } else {
            newArgs[argName] = argConfig;
          }
        }
      }
      let fieldType = fieldConfig.type;
      if (sourceDirective?.type) {
        const fieldTypeNode = parseTypeNodeWithRenames(
          sourceDirective.type,
          renameTypeNames,
        );
        const newType = typeFromAST(subschemaConfig.schema, fieldTypeNode);
        if (!newType) {
          throw new Error(
            `Type ${sourceDirective.type} for field ${typeName}.${fieldName} is not defined in the schema`,
          );
        }
        if (!isOutputType(newType)) {
          throw new Error(
            `Type ${sourceDirective.type} for field ${typeName}.${fieldName} is not an output type`,
          );
        }
        fieldType = newType;
      }
      return [
        realName,
        {
          ...fieldConfig,
          type: fieldType,
          args: newArgs,
        },
      ];
    },
    [MapperKind.INPUT_OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
      const fieldDirectives =
        getDirectiveExtensions<FieldDirectives>(fieldConfig);
      const sourceDirectives = fieldDirectives.source;
      const sourceDirective = sourceDirectives?.find((directive) =>
        compareSubgraphNames(directive.subgraph, subgraphName),
      );
      if (sourceDirective != null) {
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        const realName = sourceDirective.name ?? fieldName;
        if (fieldName !== realName) {
          if (!renameFieldByInputTypeNames[realTypeName]) {
            renameFieldByInputTypeNames[realTypeName] = {};
          }
          renameFieldByInputTypeNames[realTypeName][realName] = fieldName;
        }
        return [realName, fieldConfig];
      }
      const additionalFieldDirectives = fieldDirectives.additionalField;
      if (additionalFieldDirectives?.length) {
        return null;
      }
      return undefined;
    },
    [MapperKind.INTERFACE_FIELD]: (
      fieldConfig,
      fieldName,
      typeName,
      schema,
    ) => {
      const fieldDirectives =
        getDirectiveExtensions<FieldDirectives>(fieldConfig);
      const resolveToDirectives = fieldDirectives.resolveTo;
      if (resolveToDirectives?.length) {
        const type = schema.getType(typeName);
        if (!isInterfaceType(type)) {
          throw new Error(
            `Type ${typeName} for field ${fieldName} is not an object type`,
          );
        }
        const fieldMap = type.getFields();
        const field = fieldMap[fieldName];
        if (!field) {
          throw new Error(`Field ${typeName}.${fieldName} not found`);
        }
        additionalTypeDefs.push({
          kind: Kind.DOCUMENT,
          definitions: [
            {
              kind: Kind.INTERFACE_TYPE_DEFINITION,
              name: { kind: Kind.NAME, value: typeName },
              fields: [astFromField(field, schema)],
            },
          ],
        });
      }
      const additionalFieldDirectives = fieldDirectives.additionalField;
      if (additionalFieldDirectives?.length) {
        return null;
      }
      const sourceDirectives = fieldDirectives.source;
      const sourceDirective = sourceDirectives?.find((directive) =>
        compareSubgraphNames(directive.subgraph, subgraphName),
      );
      if (sourceDirective != null) {
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        const realName = sourceDirective.name ?? fieldName;
        if (fieldName !== realName) {
          if (!renameFieldByInterfaceTypeNames[realTypeName]) {
            renameFieldByInterfaceTypeNames[realTypeName] = {};
          }
          renameFieldByInterfaceTypeNames[realTypeName][realName] = fieldName;
        }
        return [realName, fieldConfig];
      }
      return undefined;
    },
    [MapperKind.ENUM_VALUE]: (
      enumValueConfig,
      typeName,
      _schema,
      externalValue,
    ) => {
      const enumDirectives = getDirectiveExtensions<{
        source: SourceDirective;
      }>(enumValueConfig);
      const sourceDirectives = enumDirectives.source;
      const sourceDirective = sourceDirectives?.find((directive) =>
        compareSubgraphNames(directive.subgraph, subgraphName),
      );
      if (sourceDirective != null) {
        const realValue = sourceDirective.name ?? externalValue;
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        if (externalValue !== realValue) {
          if (!renameEnumValueByEnumTypeNames[realTypeName]) {
            renameEnumValueByEnumTypeNames[realTypeName] = {};
          }
          renameEnumValueByEnumTypeNames[realTypeName][realValue] =
            externalValue;
        }
        return [
          realValue,
          {
            ...enumValueConfig,
            value: realValue,
          },
        ];
      }
      return undefined;
    },
  });
  if (Object.keys(renameTypeNames).length > 0) {
    transforms.push(
      new RenameTypes((typeName) => renameTypeNames[typeName] || typeName),
    );
  }
  if (Object.keys(renameFieldByObjectTypeNames).length > 0) {
    transforms.push(
      new RenameObjectFields((typeName, fieldName, _fieldConfig) => {
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        return (
          renameFieldByObjectTypeNames[realTypeName]?.[fieldName] ?? fieldName
        );
      }),
    );
  }
  if (Object.keys(renameFieldByInputTypeNames).length > 0) {
    transforms.push(
      new RenameInputObjectFields((typeName, fieldName, _fieldConfig) => {
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        return (
          renameFieldByInputTypeNames[realTypeName]?.[fieldName] ?? fieldName
        );
      }),
    );
  }
  if (Object.keys(renameFieldByInterfaceTypeNames).length > 0) {
    transforms.push(
      new RenameInterfaceFields((typeName, fieldName, _fieldConfig) => {
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        return (
          renameFieldByInterfaceTypeNames[realTypeName]?.[fieldName] ??
          fieldName
        );
      }),
    );
  }
  if (Object.keys(renameEnumValueByEnumTypeNames).length > 0) {
    transforms.push(
      new TransformEnumValues((typeName, externalValue, enumValueConfig) => {
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        const realValue =
          renameEnumValueByEnumTypeNames[realTypeName]?.[
            enumValueConfig.value || externalValue
          ] ?? enumValueConfig.value;
        return [
          realValue,
          {
            ...enumValueConfig,
            value: realValue,
          },
        ];
      }),
    );
  }
  if (Object.keys(renameArgByFieldByTypeNames).length > 0) {
    transforms.push(
      new RenameObjectFieldArguments((typeName, fieldName, argName) => {
        const realTypeName = renameTypeNamesReversed[typeName] ?? typeName;
        const realFieldName =
          renameFieldByTypeNamesReversed[realTypeName]?.[fieldName] ??
          fieldName;
        return (
          renameArgByFieldByTypeNames[realTypeName]?.[realFieldName]?.[
            argName
          ] ?? argName
        );
      }),
    );
  }
  if (mergeDirectiveUsed) {
    const existingMergeConfig = subschemaConfig.merge || {};
    subschemaConfig.merge = {};
    // Workaround because transformer needs the directive definition itself
    const subgraphSchemaConfig = subschemaConfig.schema.toConfig();
    subschemaConfig.schema = new GraphQLSchema({
      ...subgraphSchemaConfig,
      directives: [...subgraphSchemaConfig.directives, mergeDirective],
      assumeValid: true,
    });

    subschemaConfig.merge = Object.assign(
      existingMergeConfig,
      stitchingDirectivesTransformer(subschemaConfig).merge,
    );
    const queryType = subschemaConfig.schema.getQueryType();
    if (!queryType) {
      throw new Error('Query type is required');
    }
    // Transformer doesn't respect transforms
    if (transforms.length && subschemaConfig.merge) {
      const subschemaConfigMerge = subschemaConfig.merge;
      const mergeConfig: Record<
        string,
        MergedTypeConfig<any, any, Record<string, any>>
      > = {};
      for (const realTypeName in subschemaConfig.merge) {
        const renamedTypeName = renameTypeNames[realTypeName] ?? realTypeName;
        mergeConfig[renamedTypeName] = subschemaConfigMerge[realTypeName]!;
        const realQueryFieldName = mergeConfig[renamedTypeName].fieldName;
        if (realQueryFieldName) {
          mergeConfig[renamedTypeName].fieldName =
            renameFieldByObjectTypeNames[queryType.name]?.[
              realQueryFieldName
            ] ?? realQueryFieldName;
        }
        mergeConfig[renamedTypeName].entryPoints = subschemaConfigMerge[
          realTypeName
        ]?.entryPoints?.map((entryPoint) => ({
          ...entryPoint,
          fieldName:
            entryPoint.fieldName &&
            (renameFieldByObjectTypeNames[queryType.name]?.[
              entryPoint.fieldName
            ] ??
              entryPoint.fieldName),
        }));
      }
      subschemaConfig.merge = mergeConfig;
    }
  }
  for (const [entityName, keys] of entitiesWithKeys) {
    const mergeConfig = (subschemaConfig.merge ||= {});
    const entryPoints = keys.map((key) => ({
      selectionSet: `{ ${key} }`,
    }));
    if (entryPoints.length > 1) {
      mergeConfig[entityName] ||= {
        entryPoints,
      };
    } else {
      mergeConfig[entityName] = entryPoints[0] || {
        selectionSet: `{ __typename }`,
      };
    }
  }
  subschemaConfig.executor = function subschemaExecutor(req) {
    return onSubgraphExecute(subgraphName, req);
  };

  return subschemaConfig;
}

const mergeDirective = new GraphQLDirective({
  name: 'merge',
  isRepeatable: true,
  locations: [DirectiveLocation.FIELD],
  args: {
    subgraph: {
      type: GraphQLString,
    },
    key: {
      type: GraphQLString,
    },
    keyField: {
      type: GraphQLString,
    },
    keyArg: {
      type: GraphQLString,
    },
    argsExpr: {
      type: GraphQLString,
    },
  },
});

function parseTypeNodeWithRenames(
  typeString: string,
  renameTypeNames: Record<string, string>,
) {
  const typeNode = parseType(typeString);
  return visit(typeNode, {
    NamedType: (node) => {
      const realName = renameTypeNames[node.name.value] ?? node.name.value;
      return {
        ...node,
        name: {
          ...node.name,
          value: realName,
        },
      };
    },
  });
}
