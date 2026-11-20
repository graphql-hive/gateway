import type { GraphQLObjectType } from 'graphql';

/**
 * What a response body has to look like for an operation, compiled once per
 * operation (see `compileRawForwardPlan`) and checked against the bytes of
 * every candidate response (see `verifyRawForwardBody`).
 */
export type PlanNode =
  | ObjectPlanNode
  | ListPlanNode
  | EnumPlanNode
  | ConstantPlanNode
  | LeafPlanNode;

export const OBJECT = 0;
export const LIST = 1;
export const STRING = 2;
export const INT = 3;
export const FLOAT = 4;
export const BOOLEAN = 5;
export const ANY = 6;
export const ENUM = 7;
export const CONSTANT = 8;

export interface ObjectPlanNode {
  kind: typeof OBJECT;
  nonNull: boolean;
  type: GraphQLObjectType;
  /** Response keys in the order the selection produces them. */
  responseKeys: string[];
  /** The same keys as JSON string tokens (with the quotes). */
  keyTokens: Uint8Array[];
  fieldNames: string[];
  children: PlanNode[];
}
export interface ListPlanNode {
  kind: typeof LIST;
  nonNull: boolean;
  ofNode: PlanNode;
}
export interface EnumPlanNode {
  kind: typeof ENUM;
  nonNull: boolean;
  values: Set<string>;
}
/** A value known up front: `__typename` of an object type. */
export interface ConstantPlanNode {
  kind: typeof CONSTANT;
  nonNull: true;
  token: Uint8Array;
}
export interface LeafPlanNode {
  /** `ANY` is any JSON value: a custom scalar the gateway passes through as is. */
  kind: typeof STRING | typeof INT | typeof FLOAT | typeof BOOLEAN | typeof ANY;
  nonNull: boolean;
}

// Nesting bound inside custom scalar values; a deeper body is not accepted.
const MAX_ANY_DEPTH = 256;

// Cursor state. The verifier is synchronous and never re-entered, so it is kept
// outside of the functions. Reading past the end of the body yields `undefined`,
// which fails every comparison below; the non-null assertions rely on that.
let b: Uint8Array;
let p = 0;
let depth = 0;

function skipWhitespace(): number {
  let c = b[p]!;
  while (c === 32 || c === 10 || c === 13 || c === 9) {
    c = b[++p]!;
  }
  return c;
}

function isHex(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
}

// JSON string token starting at the opening quote. Escapes and control
// characters are checked here, UTF-8 validity once for the whole body.
function string(): boolean {
  let i = p + 1;
  for (;;) {
    const c = b[i++]!;
    if (c === 34) {
      p = i;
      return true;
    }
    if (c === 92) {
      const e = b[i++]!;
      if (e === 117) {
        if (
          !(
            isHex(b[i]!) &&
            isHex(b[i + 1]!) &&
            isHex(b[i + 2]!) &&
            isHex(b[i + 3]!)
          )
        ) {
          return false;
        }
        i += 4;
      } else if (
        !(
          e === 34 ||
          e === 92 ||
          e === 47 ||
          e === 98 ||
          e === 102 ||
          e === 110 ||
          e === 114 ||
          e === 116
        )
      ) {
        return false;
      }
    } else if (!(c >= 32)) {
      // control character, or the end of the body
      return false;
    }
  }
}

// JSON number token.
// As `Int`: no fraction or exponent and within 32 bits, what `GraphQLInt` serializes unchanged.
// Otherwise: at most 15 significant digits and a 2 digit exponent, so that the
// token names the same number before and after a round trip through a double.
function number(int: boolean): boolean {
  let i = p;
  let c = b[i]!;
  let digits = 0;
  const negative = c === 45;
  if (negative) {
    c = b[++i]!;
  }
  let value = 0;
  if (c === 48) {
    digits = 1;
    c = b[++i]!;
  } else if (c >= 49 && c <= 57) {
    do {
      digits++;
      if (digits <= 10) {
        value = value * 10 + (c - 48);
      }
      c = b[++i]!;
    } while (c >= 48 && c <= 57);
  } else {
    return false;
  }
  if (int) {
    if (c === 46 || c === 101 || c === 69 || digits > 10) {
      return false;
    }
    if (value > (negative ? 2147483648 : 2147483647)) {
      return false;
    }
    p = i;
    return true;
  }
  if (c === 46) {
    c = b[++i]!;
    if (!(c >= 48 && c <= 57)) {
      return false;
    }
    do {
      digits++;
      c = b[++i]!;
    } while (c >= 48 && c <= 57);
  }
  if (c === 101 || c === 69) {
    c = b[++i]!;
    if (c === 43 || c === 45) {
      c = b[++i]!;
    }
    if (!(c >= 48 && c <= 57)) {
      return false;
    }
    let exponentDigits = 0;
    do {
      exponentDigits++;
      c = b[++i]!;
    } while (c >= 48 && c <= 57);
    if (exponentDigits > 2) {
      return false;
    }
  }
  if (digits > 15) {
    return false;
  }
  p = i;
  return true;
}

function nullLiteral(): boolean {
  if (b[p + 1] === 117 && b[p + 2] === 108 && b[p + 3] === 108) {
    p += 4;
    return true;
  }
  return false;
}

function boolean(c: number): boolean {
  if (c === 116) {
    if (b[p + 1] === 114 && b[p + 2] === 117 && b[p + 3] === 101) {
      p += 4;
      return true;
    }
    return false;
  }
  if (c === 102) {
    if (
      b[p + 1] === 97 &&
      b[p + 2] === 108 &&
      b[p + 3] === 115 &&
      b[p + 4] === 101
    ) {
      p += 5;
      return true;
    }
  }
  return false;
}

// Any JSON value, full grammar.
function any(): boolean {
  const c = skipWhitespace();
  if (c === 34) {
    return string();
  }
  if (c === 123) {
    if (++depth > MAX_ANY_DEPTH) {
      return false;
    }
    p++;
    if (skipWhitespace() === 125) {
      p++;
      depth--;
      return true;
    }
    for (;;) {
      if (skipWhitespace() !== 34 || !string()) {
        return false;
      }
      if (skipWhitespace() !== 58) {
        return false;
      }
      p++;
      if (!any()) {
        return false;
      }
      const d = skipWhitespace();
      p++;
      if (d === 125) {
        depth--;
        return true;
      }
      if (d !== 44) {
        return false;
      }
    }
  }
  if (c === 91) {
    if (++depth > MAX_ANY_DEPTH) {
      return false;
    }
    p++;
    if (skipWhitespace() === 93) {
      p++;
      depth--;
      return true;
    }
    for (;;) {
      if (!any()) {
        return false;
      }
      const d = skipWhitespace();
      p++;
      if (d === 93) {
        depth--;
        return true;
      }
      if (d !== 44) {
        return false;
      }
    }
  }
  if (c === 110) {
    return nullLiteral();
  }
  if (c === 116 || c === 102) {
    return boolean(c);
  }
  return number(false);
}

function token(expected: Uint8Array): boolean {
  const length = expected.length;
  for (let j = 0; j < length; j++) {
    if (b[p + j] !== expected[j]) {
      return false;
    }
  }
  p += length;
  return true;
}

function value(node: PlanNode): boolean {
  const c = skipWhitespace();
  if (c === 110) {
    return node.nonNull ? false : nullLiteral();
  }
  switch (node.kind) {
    case OBJECT: {
      if (c !== 123) {
        return false;
      }
      p++;
      const { keyTokens, children } = node;
      const last = keyTokens.length - 1;
      for (let k = 0; k <= last; k++) {
        skipWhitespace();
        if (!token(keyTokens[k]!)) {
          return false;
        }
        if (skipWhitespace() !== 58) {
          return false;
        }
        p++;
        if (!value(children[k]!)) {
          return false;
        }
        const d = skipWhitespace();
        p++;
        if (d !== (k === last ? 125 : 44)) {
          return false;
        }
      }
      return true;
    }
    case LIST: {
      if (c !== 91) {
        return false;
      }
      p++;
      if (skipWhitespace() === 93) {
        p++;
        return true;
      }
      const ofNode = node.ofNode;
      for (;;) {
        if (!value(ofNode)) {
          return false;
        }
        const d = skipWhitespace();
        p++;
        if (d === 93) {
          return true;
        }
        if (d !== 44) {
          return false;
        }
      }
    }
    case STRING:
      return c === 34 && string();
    case INT:
      return number(true);
    case FLOAT:
      return number(false);
    case BOOLEAN:
      return boolean(c);
    case ANY:
      return any();
    case ENUM: {
      if (c !== 34) {
        return false;
      }
      let i = p + 1;
      let e = b[i]!;
      let name = '';
      // GraphQL names only, so no escapes to handle
      while (
        (e >= 97 && e <= 122) ||
        (e >= 65 && e <= 90) ||
        e === 95 ||
        (e >= 48 && e <= 57)
      ) {
        name += String.fromCharCode(e);
        e = b[++i]!;
      }
      if (e !== 34 || !node.values.has(name)) {
        return false;
      }
      p = i + 1;
      return true;
    }
    case CONSTANT:
      return token(node.token);
    default:
      return false;
  }
}

const nodeIsUtf8: ((input: Uint8Array) => boolean) | undefined = (
  globalThis as any
).process?.getBuiltinModule?.('node:buffer')?.isUtf8;
let fatalDecoder: TextDecoder | undefined;
function isUtf8(body: Uint8Array): boolean {
  if (nodeIsUtf8) {
    return nodeIsUtf8(body);
  }
  try {
    fatalDecoder ||= new TextDecoder('utf-8', { fatal: true });
    fatalDecoder.decode(body);
    return true;
  } catch {
    return false;
  }
}

/**
 * `true` when the body is exactly `{"data":<value matching the plan>}` (JSON
 * whitespace allowed) and valid UTF-8. Nothing is allocated for the values.
 */
export function verifyRawForwardBody(
  root: ObjectPlanNode,
  body: Uint8Array,
): boolean {
  b = body;
  p = 0;
  depth = 0;
  let ok = false;
  if (skipWhitespace() === 123) {
    p++;
    skipWhitespace();
    if (
      b[p] === 34 &&
      b[p + 1] === 100 &&
      b[p + 2] === 97 &&
      b[p + 3] === 116 &&
      b[p + 4] === 97 &&
      b[p + 5] === 34
    ) {
      p += 6;
      if (skipWhitespace() === 58) {
        p++;
        if (value(root) && skipWhitespace() === 125) {
          p++;
          ok = skipWhitespace() === undefined && p === body.length;
        }
      }
    }
  }
  b = undefined!;
  return ok && isUtf8(body);
}
