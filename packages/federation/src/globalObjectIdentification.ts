import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { SubschemaConfig } from '@graphql-tools/delegate';
import { IResolvers } from '@graphql-tools/utils';
import {
  DefinitionNode,
  FieldDefinitionNode,
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

  for (const { typeName } of getResolveableTypes(subschemas)) {
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
  const types = getResolveableTypesMap(subschemas);
  return {
    Query: {
      node(_source, { nodeId }, context, info) {
        const { id, type: typeName } = fromGlobalId(nodeId);
        const { subschema, merge } = types[typeName] || {};
        if (!subschema || !merge) {
          return null;
        }
        const { key, selectionSet, ...batchOpts } = merge;
        return batchDelegateToSchema({
          ...batchOpts,
          schema: subschema,
          key: { __typename: typeName, id }, // TODO: use keys
          info,
          context,
          valuesFromResults: (results) =>
            // add the nodeId field to the results
            results.map((r: any) =>
              !r ? null : { ...r, [nodeIdField]: nodeId },
            ),
        });
      },
    },
    Account: {
      [nodeIdField](source) {
        return toGlobalId('Account', source.id); // TODO: use keys
      },
    },
  };
}

function* getResolveableTypes(subschemas: Iterable<SubschemaConfig>) {
  for (const subschema of subschemas) {
    for (const [typeName, merge] of Object.entries(subschema.merge || {})) {
      if (
        !merge.selectionSet ||
        !merge.argsFromKeys ||
        !merge.key ||
        !merge.fieldName ||
        !merge.dataLoaderOptions
      ) {
        continue;
      }
      // TODO: provide the best and shortest path type
      yield {
        typeName,
        subschema,
        merge: merge as MergedTypeConfigFromEntities,
      };
    }
  }
}

function getResolveableTypesMap(subschemas: Iterable<SubschemaConfig>) {
  const types: Record<
    string,
    { subschema: SubschemaConfig; merge: MergedTypeConfigFromEntities }
  > = {};
  for (const { typeName, merge, subschema } of getResolveableTypes(
    subschemas,
  )) {
    types[typeName] = { subschema, merge };
  }
  return types;
}
