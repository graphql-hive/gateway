import {
  defaultMergedResolver,
  isSubschemaConfig,
  StitchingInfo,
  Subschema,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import {
  applyExtensions,
  mergeExtensions,
  mergeResolvers,
} from '@graphql-tools/merge';
import {
  addResolversToSchema,
  assertResolversPresent,
  extendResolversFromInterfaces,
} from '@graphql-tools/schema';
import { inspect, IResolvers } from '@graphql-tools/utils';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import {
  extendSchema,
  getNamedType,
  GraphQLDirective,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLSchema,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isSpecifiedDirective,
  specifiedDirectives,
} from 'graphql';
import { resolveLocalFieldResult } from './resolveLocalFieldResult.js';
import {
  addStitchingInfo,
  completeStitchingInfo,
  createStitchingInfo,
} from './stitchingInfo.js';
import {
  isolateComputedFieldsTransformer,
  splitMergedTypeEntryPointsTransformer,
} from './subschemaConfigTransforms/index.js';
import { buildTypeCandidates, buildTypes } from './typeCandidates.js';
import {
  IStitchSchemasOptions,
  MergeTypeCandidate,
  SubschemaConfigTransform,
} from './types.js';

export function stitchSchemas<
  TContext extends Record<string, any> = Record<string, any>,
>({
  subschemas = [],
  types = [],
  typeDefs = [],
  onTypeConflict,
  mergeTypes = true,
  typeMergingOptions,
  subschemaConfigTransforms = [],
  resolvers = {},
  inheritResolversFromInterfaces = false,
  resolverValidationOptions = {},
  updateResolversInPlace = true,
  schemaExtensions,
  ...rest
}: IStitchSchemasOptions<TContext>): GraphQLSchema {
  const mergeDirectives = rest.mergeDirectives ?? true;
  const transformedSubschemas: Array<Subschema<any, any, any, TContext>> = [];
  const subschemaMap: Map<
    GraphQLSchema | SubschemaConfig<any, any, any, TContext>,
    Subschema<any, any, any, TContext>
  > = new Map();
  const originalSubschemaMap: Map<
    Subschema<any, any, any, TContext>,
    GraphQLSchema | SubschemaConfig<any, any, any, TContext>
  > = new Map();

  for (const subschema of subschemas) {
    for (const transformedSubschemaConfig of applySubschemaConfigTransforms(
      subschemaConfigTransforms,
      subschema,
      subschemaMap,
      originalSubschemaMap,
    )) {
      transformedSubschemas.push(transformedSubschemaConfig);
    }
  }

  const directiveMap: Record<string, GraphQLDirective> = Object.create(null);
  for (const directive of specifiedDirectives) {
    directiveMap[directive.name] = directive;
  }
  const schemaDefs = Object.create(null);

  const [typeCandidates, rootTypeNameMap, extensions] = buildTypeCandidates({
    subschemas: transformedSubschemas,
    originalSubschemaMap,
    types,
    typeDefs: typeDefs || [],
    parseOptions: rest,
    directiveMap,
    schemaDefs,
    mergeDirectives,
  });

  let stitchingInfo = createStitchingInfo(
    subschemaMap,
    typeCandidates,
    mergeTypes,
  );

  const { typeMap: newTypeMap, directives: newDirectives } = buildTypes({
    typeCandidates,
    directives: Object.values(directiveMap),
    stitchingInfo,
    rootTypeNames: Object.values(rootTypeNameMap),
    onTypeConflict,
    mergeTypes,
    typeMergingOptions,
  });

  if (!mergeDirectives) {
    stripCustomDirectiveUsages(Object.values(newTypeMap));
  }

  let schema = new GraphQLSchema({
    query: newTypeMap[rootTypeNameMap.query] as GraphQLObjectType,
    mutation: newTypeMap[rootTypeNameMap.mutation] as GraphQLObjectType,
    subscription: newTypeMap[rootTypeNameMap.subscription] as GraphQLObjectType,
    types: Object.values(newTypeMap),
    directives: newDirectives,
    astNode: schemaDefs.schemaDef,
    extensionASTNodes: schemaDefs.schemaExtensions,
    extensions: null,
    assumeValid: rest.assumeValid,
  });

  for (const extension of extensions) {
    schema = extendSchema(schema, extension, {
      commentDescriptions: true,
    } as any);
  }

  // We allow passing in an array of resolver maps, in which case we merge them
  const resolverMap: IResolvers = mergeResolvers(resolvers);

  const finalResolvers = inheritResolversFromInterfaces
    ? extendResolversFromInterfaces(schema, resolverMap)
    : resolverMap;

  stitchingInfo = completeStitchingInfo(stitchingInfo, finalResolvers, schema);

  addLocalFieldResolvers(schema, finalResolvers, stitchingInfo, typeCandidates);

  schema = addResolversToSchema({
    schema,
    defaultFieldResolver: defaultMergedResolver,
    resolvers: finalResolvers,
    resolverValidationOptions,
    inheritResolversFromInterfaces: false,
    updateResolversInPlace,
  });

  const resolverValidationOptionsEntries = Object.entries(
    resolverValidationOptions,
  );

  if (
    resolverValidationOptionsEntries.length > 0 &&
    resolverValidationOptionsEntries.some(([, o]) => o !== 'ignore')
  ) {
    assertResolversPresent(schema, resolverValidationOptions);
  }

  addStitchingInfo(schema, stitchingInfo);

  if (schemaExtensions) {
    if (Array.isArray(schemaExtensions)) {
      schemaExtensions = mergeExtensions(schemaExtensions);
    }
    applyExtensions(schema, schemaExtensions);
  }

  return schema;
}

function stripCustomDirectiveUsages(types: GraphQLNamedType[]): void {
  const isBuiltin = (d: { name: { value: string } }) =>
    isSpecifiedDirective(
      // @ts-expect-error it's ok to use just the name, isSpecifiedDirective does the same internally
      { name: d.name.value },
    );

  for (const type of types) {
    if (type.astNode?.directives?.length) {
      type.astNode = {
        ...type.astNode,
        directives: type.astNode.directives.filter(isBuiltin),
      };
    }
    if (isObjectType(type) || isInterfaceType(type)) {
      for (const field of Object.values(type.getFields())) {
        if (field.astNode?.directives?.length) {
          field.astNode = {
            ...field.astNode,
            directives: field.astNode.directives.filter(isBuiltin),
          };
        }
      }
    } else if (isInputObjectType(type)) {
      for (const field of Object.values(type.getFields())) {
        if (field.astNode?.directives?.length) {
          field.astNode = {
            ...field.astNode,
            directives: field.astNode.directives.filter(isBuiltin),
          };
        }
      }
    } else if (isEnumType(type)) {
      for (const value of type.getValues()) {
        if (value.astNode?.directives?.length) {
          value.astNode = {
            ...value.astNode,
            directives: value.astNode.directives.filter(isBuiltin),
          };
        }
      }
    }
  }
}

/**
 * Lets fields that are not provided by any subschema (introduced through the
 * `typeDefs` or `resolvers` options) return plain objects containing only the
 * key fields of a merged type; those get delegated to the owning subschema so
 * the rest of the fields resolve through regular type merging.
 */
function addLocalFieldResolvers<TContext extends Record<string, any>>(
  schema: GraphQLSchema,
  resolvers: IResolvers,
  stitchingInfo: StitchingInfo<TContext>,
  typeCandidates: Record<string, Array<MergeTypeCandidate<TContext>>>,
): void {
  const subschemaFields = new Set<string>();
  const localFields = new Map<string, Set<string>>();
  for (const typeName in typeCandidates) {
    for (const candidate of typeCandidates[typeName]!) {
      if (!isObjectType(candidate.type) && !isInterfaceType(candidate.type)) {
        continue;
      }
      const fieldNames = Object.keys(candidate.type.getFields());
      if (
        candidate.transformedSubschema != null ||
        candidate.subschema != null
      ) {
        for (const fieldName of fieldNames) {
          subschemaFields.add(`${typeName}.${fieldName}`);
        }
      } else {
        let fields = localFields.get(typeName);
        if (fields == null) {
          fields = new Set();
          localFields.set(typeName, fields);
        }
        for (const fieldName of fieldNames) {
          fields.add(fieldName);
        }
      }
    }
  }
  for (const typeName in resolvers) {
    const typeResolvers = resolvers[typeName];
    if (typeResolvers == null || typeof typeResolvers !== 'object') {
      continue;
    }
    let fields = localFields.get(typeName);
    if (fields == null) {
      fields = new Set();
      localFields.set(typeName, fields);
    }
    for (const fieldName in typeResolvers) {
      if (fieldName.startsWith('__')) {
        continue;
      }
      fields.add(fieldName);
    }
  }
  for (const [typeName, fieldNames] of localFields) {
    const type = schema.getType(typeName);
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }
    const fields = type.getFields();
    for (const fieldName of fieldNames) {
      const field = fields[fieldName];
      const existing = (
        resolvers[typeName] as Record<string, any> | undefined
      )?.[fieldName];
      if (
        field == null ||
        // subschema-owned fields keep their proxying resolver unless the user overrode it
        (existing == null && subschemaFields.has(`${typeName}.${fieldName}`))
      ) {
        continue;
      }
      const namedType = getNamedType(field.type);
      if (stitchingInfo.mergedTypes[namedType.name] == null) {
        continue;
      }
      const namedTypeResolvers = resolvers[namedType.name];
      const providedFields =
        namedTypeResolvers != null && typeof namedTypeResolvers === 'object'
          ? new Set(
              Object.keys(namedTypeResolvers).filter(
                (fieldName) => !fieldName.startsWith('__'),
              ),
            )
          : undefined;
      const originalResolve =
        typeof existing === 'function' ? existing : existing?.resolve;
      // keep defaultMergedResolver as the base: it annotates delegated results
      // as external objects on the way through, and falls back to plain
      // property access for local payloads anyway
      const baseResolve = originalResolve ?? defaultMergedResolver;
      const wrappedResolve = (
        parent: any,
        args: any,
        context: any,
        info: any,
      ) =>
        handleMaybePromise(
          () => baseResolve(parent, args, context, info),
          (result) =>
            resolveLocalFieldResult(
              result,
              context,
              info,
              stitchingInfo,
              providedFields,
            ),
        );
      if (existing != null && typeof existing === 'object') {
        existing.resolve = wrappedResolve;
      } else {
        ((resolvers[typeName] ||= {}) as Record<string, any>)[fieldName] =
          wrappedResolve;
      }
    }
  }
}

const subschemaConfigTransformerPresets: Array<SubschemaConfigTransform<any>> =
  [isolateComputedFieldsTransformer, splitMergedTypeEntryPointsTransformer];

function applySubschemaConfigTransforms<TContext = Record<string, any>>(
  subschemaConfigTransforms: Array<SubschemaConfigTransform<TContext>>,
  subschemaOrSubschemaConfig:
    | GraphQLSchema
    | SubschemaConfig<any, any, any, TContext>,
  subschemaMap: Map<
    GraphQLSchema | SubschemaConfig<any, any, any, TContext>,
    Subschema<any, any, any, TContext>
  >,
  originalSubschemaMap: Map<
    Subschema<any, any, any, TContext>,
    GraphQLSchema | SubschemaConfig<any, any, any, TContext>
  >,
): Array<Subschema<any, any, any, TContext>> {
  let subschemaConfig: SubschemaConfig<any, any, any, TContext>;
  if (isSubschemaConfig(subschemaOrSubschemaConfig)) {
    subschemaConfig = subschemaOrSubschemaConfig;
  } else if (subschemaOrSubschemaConfig instanceof GraphQLSchema) {
    subschemaConfig = { schema: subschemaOrSubschemaConfig };
  } else {
    throw new TypeError(
      'Received invalid input.' + inspect(subschemaOrSubschemaConfig),
    );
  }

  const transformedSubschemaConfigs = subschemaConfigTransforms
    .concat(subschemaConfigTransformerPresets)
    .reduce(
      (transformedSubschemaConfigs, subschemaConfigTransform) =>
        transformedSubschemaConfigs.flatMap((ssConfig) =>
          subschemaConfigTransform(ssConfig),
        ),
      [subschemaConfig],
    );

  const transformedSubschemas = transformedSubschemaConfigs.map(
    (ssConfig) => new Subschema<any, any, any, TContext>(ssConfig),
  );

  const baseSubschema = transformedSubschemas[0];

  subschemaMap.set(subschemaOrSubschemaConfig, baseSubschema!);

  for (const subschema of transformedSubschemas) {
    originalSubschemaMap.set(subschema, subschemaOrSubschemaConfig);
  }

  return transformedSubschemas;
}
