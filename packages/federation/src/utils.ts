import {
  DirectableObject,
  getDirectiveExtensions,
  MapperKind,
  mapSchema,
  memoize1,
  mergeDeep,
  parseSelectionSet,
} from '@graphql-tools/utils';
import { GraphQLSchema, Kind, SelectionSetNode, TypeNode } from 'graphql';
import { GraphQLResolveInfo } from 'graphql/type';

export const getArgsFromKeysForFederation = memoize1(
  function getArgsFromKeysForFederation(representations: readonly any[]) {
    return { representations };
  },
);

export function projectDataSelectionSet(
  data: any,
  selectionSet?: SelectionSetNode,
): any {
  if (
    data == null ||
    selectionSet == null ||
    !selectionSet?.selections?.length
  ) {
    return data;
  }
  if (data instanceof Error) {
    return null;
  }
  if (Array.isArray(data)) {
    return data.map((entry) => projectDataSelectionSet(entry, selectionSet));
  }
  const projectedData: Record<string, any> = {
    __typename: data.__typename,
  };
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const fieldName = selection.name.value;
      const responseKey = selection.alias?.value || selection.name.value;
      if (Object.prototype.hasOwnProperty.call(data, responseKey)) {
        const projectedKeyData = projectDataSelectionSet(
          data[responseKey],
          selection.selectionSet,
        );
        if (projectedData[fieldName]) {
          if (
            projectedKeyData != null &&
            !(projectedKeyData instanceof Error)
          ) {
            projectedData[fieldName] = mergeDeep(
              [projectedData[fieldName], projectedKeyData],
              undefined,
              true,
              true,
            );
          }
        } else {
          projectedData[fieldName] = projectedKeyData;
        }
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (
        selection.typeCondition &&
        projectedData['__typename'] != null &&
        projectedData['__typename'] !== selection.typeCondition.name.value
      ) {
        continue;
      }
      Object.assign(
        projectedData,
        mergeDeep(
          [
            projectedData,
            projectDataSelectionSet(data, selection.selectionSet),
          ],
          undefined,
          true,
          true,
        ),
      );
    }
  }
  return projectedData;
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
      return projectDataSelectionSet(
        {
          __typename: typeName,
          ...root,
        },
        parsedSelectionSet,
      );
    };
  }
  const allKeyProps = keys
    .flatMap((key) => key.trim().split(' '))
    .map((key) => key.trim());
  if (allKeyProps.length > 1) {
    return function keyFn(root: any) {
      if (root == null) {
        return null;
      }
      return allKeyProps.reduce(
        (prev: any, key) => {
          if (key !== '__typename') {
            prev[key] = root[key];
          }
          return prev;
        },
        { __typename: typeName },
      );
    };
  }
  const keyProp = allKeyProps[0]!;
  return memoize1(function keyFn(root: any) {
    if (root == null) {
      return null;
    }
    const keyPropVal = root[keyProp];
    if (keyPropVal == null) {
      return null;
    }
    return {
      __typename: typeName,
      [keyProp]: keyPropVal,
    };
  });
}

export function getCacheKeyFnFromKey(key: string) {
  if (key.includes('{') || key.includes('(')) {
    const parsedSelectionSet = parseSelectionSet(`{${key}}`, {
      noLocation: true,
    });
    return function cacheKeyFn(root: any) {
      return JSON.stringify(projectDataSelectionSet(root, parsedSelectionSet));
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
  return memoize1(function cacheKeyFn(root: any) {
    const keyVal = root[keyTrimmed];
    if (keyVal == null) {
      return '';
    }
    if (typeof keyVal === 'object') {
      return JSON.stringify(keyVal);
    }
    return keyVal;
  });
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

export type ProgressiveOverrideHandler = (
  label: string,
  context: any,
  info: GraphQLResolveInfo,
) => boolean;

function getRngFromEnv() {
  const rngEnv = globalThis.process?.env?.['PROGRESSIVE_OVERRIDE_RNG'];
  if (rngEnv) {
    const rngSeed = parseFloat(rngEnv);
    if (!isNaN(rngSeed) && rngSeed >= 0 && rngSeed < 1) {
      return rngSeed;
    }
  }
  return undefined;
}

export const progressiveOverridePossibilityHandler = (
  possibility: number,
  getRng: (() => number) | undefined,
) => {
  const rng = getRngFromEnv() || (getRng ? getRng() : Math.random());
  return rng < possibility;
};

export function extractPercentageFromLabel(label: string): number | undefined {
  if (label.startsWith('percent(') && label.endsWith(')')) {
    const regexp = /^percent\((\d+(?:\.\d+)?)\)$/;
    const match = regexp.exec(label);
    const percentageStr = match?.[1];
    if (!percentageStr) {
      throw new Error(`Expected a number in percent(x), got: ${label}`);
    }
    const parsedFloat = parseFloat(percentageStr);
    if (isNaN(parsedFloat)) {
      throw new Error(`Could not parse percentage value from label: ${label}`);
    }
    if (parsedFloat < 0 || parsedFloat > 100) {
      throw new Error(
        `Expected a percentage value between 0 and 100, got ${parsedFloat}`,
      );
    }
    return parsedFloat;
  }
  return undefined;
}
