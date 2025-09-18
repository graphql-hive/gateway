import { OBJECT_SUBSCHEMA_SYMBOL } from '@graphql-tools/delegate';
import {
  DirectableObject,
  getDirectiveExtensions,
  MapperKind,
  mapSchema,
  memoize1,
  parseSelectionSet,
} from '@graphql-tools/utils';
import { GraphQLError, GraphQLSchema, Kind, print, SelectionNode, TypeNode } from 'graphql';

export const getArgsFromKeysForFederation = memoize1(
  function getArgsFromKeysForFederation(representations: readonly any[]) {
    return { representations };
  },
);

function getAvailableKeys(
  data: any,
  selections: readonly SelectionNode[],
  typeName: string = data?.__typename,
): {
  keys: (string | symbol)[];
  keyMappings: Record<string, string>;
  keySelections: Record<string, readonly SelectionNode[]>;
} {
  const keys = ['__typename', OBJECT_SUBSCHEMA_SYMBOL];
  const keyMappings: Record<string, string> = {};
  const keySelections: Record<string, readonly SelectionNode[]> = {};
  for (const selection of selections) {
    if (selection.kind === Kind.FIELD) {
      const fieldName = selection.name.value;
      const responseKey = selection.alias?.value || selection.name.value;
      if (fieldName !== responseKey) {
        keyMappings[fieldName] = responseKey;
      }
      keys.push(fieldName);
      if (selection.selectionSet?.selections.length) {
        keySelections[responseKey] = selection.selectionSet.selections;
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (
        selection.typeCondition &&
        typeName != null &&
        typeName !== selection.typeCondition.name.value
      ) {
        continue;
      }
      if (selection.selectionSet.selections.length > 0) {
        const fragmentKeys = getAvailableKeys(data, selection.selectionSet.selections);
        for (const key of fragmentKeys.keys) {
          if (!keys.includes(key)) {
            keys.push(key);
          }
        }
        for (const [key, sel] of Object.entries(fragmentKeys.keySelections)) {
          if (keySelections[key]) {
            keySelections[key] = [
              ...keySelections[key],
              ...sel,
            ];
          } else {
            keySelections[key] = sel;
          }
        }
      }
    }
  }
  return {
    keys,
    keySelections,
    keyMappings,
  };
}

export function projectDataSelectionSet(
  data: any,
  selections?: readonly SelectionNode[],
  typeName?: string,
): any {
  if (
    data == null ||
    selections == null ||
    !selections?.length
  ) {
    return data;
  }
  if (data instanceof Error) {
    return null;
  }
  if (Array.isArray(data)) {
    return data.map((entry) => projectDataSelectionSet(entry, selections, typeName));
  }
  const {
    keys: availableKeys,
    keySelections,
    keyMappings,
  } = getAvailableKeys(data, selections, typeName);
  const ownKeys = Array.from(new Set([...availableKeys, ...Reflect.ownKeys(data).filter(key => typeof key === 'symbol')]));
  const proxy = new Proxy(data, {
    ownKeys() {
      return ownKeys;
    },
    getOwnPropertyDescriptor(target, prop: string) {
      if (typeof prop === 'symbol') {
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
      if (ownKeys.includes(prop)) {
        return {
          enumerable: typeof prop === 'string',
          configurable: typeof prop === 'string',
          get() {
            if (prop === '__typename' && typeName) {
              return typeName;
            }
            if (availableKeys.includes(prop)) {
              const actualProp = keyMappings[prop as string] || prop;
              const propData = Reflect.get(target, actualProp);
              if (!(propData instanceof GraphQLError) || propData != null) {
                const selectionSet = keySelections[actualProp];
                if (!selectionSet?.length) {
                  return propData;
                }
                const projected = projectDataSelectionSet(propData, selections);
                return projected;
              }
            } else if (typeof prop === 'symbol') {
              return Reflect.get(target, prop);
            } else if (prop === 'toJSON') {
              return () => proxy;
            }
            return undefined;
          }
        };
      }
    },
    get(target, prop: string, receiver) {
      if (prop === '__typename' && typeName) {
        return typeName;
      }
      if (availableKeys.includes(prop)) {
        const actualProp = keyMappings[prop as string] || prop;
        const propData = Reflect.get(target, actualProp, receiver);
        if (!(propData instanceof GraphQLError) || propData != null) {
          const selectionSet = keySelections[actualProp];
          if (!selectionSet?.length) {
            return propData;
          }
          const projected = projectDataSelectionSet(propData, selections);
          return projected;
        }
      } else if (typeof prop === 'symbol') {
        return Reflect.get(target, prop, receiver);
      } else if (prop === 'toJSON') {
        return () => proxy;
      }
      return undefined;
    },
    set() {
      throw new Error('Cannot set properties on a key object');
    },
  });
  return proxy;
}

export function getKeyFnForFederation(typeName: string, keys: string[]) {
  if (keys.some((key) => key.includes('{') || key.includes('('))) {
    const parsedSelectionSet = parseSelectionSet(`{${keys.join(' ')}}`, {
      noLocation: true,
    });
    return function keyFn(root: any) {
      if (root == null) {
        return root;
      }

      return projectDataSelectionSet(root, parsedSelectionSet.selections, typeName);
    };
  }
  const allKeyProps = keys
    .flatMap((key) => key.trim().split(' '))
    .map((key) => key.trim());
  if (allKeyProps.length === 1) {
    const keyProp = allKeyProps[0]!;
    return function keyFn(root: any) {
      if (root == null) {
        return null;
      }
      const keyPropVal = root[keyProp];
      if (keyPropVal == null) {
        return null;
      }
      return {
        __typename: typeName,
        get [keyProp]() {
          return keyPropVal
        },
      };
    };
  }
  return function keyFn(root: any) {
    if (root == null) {
      return null;
    }
    return new Proxy(root, {
      get(root, prop: string, receiver) {
        if (prop === '__typename') {
          return typeName;
        }
        if (allKeyProps.includes(prop)) {
          const propVal = Reflect.get(root, prop, receiver);
          if (propVal instanceof GraphQLError) {
            return undefined;
          }
          return propVal;
        }
        return undefined;
      },
      set() {
        throw new Error('Cannot set properties on a key object');
      },
    });
  };
}

export function getCacheKeyFnFromKey(key: string) {
  if (key.includes('{') || key.includes('(')) {
    const parsedSelectionSet = parseSelectionSet(`{${key}}`, {
      noLocation: true,
    });
    return function cacheKeyFn(root: any) {
      return JSON.stringify(projectDataSelectionSet(root, parsedSelectionSet.selections));
    };
  }
  const keyTrimmed = key.trim();
  const keys = keyTrimmed.split(' ').map((key) => key.trim());
  if (keys.length > 1) {
    return function cacheKeyFn(root: any) {
      let cacheKeyStr = '';
      for (const key of keys) {
        const keyVal = root[key];
        if (keyVal == null) {
          continue;
        } else if (typeof keyVal === 'object') {
          if (cacheKeyStr) {
            cacheKeyStr += ' ';
          }
          cacheKeyStr += JSON.stringify(keyVal);
        } else {
          if (cacheKeyStr) {
            cacheKeyStr += ' ';
          }
          cacheKeyStr += keyVal;
        }
      }
      return cacheKeyStr;
    };
  }
  return function cacheKeyFn(root: any) {
    const keyVal = root[keyTrimmed];
    if (keyVal == null) {
      return '';
    }
    if (typeof keyVal === 'object') {
      return JSON.stringify(keyVal);
    }
    return keyVal;
  };
}

function hasInaccessible(obj: DirectableObject) {
  return getDirectiveExtensions<{
    inaccessible: {};
  }>(obj)?.inaccessible?.length;
}

export function filterInternalFieldsAndTypes(finalSchema: GraphQLSchema) {
  const internalTypeNameRegexp =
    /^(?:_Entity|_Any|_FieldSet|_Service|link|inaccessible|(?:link__|join__|core__)[\w]*)$/;
  return mapSchema(finalSchema, {
    [MapperKind.DIRECTIVE]: (directive) => {
      if (internalTypeNameRegexp.test(directive.name)) {
        return null;
      }
      return directive;
    },
    [MapperKind.TYPE]: (type) => {
      if (internalTypeNameRegexp.test(type.name) || hasInaccessible(type)) {
        return null;
      }
      return type;
    },
    [MapperKind.FIELD]: (fieldConfig) => {
      if (hasInaccessible(fieldConfig)) {
        return null;
      }
      return fieldConfig;
    },
    [MapperKind.QUERY_ROOT_FIELD]: (fieldConfig, fieldName) => {
      if (fieldName === '_entities' || hasInaccessible(fieldConfig)) {
        return null;
      }
      return fieldConfig;
    },
    [MapperKind.ENUM_VALUE]: (valueConfig) => {
      if (hasInaccessible(valueConfig)) {
        return null;
      }
      return valueConfig;
    },
    [MapperKind.ARGUMENT]: (argConfig) => {
      if (hasInaccessible(argConfig)) {
        return null;
      }
      return argConfig;
    },
  });
}

export function getNamedTypeNode(typeNode: TypeNode) {
  if (typeNode.kind !== Kind.NAMED_TYPE) {
    return getNamedTypeNode(typeNode.type);
  }
  return typeNode;
}
