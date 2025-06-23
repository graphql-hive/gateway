import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import { StitchingInfo, SubschemaConfig } from '@graphql-tools/delegate';
import { IResolvers, parseSelectionSet } from '@graphql-tools/utils';
import {
  DefinitionNode,
  FieldDefinitionNode,
  GraphQLList,
  GraphQLObjectType,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  isInterfaceType,
  isObjectType,
  Kind,
  ObjectTypeExtensionNode,
  SelectionSetNode,
} from 'graphql';
import * as graphqlRelay from 'graphql-relay';
import { isMergedEntityConfig, MergedEntityConfig } from './supergraph';

export interface ResolvedGlobalId {
  /** The concrete type of the globally identifiable node. */
  type: string;
  /** The actual ID of the concrete type in the relevant source. */
  id: string;
}

export interface GlobalObjectIdentificationOptions {
  /**
   * The field name of the global ID on the Node interface.
   *
   * The `Node` interface defaults to `nodeId`, not `id`! It is intentionally not
   * `id` to avoid collisions with existing `id` fields in subgraphs.
   *
   * @default nodeId
   */
  nodeIdField?: string;
  /**
   * Takes a type name and an ID specific to that type name, and returns a
   * "global ID" that is unique among all types.
   *
   * Note that the global ID can contain a JSON stringified object which
   * contains multiple key fields needed to identify the object.
   *
   * @default import('graphql-relay').toGlobalId
   */
  toGlobalId?(type: string, id: string | number): string;
  /**
   * Takes the "global ID" created by toGlobalID, and returns the type name and ID
   * used to create it.
   *
   * @default import('graphql-relay').fromGlobalId
   */
  fromGlobalId?(globalId: string): ResolvedGlobalId;
}

export function createNodeDefinitions(
  subschemas: SubschemaConfig[],
  { nodeIdField = 'nodeId' }: GlobalObjectIdentificationOptions,
) {
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

  for (const { typeName, kind } of getDistinctEntities(subschemas)) {
    const typeExtensionDef:
      | ObjectTypeExtensionNode
      | InterfaceTypeExtensionNode = {
      kind:
        kind === 'object'
          ? Kind.OBJECT_TYPE_EXTENSION
          : Kind.INTERFACE_TYPE_EXTENSION,
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

export function createResolvers(
  subschemas: SubschemaConfig[],
  {
    nodeIdField = 'nodeId',
    fromGlobalId = graphqlRelay.fromGlobalId,
    toGlobalId = graphqlRelay.toGlobalId,
  }: GlobalObjectIdentificationOptions,
): IResolvers {
  // we can safely skip interfaces here because the concrete type will be known
  // when resolving and the type will always be an object
  //
  // the nodeIdField will ALWAYS be the global ID identifying the concrete object
  const types = getDistinctEntities(subschemas).filter(
    (t) => t.kind === 'object',
  );
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
      node(_source, args, context, info) {
        const stitchingInfo = info.schema.extensions?.['stitchingInfo'] as
          | StitchingInfo
          | undefined;
        if (!stitchingInfo) {
          return null; // no stitching info, something went wrong // TODO: throw instead?
        }

        // TODO: potential performance bottleneck, memoize
        const entities = getDistinctEntities(
          // the stitchingInfo.subschemaMap.values() is different from subschemas. it
          // contains the actual source of truth with all resolvers prepared - use it
          stitchingInfo.subschemaMap.values(),
        ).filter((t) => t.kind === 'object');

        const { id: idOrFields, type: typeName } = fromGlobalId(
          args[nodeIdField],
        );
        const entity = entities.find((t) => t.typeName === typeName);
        if (!entity) {
          return null; // unknown object type
        }

        const keyFields: Record<string, unknown> = {};
        if (entity.keyFieldNames.length === 1) {
          // single field key
          keyFields[entity.keyFieldNames[0]!] = idOrFields;
        } else {
          // multiple fields key
          try {
            const idFields = JSON.parse(idOrFields);
            for (const fieldName of entity.keyFieldNames) {
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
          schema: entity.subschema,
          fieldName: entity.merge.fieldName,
          argsFromKeys: entity.merge.argsFromKeys,
          key: { ...keyFields, __typename: typeName }, // we already have all the necessary keys
          returnType: new GraphQLList(
            // wont ever be undefined, we ensured the subschema has the type above
            entity.subschema.schema.getType(typeName) as GraphQLObjectType,
          ),
          dataLoaderOptions: entity.merge.dataLoaderOptions,
        });
      },
    },
  };
}

interface DistinctEntityInterface {
  kind: 'interface';
  typeName: string;
}

interface DistinctEntityObject {
  kind: 'object';
  typeName: string;
  subschema: SubschemaConfig;
  merge: MergedEntityConfig;
  keyFieldNames: string[];
}

type DistinctEntity = DistinctEntityObject | DistinctEntityInterface;

function getDistinctEntities(
  subschemasIter: Iterable<SubschemaConfig>,
): DistinctEntity[] {
  const distinctEntities: DistinctEntity[] = [];
  function entityExists(typeName: string): boolean {
    return distinctEntities.some(
      (distinctType) => distinctType.typeName === typeName,
    );
  }

  const subschemas = Array.from(subschemasIter);
  const types = subschemas.flatMap((subschema) =>
    Object.values(subschema.schema.getTypeMap()),
  );

  const objects = types.filter(isObjectType);
  for (const obj of objects) {
    if (entityExists(obj.name)) {
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
      kind: 'object',
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

  // object entities must exist in order to support interfaces
  if (distinctEntities.length) {
    const interfaces = types.filter(isInterfaceType);
    Interfaces: for (const inter of interfaces) {
      if (entityExists(inter.name)) {
        // already added this interface
        continue;
      }
      // check if this interface is implemented exclusively by the entity objects
      for (const subschema of subschemas) {
        const impls = subschema.schema.getImplementations(inter);
        if (impls.interfaces.length) {
          // this interface is implemented by other interfaces, we wont be handling those atm
          // TODO: handle interfaces that implement other interfaces
          continue Interfaces;
        }
        if (!impls.objects.every(({ name }) => entityExists(name))) {
          // implementing objects of this interface are not all distinct entities
          // i.e. some implementing objects don't have the node id field
          continue Interfaces;
        }
      }
      // all subschemas entities implement exclusively this interface
      distinctEntities.push({
        kind: 'interface',
        typeName: inter.name,
      });
    }
  }

  return distinctEntities;
}
