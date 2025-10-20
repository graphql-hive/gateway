// based on https://github.com/fastify/deepmerge/blob/2a761c7d5c83564cc7fbf8ba724ba58bfd49e5ae/index.js
// MIT License
// Copyright (c) 2025 The Fastify team

function isNotPrototypeKey(value) {
  return (
    value !== 'constructor' && value !== 'prototype' && value !== '__proto__'
  );
}

function deepmergeArray(target: any, source: any) {
  let i = 0;
  const sl = source.length;
  const il = Math.max(target.length, source.length);
  const result = new Array(il);
  for (i = 0; i < il; ++i) {
    if (i < sl) {
      result[i] = mergeDeep(target[i], source[i]);
    }
  }
  return result;
}

const getKeys = Object.keys;

const isMergeableObject = function defaultIsMergeableObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof RegExp) &&
    !(value instanceof Date)
  );
};

function isPrimitive(value) {
  return typeof value !== 'object' || value === null;
}

const mergeArray = deepmergeArray;

function mergeObject(target, source) {
  const result = {};
  const targetKeys = getKeys(target);
  const sourceKeys = getKeys(source);
  let i, il, key;
  for (i = 0, il = targetKeys.length; i < il; ++i) {
    isNotPrototypeKey((key = targetKeys[i])) &&
      sourceKeys.indexOf(key) === -1 &&
      (result[key] = target[key]);
  }

  for (i = 0, il = sourceKeys.length; i < il; ++i) {
    if (!isNotPrototypeKey((key = sourceKeys[i]))) {
      continue;
    }

    if (key in target) {
      if (targetKeys.indexOf(key) !== -1) {
        result[key] = mergeDeep(target[key], source[key]);
      }
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function mergeDeep(target, source) {
  const sourceIsArray = Array.isArray(source);
  const targetIsArray = Array.isArray(target);

  if (isPrimitive(source)) {
    return source;
  } else if (!isMergeableObject(target)) {
    return source;
  } else if (sourceIsArray && targetIsArray) {
    return mergeArray(target, source);
  } else if (sourceIsArray !== targetIsArray) {
    return source;
  } else {
    return mergeObject(target, source);
  }
}
