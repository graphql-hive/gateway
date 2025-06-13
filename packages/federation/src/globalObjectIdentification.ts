import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { StitchingInfo, SubschemaConfig } from '@graphql-tools/delegate';
import { IResolvers, parseSelectionSet } from '@graphql-tools/utils';
import {
  DefinitionNode,
  FieldDefinitionNode,
  GraphQLList,
  GraphQLObjectType,
  InterfaceTypeDefinitionNode,
  isObjectType,
  Kind,
  ObjectTypeExtensionNode,
  SelectionSetNode,
} from 'graphql';
import { fromGlobalId, toGlobalId } from 'graphql-relay';
import { isMergedEntityConfig, MergedEntityConfig } from './supergraph';

export interface GlobalObjectIdentificationOptions {
  nodeIdField: string;
  subschemas: SubschemaConfig[];
}

export function createNodeDefinitions({
  nodeIdField,
  subschemas,
}: GlobalObjectIdentificationOptions) {
  const defs: DefinitionNode[] = [];

  // nodeId: ID

  const nodeIdFieldDef: FieldDefinitionNode = {
    kind: Kind.FIELD_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: nodeIdField,
    },
    description: {
      kind: Kind.STRING,
      value:
        'A globally unique identifier. Can be used in various places throughout the system to identify this single value.',
    },
    type: {
      kind: Kind.NON_NULL_TYPE,
      type: {
        kind: Kind.NAMED_TYPE,
        name: {
          kind: Kind.NAME,
          value: 'ID',
        },
      },
    },
  };

  // interface Node

  const nodeInterfaceDef: InterfaceTypeDefinitionNode = {
    kind: Kind.INTERFACE_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: 'Node',
    },
    fields: [nodeIdFieldDef],
  };

  defs.push(nodeInterfaceDef);

  // extend type X implements Node

  for (const { typeName } of getDistinctEntities(subschemas)) {
    const typeExtensionDef: ObjectTypeExtensionNode = {
      kind: Kind.OBJECT_TYPE_EXTENSION,
      name: {
        kind: Kind.NAME,
        value: typeName,
      },
      interfaces: [
        {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: 'Node',
          },
        },
      ],
      fields: [nodeIdFieldDef],
    };
    defs.push(typeExtensionDef);
  }

  // extend type Query { nodeId: ID! }

  const queryExtensionDef: ObjectTypeExtensionNode = {
    kind: Kind.OBJECT_TYPE_EXTENSION,
    name: {
      kind: Kind.NAME,
      value: 'Query',
    },
    fields: [
      {
        kind: Kind.FIELD_DEFINITION,
        name: {
          kind: Kind.NAME,
          value: 'node',
        },
        description: {
          kind: Kind.STRING,
          value: 'Fetches an object given its globally unique `ID`.',
        },
        type: {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: 'Node',
          },
        },
        arguments: [
          {
            kind: Kind.INPUT_VALUE_DEFINITION,
            name: {
              kind: Kind.NAME,
              value: nodeIdField,
            },
            description: {
              kind: Kind.STRING,
              value: 'The globally unique `ID`.',
            },
            type: {
              kind: Kind.NON_NULL_TYPE,
              type: {
                kind: Kind.NAMED_TYPE,
                name: {
                  kind: Kind.NAME,
                  value: 'ID',
                },
              },
            },
          },
        ],
      },
    ],
  };

  defs.push(queryExtensionDef);

  return defs;
}

export function createResolvers({
  nodeIdField,
  subschemas,
}: GlobalObjectIdentificationOptions): IResolvers {
  const types = getDistinctEntities(subschemas);
  return {
    ...types.reduce(
      (resolvers, { typeName, merge, keyFieldNames }) => ({
        ...resolvers,
        [typeName]: {
          [nodeIdField]: {
            selectionSet: merge.selectionSet,
            resolve(source) {
              if (keyFieldNames.length === 1) {
                // single field key
                return toGlobalId(typeName, source[keyFieldNames[0]!]);
              }
              // multiple fields key
              const keyFields: Record<string, unknown> = {};
              for (const fieldName of keyFieldNames) {
                // loop is faster than reduce
                keyFields[fieldName] = source[fieldName];
              }
              return toGlobalId(typeName, JSON.stringify(keyFields));
            },
          },
        },
      }),
      {} as Record<string, IResolvers>,
    ),
    Query: {
      node(_source, { nodeId }, context, info) {
        const stitchingInfo = info.schema.extensions?.['stitchingInfo'] as
          | StitchingInfo
          | undefined;
        if (!stitchingInfo) {
          return null; // no stitching info, something went wrong // TODO: throw instead?
        }

        // we must use otherwise different schema
        const types = getDistinctEntities(stitchingInfo.subschemaMap.values());

        const { id: idOrFields, type: typeName } = fromGlobalId(nodeId);
        const type = types.find((t) => t.typeName === typeName);
        if (!type) {
          return null; // unknown type
        }

        const keyFields: Record<string, unknown> = {};
        if (type.keyFieldNames.length === 1) {
          // single field key
          keyFields[type.keyFieldNames[0]!] = idOrFields;
        } else {
          // multiple fields key
          try {
            const idFields = JSON.parse(idOrFields);
            for (const fieldName of type.keyFieldNames) {
              // loop is faster than reduce
              keyFields[fieldName] = idFields[fieldName];
            }
          } catch {
            return null; // invalid JSON i.e. invalid global ID
          }
        }

        return batchDelegateToSchema({
          context,
          info,
          schema: type.subschema,
          fieldName: type.merge.fieldName,
          argsFromKeys: type.merge.argsFromKeys,
          key: { ...keyFields, __typename: typeName }, // we already have all the necessary keys
          returnType: new GraphQLList(
            // wont ever be undefined, we ensured the subschema has the type above
            type.subschema.schema.getType(typeName) as GraphQLObjectType,
          ),
          dataLoaderOptions: type.merge.dataLoaderOptions,
        });
      },
    },
  };
}

interface DistinctEntity {
  typeName: string;
  subschema: SubschemaConfig;
  merge: MergedEntityConfig;
  keyFieldNames: string[];
}

function getDistinctEntities(
  subschemasIter: Iterable<SubschemaConfig>,
): DistinctEntity[] {
  const distinctEntities: DistinctEntity[] = [];

  const subschemas = Array.from(subschemasIter);
  const types = subschemas.flatMap((subschema) =>
    Object.values(subschema.schema.getTypeMap()),
  );

  const objects = types.filter(isObjectType);
  for (const obj of objects) {
    if (
      distinctEntities.find(
        (distinctType) => distinctType.typeName === obj.name,
      )
    ) {
      // already added this type
      continue;
    }
    let candidate: {
      subschema: SubschemaConfig;
      merge: MergedEntityConfig;
    } | null = null;
    for (const subschema of subschemas) {
      const merge = subschema.merge?.[obj.name];
      if (!merge) {
        // not resolvable from this subschema
        continue;
      }
      if (!isMergedEntityConfig(merge)) {
        // not a merged entity config, cannot be resolved globally
        continue;
      }
      if (merge.canonical) {
        // this subschema is canonical (owner) for this type, no need to check other schemas
        candidate = { subschema, merge };
        break;
      }
      if (!candidate) {
        // first merge candidate
        candidate = { subschema, merge };
        continue;
      }
      if (merge.selectionSet.length < candidate.merge.selectionSet.length) {
        // found a better candidate
        candidate = { subschema, merge };
      }
    }
    if (!candidate) {
      // no merge candidate found, cannot be resolved globally
      continue;
    }
    // is an entity that can efficiently be resolved globally
    distinctEntities.push({
      ...candidate,
      typeName: obj.name,
      keyFieldNames: (function getRootFieldNames(
        selectionSet: SelectionSetNode,
      ): string[] {
        const fieldNames: string[] = [];
        for (const sel of selectionSet.selections) {
          if (sel.kind === Kind.FRAGMENT_SPREAD) {
            throw new Error('Fragment spreads cannot appear in @key fields');
          }
          if (sel.kind === Kind.INLINE_FRAGMENT) {
            fieldNames.push(...getRootFieldNames(sel.selectionSet));
            continue;
          }
          // Kind.FIELD
          fieldNames.push(sel.alias?.value || sel.name.value);
        }
        return fieldNames;
      })(parseSelectionSet(candidate.merge.selectionSet)),
    });
  }

  return distinctEntities;
}
