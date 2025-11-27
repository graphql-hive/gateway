import {
  MergedFieldConfig,
  MergedTypeConfig,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import {
  collectFields,
  filterSchema,
  getImplementingTypes,
  getRootTypeNames,
  parseSelectionSet,
} from '@graphql-tools/utils';
import { FilterTypes, TransformCompositeFields } from '@graphql-tools/wrap';
import {
  getNamedType,
  GraphQLInterfaceType,
  GraphQLNamedOutputType,
  GraphQLObjectType,
  GraphQLSchema,
  isAbstractType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  isScalarType,
  isUnionType,
} from 'graphql';

interface ComputedTypeConfig<
  K = any,
  V = any,
  TContext = Record<string, any>,
> extends MergedTypeConfig<K, V, TContext> {
  keyFieldNames: string[];
}

export function isolateComputedFieldsTransformer(
  subschemaConfig: SubschemaConfig,
): Array<SubschemaConfig> {
  if (subschemaConfig.merge == null) {
    return [subschemaConfig];
  }

  const baseSchemaTypes: Record<string, MergedTypeConfig> = Object.create(null);
  const isolatedSchemaTypes: Record<string, ComputedTypeConfig> =
    Object.create(null);

  for (const typeName in subschemaConfig.merge) {
    const mergedTypeConfig = subschemaConfig.merge[typeName]!;
    const objectType = subschemaConfig.schema.getType(
      typeName,
    ) as GraphQLObjectType;

    baseSchemaTypes[typeName] = mergedTypeConfig;
    if (mergedTypeConfig.fields) {
      const baseFields: Record<string, MergedFieldConfig> = Object.create(null);
      const isolatedFields: Record<string, MergedFieldConfig> =
        Object.create(null);

      for (const fieldName in mergedTypeConfig.fields) {
        const mergedFieldConfig = mergedTypeConfig.fields[fieldName];
        if (mergedFieldConfig?.computed && mergedFieldConfig?.selectionSet) {
          isolatedFields[fieldName] = mergedFieldConfig;
        } else if (mergedFieldConfig?.computed) {
          throw new Error(
            `A selectionSet is required for computed field "${typeName}.${fieldName}"`,
          );
        } else {
          baseFields[fieldName] = mergedFieldConfig!;
        }
      }

      const isolatedFieldCount = Object.keys(isolatedFields).length;

      if (
        isolatedFieldCount &&
        isolatedFieldCount !== Object.keys(objectType.getFields()).length
      ) {
        baseSchemaTypes[typeName] = {
          ...mergedTypeConfig,
          fields: baseFields,
        };
        const keyFieldNames =
          isolatedSchemaTypes[typeName]?.keyFieldNames ?? [];
        if (keyFieldNames.length === 0) {
          if (mergedTypeConfig.selectionSet) {
            const parsedSelectionSet = parseSelectionSet(
              mergedTypeConfig.selectionSet,
              { noLocation: true },
            );
            const keyFields = collectFields(
              subschemaConfig.schema,
              {},
              {},
              objectType,
              parsedSelectionSet,
            );
            keyFieldNames.push(...Array.from(keyFields.fields.keys()));
          }
          for (const entryPoint of mergedTypeConfig.entryPoints ?? []) {
            if (entryPoint.selectionSet) {
              const parsedSelectionSet = parseSelectionSet(
                entryPoint.selectionSet,
                { noLocation: true },
              );
              const keyFields = collectFields(
                subschemaConfig.schema,
                {},
                {},
                objectType,
                parsedSelectionSet,
              );
              keyFieldNames.push(...Array.from(keyFields.fields.keys()));
            }
          }
        }
        isolatedSchemaTypes[typeName] = {
          ...mergedTypeConfig,
          // there might already be key fields
          keyFieldNames,
          fields: {
            ...(isolatedSchemaTypes[typeName]?.fields ?? {}),
            ...isolatedFields,
          },
          canonical: undefined,
        };

        for (const fieldName in isolatedFields) {
          const returnType = getNamedType(
            objectType.getFields()[fieldName]?.type,
          );
          const returnTypes = [returnType] as GraphQLNamedOutputType[];

          // for interfaces and unions the implementations/members need to be handled as well
          if (isInterfaceType(returnType)) {
            returnTypes.push(
              ...getImplementingTypes(
                returnType.name,
                subschemaConfig.schema,
              ).map(
                (name) =>
                  subschemaConfig.schema.getType(
                    name,
                  )! as GraphQLNamedOutputType,
              ),
            );
          } else if (isUnionType(returnType)) {
            returnTypes.push(...returnType.getTypes());
          }

          for (const type of returnTypes) {
            const returnTypeMergeConfig = subschemaConfig.merge[type.name];

            // isolate the object type only if it's not accessible from other, non-isolated, objects' fields
            if (
              Object.values(subschemaConfig.schema.getTypeMap())
                .filter(isObjectType) // only objects
                .filter((t) => t !== type) // not this type
                .filter((t) => !isolatedSchemaTypes[t.name]) // not an isolated type
                .find((t) =>
                  Object.values(t.getFields()).find(
                    (f) => getNamedType(f.type) === type,
                  ),
                ) // has a field returning this type
            ) {
              continue;
            }

            if (isObjectType(type)) {
              const returnTypeSelectionSet =
                returnTypeMergeConfig?.selectionSet;
              if (returnTypeSelectionSet) {
                // this is a merged type, include the selection set
                const keyFieldNames: string[] = [];
                const parsedSelectionSet = parseSelectionSet(
                  returnTypeSelectionSet,
                  { noLocation: true },
                );
                const keyFields = collectFields(
                  subschemaConfig.schema,
                  {},
                  {},
                  type,
                  parsedSelectionSet,
                );
                keyFieldNames.push(...Array.from(keyFields.fields.keys()));
                for (const entryPoint of returnTypeMergeConfig.entryPoints ??
                  []) {
                  if (entryPoint.selectionSet) {
                    const parsedSelectionSet = parseSelectionSet(
                      entryPoint.selectionSet,
                      { noLocation: true },
                    );
                    const keyFields = collectFields(
                      subschemaConfig.schema,
                      {},
                      {},
                      type,
                      parsedSelectionSet,
                    );
                    keyFieldNames.push(...Array.from(keyFields.fields.keys()));
                  }
                }
                isolatedSchemaTypes[type.name] = {
                  ...returnTypeMergeConfig,
                  keyFieldNames,
                  fields: {
                    ...(isolatedSchemaTypes[type.name]?.fields ?? {}),
                  },
                };
              } else if (!returnTypeMergeConfig) {
                // this is an unmerged type, add all fields to the isolated schema
                const fields: Record<string, MergedFieldConfig> = {
                  ...isolatedSchemaTypes[type.name]?.fields,
                };
                if (isAbstractType(type)) {
                  for (const implementingType of getImplementingTypes(
                    type.name,
                    subschemaConfig.schema,
                  )) {
                    const implementingTypeFields =
                      isolatedSchemaTypes[implementingType]?.fields;
                    if (implementingTypeFields) {
                      for (const fieldName in implementingTypeFields) {
                        if (implementingTypeFields[fieldName]) {
                          fields[fieldName] = {
                            ...implementingTypeFields[fieldName],
                            ...fields[fieldName],
                          };
                        }
                      }
                    }
                  }
                }
                if (isInterfaceType(type) || isObjectType(type)) {
                  for (const fieldName in type.getFields()) {
                    fields[fieldName] ||= {};
                  }
                }
                isolatedSchemaTypes[type.name] = {
                  keyFieldNames: [],
                  fields,
                  canonical: true,
                };
              }
            }
          }
        }
      }
    }
  }

  if (Object.keys(isolatedSchemaTypes).length) {
    return [
      filterIsolatedSubschema(subschemaConfig, isolatedSchemaTypes),
      filterBaseSubschema(
        { ...subschemaConfig, merge: baseSchemaTypes },
        isolatedSchemaTypes,
      ),
    ];
  }
  return [subschemaConfig];
}

function _createCompositeFieldFilter(schema: GraphQLSchema) {
  // create TransformCompositeFields that will remove any field not in schema,
  const filteredFields: Record<string, Record<string, boolean>> = {};
  for (const typeName in schema.getTypeMap()) {
    const type = schema.getType(typeName);
    if (isObjectType(type) || isInterfaceType(type)) {
      const filteredFieldsOfType: Record<string, boolean> = {
        __typename: true,
      };
      let hasField = false;
      const fieldMap = type.getFields();
      for (const fieldName in fieldMap) {
        filteredFieldsOfType[fieldName] = true;
        hasField = true;
      }
      if (hasField) {
        filteredFields[typeName] = filteredFieldsOfType;
      }
    }
  }
  return new TransformCompositeFields(
    (typeName, fieldName) =>
      filteredFields[typeName]?.[fieldName] ? undefined : null,
    (typeName, fieldName) =>
      filteredFields[typeName]?.[fieldName] ? undefined : null,
  );
}

function isIsolatedField(
  typeName: string,
  fieldName: string,
  isolatedSchemaTypes: Record<string, ComputedTypeConfig>,
): boolean {
  const fieldConfig = isolatedSchemaTypes[typeName]?.fields?.[fieldName];
  if (fieldConfig) {
    return true;
  }
  return false;
}

function filterBaseSubschema(
  subschemaConfig: SubschemaConfig,
  isolatedSchemaTypes: Record<string, ComputedTypeConfig>,
): SubschemaConfig {
  const schema = subschemaConfig.schema;
  const typesForInterface: Record<string, string[]> = {};
  const iFacesForTypes: Record<string, string[]> = {};
  const filteredSchema = filterSchema({
    schema,
    objectFieldFilter: (typeName, fieldName) => {
      const iFacesForType = (iFacesForTypes[typeName] ||= []);
      if (!iFacesForType) {
        function addIface(iFace: GraphQLInterfaceType) {
          if (!iFacesForType.includes(iFace.name)) {
            iFacesForType.push(iFace.name);
            iFace.getInterfaces().forEach(addIface);
          }
        }
        const type = schema.getType(typeName) as GraphQLObjectType;
        let iFaces = type.getInterfaces();
        for (const iface of iFaces) {
          addIface(iface);
        }
      }
      const allTypes = [typeName, ...iFacesForType];
      const isIsolatedFieldName = allTypes.every((implementingTypeName) =>
        isIsolatedField(implementingTypeName, fieldName, isolatedSchemaTypes),
      );
      const isKeyFieldName = allTypes.some((implementingTypeName) =>
        (
          isolatedSchemaTypes[implementingTypeName]?.keyFieldNames ?? []
        ).includes(fieldName),
      );
      return !isIsolatedFieldName || isKeyFieldName;
    },
    interfaceFieldFilter: (typeName, fieldName) => {
      if (!typesForInterface[typeName]) {
        typesForInterface[typeName] = getImplementingTypes(typeName, schema);
      }
      const iFacesForType = (iFacesForTypes[typeName] ||= []);
      if (!iFacesForType) {
        function addIface(iFace: GraphQLInterfaceType) {
          if (!iFacesForType.includes(iFace.name)) {
            iFacesForType.push(iFace.name);
            iFace.getInterfaces().forEach(addIface);
          }
        }
        const type = schema.getType(typeName) as GraphQLObjectType;

        let iFaces = type.getInterfaces();
        for (const iface of iFaces) {
          addIface(iface);
        }
      }
      const allTypes = [
        typeName,
        ...iFacesForType,
        ...typesForInterface[typeName],
      ];
      const isIsolatedFieldName = allTypes.every((implementingTypeName) =>
        isIsolatedField(implementingTypeName, fieldName, isolatedSchemaTypes),
      );
      const isKeyFieldName = allTypes.some((implementingTypeName) =>
        (
          isolatedSchemaTypes[implementingTypeName]?.keyFieldNames ?? []
        ).includes(fieldName),
      );
      return !isIsolatedFieldName || isKeyFieldName;
    },
  });

  const filteredSubschema = {
    ...subschemaConfig,
    merge: subschemaConfig.merge
      ? {
          ...subschemaConfig.merge,
        }
      : undefined,
    transforms: (subschemaConfig.transforms ?? []).concat([
      _createCompositeFieldFilter(filteredSchema),
      new FilterTypes((type) => {
        // filter out empty types
        const typeName = type.name;
        const typeInFiltered = filteredSchema.getType(typeName);
        if (!typeInFiltered) {
          return false;
        }
        if (isObjectType(type) || isInterfaceType(type)) {
          return Object.keys(type.getFields()).length > 0;
        }
        return true;
      }),
    ]),
  };

  const remainingTypes = filteredSchema.getTypeMap();
  const mergeConfig = filteredSubschema.merge;
  if (mergeConfig) {
    for (const mergeType in mergeConfig) {
      if (!remainingTypes[mergeType]) {
        delete mergeConfig[mergeType];
      }
    }

    if (!Object.keys(mergeConfig).length) {
      delete filteredSubschema.merge;
    }
  }

  return filteredSubschema;
}

function filterIsolatedSubschema(
  subschemaConfig: SubschemaConfig,
  isolatedSchemaTypes: Record<string, ComputedTypeConfig>,
): SubschemaConfig {
  const computedFieldTypes: Record<string, boolean> = {};
  const queryRootFields: Record<string, boolean> = {};
  function listReachableTypesToIsolate(
    subschemaConfig: SubschemaConfig,
    type: GraphQLNamedOutputType,
    typeNames = new Set<string>(),
  ) {
    if (isScalarType(type)) {
      return typeNames;
    } else if (
      (isObjectType(type) || isInterfaceType(type)) &&
      subschemaConfig.merge?.[type.name]
    ) {
      // this is a merged type, no need to descend further
      typeNames.add(type.name);
      return typeNames;
    } else if (isCompositeType(type)) {
      typeNames.add(type.name);

      // descent into all field types potentially via interfaces implementations/unions members
      const types = new Set<GraphQLObjectType>();
      if (isObjectType(type)) {
        types.add(type);
      } else if (isInterfaceType(type)) {
        getImplementingTypes(type.name, subschemaConfig.schema).forEach(
          (name) =>
            types.add(
              subschemaConfig.schema.getType(name)! as GraphQLObjectType,
            ),
        );
      } else if (isUnionType(type)) {
        type.getTypes().forEach((t) => types.add(t));
      }

      for (const type of types) {
        typeNames.add(type.name);

        for (const f of Object.values(type.getFields())) {
          const fieldType = getNamedType(f.type);
          if (!typeNames.has(fieldType.name) && isCompositeType(fieldType)) {
            listReachableTypesToIsolate(subschemaConfig, fieldType, typeNames);
          }
        }
      }

      return typeNames;
    } else if (isUnionType(type)) {
      typeNames.add(type.name);
      type
        .getTypes()
        .forEach((t) =>
          listReachableTypesToIsolate(subschemaConfig, t, typeNames),
        );
      return typeNames;
    } else {
      return typeNames;
    }
  }

  const queryType = subschemaConfig.schema.getQueryType();
  for (const typeName in subschemaConfig.merge) {
    const mergedTypeConfig = subschemaConfig.merge[typeName];
    const entryPoints = mergedTypeConfig?.entryPoints ?? [mergedTypeConfig];
    const queryTypeFields = queryType?.getFields();
    for (const entryPoint of entryPoints) {
      if (entryPoint?.fieldName != null) {
        queryRootFields[entryPoint.fieldName] = true;
        const rootField = queryTypeFields?.[entryPoint.fieldName];
        if (rootField) {
          const rootFieldType = getNamedType(rootField.type);

          computedFieldTypes[rootFieldType.name] = true;
          if (isInterfaceType(rootFieldType)) {
            getImplementingTypes(
              rootFieldType.name,
              subschemaConfig.schema,
            ).forEach((tn) => {
              computedFieldTypes[tn] = true;
            });
          }
        }
      }
    }
    const computedFields = [
      ...Object.entries(mergedTypeConfig?.fields || {})
        .map(([k, v]) => (v.computed ? k : null))
        .filter((fn) => fn !== null),
    ].filter((fn) => !queryRootFields[fn!]);

    const type = subschemaConfig.schema.getType(typeName) as GraphQLObjectType;

    for (const fieldName of computedFields) {
      const fieldType = getNamedType(type.getFields()[fieldName]!.type);
      computedFieldTypes[fieldType.name] = true;
      listReachableTypesToIsolate(subschemaConfig, fieldType).forEach((tn) => {
        computedFieldTypes[tn] = true;
      });
    }
  }

  const rootTypeNames = getRootTypeNames(subschemaConfig.schema);
  const typesForInterface: Record<string, string[]> = {};
  const iFaceForTypes: Record<string, string[]> = {};
  const filteredSchema = filterSchema({
    schema: subschemaConfig.schema,
    rootFieldFilter: (typeName, fieldName, config) => {
      // if the field is a root field, it should be included
      if (rootTypeNames.has(typeName)) {
        // if this is a query field, we should check if it is a computed field
        if (queryType?.name === typeName) {
          if (queryRootFields[fieldName]) {
            return true;
          }
        } else {
          return true;
        }
      }
      const returnType = getNamedType(config.type);
      if (isAbstractType(returnType)) {
        const typesForInterface = [
          returnType.name,
          ...getImplementingTypes(returnType.name, subschemaConfig.schema),
        ];
        return typesForInterface.some((t) => computedFieldTypes[t] != null);
      }
      return computedFieldTypes[returnType.name] != null;
    },
    objectFieldFilter: (typeName, fieldName, config) => {
      if (computedFieldTypes[typeName]) {
        return true;
      }
      if (!iFaceForTypes[typeName]) {
        iFaceForTypes[typeName] = (
          subschemaConfig.schema.getType(typeName) as GraphQLObjectType
        )
          .getInterfaces()
          .map((iFace) => iFace.name);
      }
      if (iFaceForTypes[typeName].some((iFace) => computedFieldTypes[iFace])) {
        return true;
      }
      const fieldType = getNamedType(config.type);
      if (computedFieldTypes[fieldType.name]) {
        return true;
      }
      return (
        subschemaConfig.merge?.[typeName] == null ||
        subschemaConfig.merge[typeName]?.fields?.[fieldName] != null ||
        (isolatedSchemaTypes[typeName]?.keyFieldNames ?? []).includes(fieldName)
      );
    },
    interfaceFieldFilter: (typeName, fieldName, config) => {
      if (computedFieldTypes[typeName]) {
        return true;
      }
      const fieldType = getNamedType(config.type);
      if (computedFieldTypes[fieldType.name]) {
        return true;
      }
      if (!typesForInterface[typeName]) {
        typesForInterface[typeName] = getImplementingTypes(
          typeName,
          subschemaConfig.schema,
        );
      }
      if (typesForInterface[typeName].some((t) => computedFieldTypes[t])) {
        return true;
      }
      const isIsolatedFieldName =
        typesForInterface[typeName].some((implementingTypeName) =>
          isIsolatedField(implementingTypeName, fieldName, isolatedSchemaTypes),
        ) || subschemaConfig.merge?.[typeName]?.fields?.[fieldName] != null;
      const isComputedFieldType = typesForInterface[typeName].some(
        (implementingTypeName) => {
          if (computedFieldTypes[implementingTypeName]) {
            return true;
          }
          const type = subschemaConfig.schema.getType(
            implementingTypeName,
          ) as GraphQLObjectType;
          const field = type.getFields()[fieldName];
          if (field == null) {
            return false;
          }
          const fieldType = getNamedType(field.type);
          return computedFieldTypes[fieldType.name] != null;
        },
      );
      return (
        isIsolatedFieldName ||
        isComputedFieldType ||
        typesForInterface[typeName].some((implementingTypeName) =>
          (
            isolatedSchemaTypes?.[implementingTypeName]?.keyFieldNames ?? []
          ).includes(fieldName),
        ) ||
        (isolatedSchemaTypes[typeName]?.keyFieldNames ?? []).includes(fieldName)
      );
    },
  });
  const merge = Object.fromEntries(
    // get rid of keyFieldNames again
    Object.entries(isolatedSchemaTypes).map(
      ([typeName, { keyFieldNames, ...config }]) => [typeName, config],
    ),
  );

  const filteredSubschema = {
    ...subschemaConfig,
    merge,
    transforms: (subschemaConfig.transforms ?? []).concat([
      _createCompositeFieldFilter(filteredSchema),
    ]),
  };

  return filteredSubschema;
}
