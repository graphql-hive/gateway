import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { StitchingInfo, SubschemaConfig } from '@graphql-tools/delegate';
import { IResolvers } from '@graphql-tools/utils';
import {
  DefinitionNode,
  FieldDefinitionNode,
  GraphQLList,
  GraphQLObjectType,
  InterfaceTypeDefinitionNode,
  Kind,
  ObjectTypeExtensionNode,
} from 'graphql';
import { fromGlobalId, toGlobalId } from 'graphql-relay';
import { MergedTypeConfigFromEntities } from './supergraph';

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

  for (const { typeName } of getDistinctResolvableTypes(subschemas)) {
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
  const types = getDistinctResolvableTypes(subschemas).toArray();
  return {
    ...types.reduce(
      (resolvers, { typeName, keyFieldNames }) => ({
        ...resolvers,
        [typeName]: {
          [nodeIdField]: {
            selectionSet: `{ ${keyFieldNames.join(' ')} }`,
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
        const types = getDistinctResolvableTypes(
          stitchingInfo.subschemaMap.values(),
        );

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
          ...type.merge,
          info,
          context,
          schema: type.subschema,
          returnType: new GraphQLList(
            // wont ever be undefined, we ensured the subschema has the type above
            type.subschema.schema.getType(typeName) as GraphQLObjectType,
          ),
          selectionSet: undefined, // selectionSet is not needed here
          key: { ...keyFields, __typename: typeName }, // we already have all the necessary keys
        });
      },
    },
  };
}

function* getDistinctResolvableTypes(subschemas: Iterable<SubschemaConfig>) {
  const yieldedTypes = new Set<string>();
  for (const subschema of subschemas) {
    // TODO: respect canonical types
    for (const [typeName, merge] of Object.entries(subschema.merge || {})
      .filter(
        // make sure selectionset is defined for the sort to work
        ([, merge]) => merge.selectionSet,
      )
      .sort(
        // sort by shortest keys first
        ([, a], [, b]) => a.selectionSet!.length - b.selectionSet!.length,
      )) {
      if (yieldedTypes.has(typeName)) {
        // already yielded this type, all types can only have one resolution
        continue;
      }

      if (
        !merge.selectionSet ||
        !merge.argsFromKeys ||
        !merge.key ||
        !merge.fieldName ||
        !merge.dataLoaderOptions
      ) {
        // cannot be resolved globally
        continue;
      }

      // remove first and last characters from the selection set making up the key (curly braces, `{ id } -> id`)
      const key = merge.selectionSet.trim().slice(1, -1).trim();
      if (
        // the key for fetching this object contains other objects
        key.includes('{') ||
        // the key for fetching this object contains arguments
        key.includes('(') ||
        // the key contains aliases
        key.includes(':')
      ) {
        // it's too complex to use global object identification
        // TODO: do it anyways when need arises
        continue;
      }
      // what we're left in the "key" are simple field(s) like "id" or "email"

      yieldedTypes.add(typeName);
      yield {
        typeName,
        subschema,
        merge: merge as MergedTypeConfigFromEntities,
        keyFieldNames: key.trim().split(/\s+/),
      };
    }
  }
}
