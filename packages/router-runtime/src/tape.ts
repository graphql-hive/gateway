/**
 * The data of a request as the subgraphs' response bytes and a tape of their values, instead of
 * parsed objects. The GC never looks inside the typed arrays, and nothing is copied: merging a
 * subgraph's result into the data links its values in, and the response is written straight from
 * the bytes.
 *
 * Every value of every body takes {@link SLOTS} int32 slots on the tape:
 *
 * - kind, {@link K_OBJ}, {@link K_ARR}, {@link K_STR}, {@link K_PRIM} (a number, `true`,
 *   `false` or `null`) or {@link K_KEY}
 * - where its bytes start and end in its body, quotes included for a string
 * - the tape index right after it, its children included
 * - its body
 * - for a value, the next value merged into it, -1 for none. A merge links a value into the chain
 *   of another one, and reading a key across a chain links the objects (or lists) under that key
 *   into one chain the first time, which is what `deepMerge` makes of them. For a key, the hash
 *   of its bytes, see {@link TapeKey}, so looking a key up compares numbers.
 *
 * Members of an object are a key followed by its value.
 */

export const K_OBJ = 1;
export const K_ARR = 2;
export const K_STR = 3;
export const K_PRIM = 4;
/** The key of an object member, a string. */
export const K_KEY = 5;
const SLOTS = 6;

/** The hash of `"key"` as the tokenizer works it out for every key. */
function hashKey(body: Uint8Array, start: number, end: number): number {
  // `"key"` from its length, its first three chars and its last one, without a multiply per
  // byte. Keys that share all of them, which is rare, cost a comparison of their bytes
  // only bytes of the key, a short one would read past it otherwise
  const length = end - start;
  const b1 = start + 1 < end ? body[start + 1]! : 0;
  const b2 = start + 2 < end ? body[start + 2]! : 0;
  const b3 = start + 3 < end ? body[start + 3]! : 0;
  const last = end - 2 > start ? body[end - 2]! : 0;
  return (
    (Math.imul(length, 0x9e3779b1) ^
      (b1 | (b2 << 8) | (b3 << 16)) ^
      Math.imul(last, 0x85ebca6b)) |
    0
  );
}

/** A key to look up in an object, `"key"` as bytes and their hash. */
export interface TapeKey {
  bytes: Uint8Array;
  hash: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const latin1 = new TextDecoder('latin1');

/**
 * `body[start..end]` a char per byte. Short ones without a decoder, which in Node allocates a
 * buffer per call, and they're nearly all short: type names, ids, keys.
 */
function byteString(body: Uint8Array, start: number, end: number): string {
  const length = end - start;
  if (length > 64) {
    return latin1.decode(body.subarray(start, end));
  }
  let s = '';
  for (let i = start; i < end; i++) {
    s += String.fromCharCode(body[i]!);
  }
  return s;
}

/**
 * The values of every body tokenized, as if at the start of a tape, for as long as the body is
 * around. A body shared by the consumers of a deduplicated request is tokenized once.
 */
const tokenized = new WeakMap<Uint8Array, Int32Array>();

const quotedKeys = new Map<string, TapeKey>();
/** `key` to look up in an object, see {@link TapeKey}. */
export function quotedKey(key: string): TapeKey {
  let quoted = quotedKeys.get(key);
  if (!quoted) {
    const bytes = encoder.encode(JSON.stringify(key));
    quoted = { bytes, hash: hashKey(bytes, 0, bytes.length) };
    quotedKeys.set(key, quoted);
  }
  return quoted;
}

export class ResponseTape {
  tape = new Int32Array(1 << 12);
  length = 0;
  bodies: Uint8Array[] = [];
  private stack = new Int32Array(64);

  /**
   * Adds the values of a JSON body, returns the tape index of its top value or -1 when it isn't
   * valid JSON as far as the tape can tell. A `shared` body, one other requests add too, like the
   * consumers of a deduplicated subgraph request, is tokenized once for all of them.
   */
  add(body: Uint8Array, shared = false): number {
    const bodyIndex = this.bodies.length;
    this.bodies.push(body);
    const top = this.length;
    const segment = shared ? tokenized.get(body) : undefined;
    if (segment) {
      return this.copySegment(segment, bodyIndex);
    }
    const added = this.tokenize(body, bodyIndex);
    if (shared && added !== -1) {
      // as if it were at the start of a tape, see `copySegment`
      const copy = this.tape.slice(top, this.length);
      for (let k = 0; k < copy.length; k += SLOTS) {
        copy[k + 3]! -= top;
      }
      tokenized.set(body, copy);
    }
    return added;
  }

  private copySegment(segment: Int32Array, bodyIndex: number): number {
    const top = this.length;
    while (top + segment.length > this.tape.length) {
      const grown = new Int32Array(this.tape.length * 2);
      grown.set(this.tape);
      this.tape = grown;
    }
    const tape = this.tape;
    tape.set(segment, top);
    for (let k = top; k < top + segment.length; k += SLOTS) {
      tape[k + 3]! += top;
      tape[k + 4] = bodyIndex;
      // a key keeps its hash, a value starts with nothing merged into it
      if (tape[k] !== K_KEY) {
        tape[k + 5] = -1;
      }
    }
    this.length += segment.length;
    return top;
  }

  private tokenize(body: Uint8Array, bodyIndex: number): number {
    // everything in locals, fields aren't kept in registers across the loop
    let tape = this.tape;
    let capacity = tape.length;
    let length = this.length;
    let stack = this.stack;
    const top = length;
    let depth = 0;
    // whether the next string is the key of an object member
    let keyNext = false;
    const n = body.length;
    // the body as 4-byte words, to scan strings a word at a time
    const offset = body.byteOffset;
    const words = new Int32Array(body.buffer, 0, body.buffer.byteLength >> 2);
    const lastWord = (offset + n) >> 2;
    for (let i = 0; i < n; i++) {
      const c = body[i]!;
      if (c === 44) {
        keyNext = depth > 0 && tape[stack[depth - 1]!] === K_OBJ;
        continue;
      }
      // whitespace and `:` only separate values
      if (c === 58 || c === 32 || c === 10 || c === 13 || c === 9) {
        continue;
      }
      if (length + SLOTS > capacity) {
        const grown = new Int32Array(capacity * 2);
        grown.set(tape);
        this.tape = tape = grown;
        capacity = grown.length;
      }
      const at = length;
      if (c === 123 || c === 91) {
        if (depth === stack.length) {
          const grown = new Int32Array(stack.length * 2);
          grown.set(stack);
          this.stack = stack = grown;
        }
        stack[depth++] = at;
        tape[at] = c === 123 ? K_OBJ : K_ARR;
        tape[at + 1] = i;
        tape[at + 4] = bodyIndex;
        tape[at + 5] = -1;
        length += SLOTS;
        keyNext = c === 123;
      } else if (c === 125 || c === 93) {
        if (!depth) {
          this.length = length;
          return -1;
        }
        const open = stack[--depth]!;
        tape[open + 2] = i + 1;
        tape[open + 3] = length;
        keyNext = false;
      } else if (keyNext) {
        // a key, hashed on the way so looking it up compares numbers, see `hashKey`
        if (c !== 34) {
          this.length = length;
          return -1;
        }
        const start = i;
        i++;
        while (i < n && body[i] !== 34) {
          if (body[i] === 92) {
            i++;
          }
          i++;
        }
        if (i >= n) {
          this.length = length;
          return -1;
        }
        tape[at] = K_KEY;
        tape[at + 1] = start;
        tape[at + 2] = i + 1;
        tape[at + 3] = at + SLOTS;
        tape[at + 4] = bodyIndex;
        tape[at + 5] = hashKey(body, start, i + 1);
        length += SLOTS;
        keyNext = false;
      } else {
        const start = i;
        let kind: number;
        if (c === 34) {
          kind = K_STR;
          // to the closing quote, a word at a time past the first word boundary, an escape skips
          // the byte after it. `Uint8Array#indexOf` costs more per call than it saves
          i++;
          for (;;) {
            while (i < n && ((i + offset) & 3) !== 0) {
              const d = body[i];
              if (d === 34 || d === 92) {
                break;
              }
              i++;
            }
            if (i < n && ((i + offset) & 3) === 0) {
              let k = (i + offset) >> 2;
              while (k < lastWord) {
                const x = words[k]!;
                const q = x ^ 0x22222222;
                const e = x ^ 0x5c5c5c5c;
                // a byte of the word is `"` or `\`, the bit trick has no misses, only a word that
                // also passes for one, the bytes below find which
                if (
                  (((q - 0x01010101) & ~q) | ((e - 0x01010101) & ~e)) &
                  0x80808080
                ) {
                  break;
                }
                k++;
              }
              i = k * 4 - offset;
              while (i < n) {
                const d = body[i];
                if (d === 34 || d === 92) {
                  break;
                }
                i++;
              }
            }
            if (i < n && body[i] === 92) {
              i += 2;
              continue;
            }
            break;
          }
          if (i >= n) {
            this.length = length;
            return -1;
          }
        } else {
          kind = K_PRIM;
          while (i + 1 < n) {
            const d = body[i + 1];
            if (
              d === 44 ||
              d === 125 ||
              d === 93 ||
              d === 32 ||
              d === 10 ||
              d === 13 ||
              d === 9
            ) {
              break;
            }
            i++;
          }
        }
        tape[at] = kind;
        tape[at + 1] = start;
        tape[at + 2] = i + 1;
        tape[at + 3] = at + SLOTS;
        tape[at + 4] = bodyIndex;
        tape[at + 5] = -1;
        length += SLOTS;
      }
    }
    this.length = length;
    return depth === 0 && length > top ? top : -1;
  }

  kind(node: number): number {
    return this.tape[node]!;
  }

  isNull(node: number): boolean {
    return (
      this.tape[node] === K_PRIM &&
      this.bodies[this.tape[node + 4]!]![this.tape[node + 1]!] === 110 // n
    );
  }

  /**
   * The value of the key in the object, -1 when it has none. With the same key twice it's the
   * first one, where `JSON.parse` takes the last, a GraphQL response never has a key twice.
   */
  member(obj: number, key: TapeKey): number {
    const tape = this.tape;
    const body = this.bodies[tape[obj + 4]!]!;
    const end = tape[obj + 3]!;
    const bytes = key.bytes;
    const hash = key.hash;
    const len = bytes.length;
    for (let k = obj + SLOTS; k < end;) {
      const start = tape[k + 1]!;
      if (tape[k + 5] === hash && tape[k + 2]! - start === len) {
        let j = 0;
        while (j < len && body[start + j] === bytes[j]) {
          j++;
        }
        if (j === len) {
          return k + SLOTS;
        }
      }
      k = tape[k + SLOTS + 3]!;
    }
    return -1;
  }

  /** A hash of the bytes of a scalar, `h` mixed in, for {@link sameBytes} to confirm. */
  hashBytes(node: number, h: number): number {
    const tape = this.tape;
    const body = this.bodies[tape[node + 4]!]!;
    const end = tape[node + 2]!;
    for (let i = tape[node + 1]!; i < end; i++) {
      h = Math.imul(h ^ body[i]!, 0x01000193);
    }
    return h;
  }

  /** Whether two scalars have the same bytes. */
  sameBytes(a: number, b: number): boolean {
    const tape = this.tape;
    const aStart = tape[a + 1]!;
    const bStart = tape[b + 1]!;
    const length = tape[a + 2]! - aStart;
    if (tape[b + 2]! - bStart !== length) {
      return false;
    }
    const aBody = this.bodies[tape[a + 4]!]!;
    const bBody = this.bodies[tape[b + 4]!]!;
    for (let i = 0; i < length; i++) {
      if (aBody[aStart + i] !== bBody[bStart + i]) {
        return false;
      }
    }
    return true;
  }

  private typenames = new Map<number, string[]>();
  /**
   * The string at `node` when it's a type name, which repeats a lot: decoded once per request and
   * found by its bytes after.
   */
  typename(node: number): string | undefined {
    if (node === -1 || this.tape[node] !== K_STR) {
      return undefined;
    }
    const tape = this.tape;
    const body = this.bodies[tape[node + 4]!]!;
    const start = tape[node + 1]! + 1;
    const end = tape[node + 2]! - 1;
    const hash = this.hashBytes(node, 0x811c9dc5);
    let candidates = this.typenames.get(hash);
    if (candidates) {
      for (const candidate of candidates) {
        if (candidate.length !== end - start) {
          continue;
        }
        let i = 0;
        while (
          i < candidate.length &&
          candidate.charCodeAt(i) === body[start + i]
        ) {
          i++;
        }
        if (i === candidate.length) {
          return candidate;
        }
      }
    }
    const typename = this.string(node)!;
    if (!candidates) {
      this.typenames.set(hash, (candidates = []));
    }
    // only one written as its chars, without escapes or beyond ASCII, is found by its bytes
    if (typename.length === end - start && !/[^\x20-\x7e]/.test(typename)) {
      candidates.push(typename);
    }
    return typename;
  }

  /** Empties it for the next request, keeping its memory. */
  reset() {
    this.length = 0;
    this.bodies = [];
    this.typenames.clear();
    this.cursorTop = 0;
    this.indexTop = 0;
  }

  /**
   * Like {@link member}, looking from the key at `from` on first and from the start after. A
   * subgraph writes keys in the order the operation asks for them, which is the order they're
   * read in, so starting after the last one found nearly always finds the next one first.
   */
  private memberFrom(obj: number, key: TapeKey, from: number): number {
    const tape = this.tape;
    const body = this.bodies[tape[obj + 4]!]!;
    const end = tape[obj + 3]!;
    const bytes = key.bytes;
    const hash = key.hash;
    const len = bytes.length;
    for (let pass = 0; pass < 2; pass++) {
      const stop = pass === 0 ? end : from;
      for (let k = pass === 0 ? from : obj + SLOTS; k < stop;) {
        const start = tape[k + 1]!;
        if (tape[k + 5] === hash && tape[k + 2]! - start === len) {
          let j = 0;
          while (j < len && body[start + j] === bytes[j]) {
            j++;
          }
          if (j === len) {
            return k + SLOTS;
          }
        }
        k = tape[k + SLOTS + 3]!;
      }
    }
    return -1;
  }

  private cursors = new Int32Array(256);
  private cursorTop = 0;
  /**
   * Starts reading keys from the objects merged at `view` in order, see {@link memberAt}. Returns
   * what {@link closeCursors} takes when done.
   */
  openCursors(view: number): number {
    const base = this.cursorTop;
    for (let p = view; p !== -1; p = this.tape[p + 5]!) {
      if (this.cursorTop === this.cursors.length) {
        const grown = new Int32Array(this.cursors.length * 2);
        grown.set(this.cursors);
        this.cursors = grown;
      }
      this.cursors[this.cursorTop++] = p + SLOTS;
    }
    return base;
  }

  closeCursors(base: number) {
    this.cursorTop = base;
  }

  /** Like {@link memberOf}, looking after the last key found in every object, see {@link memberFrom}. */
  memberAt(view: number, key: TapeKey, base: number): number {
    const tape = this.tape;
    const cursors = this.cursors;
    if (tape[view + 5] === -1) {
      if (tape[view] !== K_OBJ) {
        return -1;
      }
      const from =
        cursors[base]! < tape[view + 3]! ? cursors[base]! : view + SLOTS;
      const found = this.memberFrom(view, key, from);
      if (found !== -1) {
        cursors[base] = tape[found + 3]!;
      }
      return found;
    }
    this.foldResult = -1;
    this.foldKind = 0;
    let c = base;
    for (let p = view; p !== -1; p = tape[p + 5]!, c++) {
      if (tape[p] !== K_OBJ) {
        continue;
      }
      const from = cursors[c]! < tape[p + 3]! ? cursors[c]! : p + SLOTS;
      const found = this.memberFrom(p, key, from);
      if (found !== -1) {
        cursors[c] = tape[found + 3]!;
        this.fold(found);
      }
    }
    return this.foldResult;
  }

  /** The item at `index` of the list, -1 when there's none. */
  item(list: number, index: number): number {
    const tape = this.tape;
    const end = tape[list + 3]!;
    let k = list + SLOTS;
    for (let i = 0; i < index && k < end; i++) {
      k = tape[k + 3]!;
    }
    return k < end ? k : -1;
  }

  /** Calls `fn` with every item of the list, merged with the items of the lists merged into it. */
  forEachItem(list: number, fn: (item: number, index: number) => void) {
    const tape = this.tape;
    const merged = tape[list + 5] !== -1;
    const end = tape[list + 3]!;
    let index = 0;
    for (let k = list + SLOTS; k < end; k = tape[k + 3]!, index++) {
      fn(merged ? this.itemOf(list, index) : k, index);
    }
  }

  private inChain(from: number, node: number) {
    for (let p = from; p !== -1; p = this.tape[p + 5]!) {
      if (p === node) {
        return true;
      }
    }
    return false;
  }

  /** Merges `node`, and what's merged into it, into `target`. Once. */
  link(target: number, node: number) {
    if (this.inChain(target, node) || this.inChain(node, target)) {
      return;
    }
    let p = target;
    while (this.tape[p + 5] !== -1) {
      p = this.tape[p + 5]!;
    }
    this.tape[p + 5] = node;
  }

  /** Whether values are merged into the one at `node`. */
  isMerged(node: number): boolean {
    return this.tape[node + 5] !== -1;
  }

  // An index of the keys of merged objects: an open addressing table of key node and value node
  // pairs, after the mask, on a stack like `cursors`. Looking up every field of a merged object
  // otherwise scans every object of the chain for it, and a field is usually in only one of them.
  private index = new Int32Array(1 << 12);
  private indexTop = 0;

  /**
   * Indexes the keys of the objects merged at `view`, their values folded like `deepMerge` (see
   * {@link fold}), for {@link indexGet}. Returns what {@link closeIndex} takes when done.
   */
  openIndex(view: number): number {
    const tape = this.tape;
    let members = 0;
    for (let p = view; p !== -1; p = tape[p + 5]!) {
      if (tape[p] !== K_OBJ) {
        continue;
      }
      for (
        let k = p + SLOTS, end = tape[p + 3]!;
        k < end;
        k = tape[k + SLOTS + 3]!
      ) {
        members++;
      }
    }
    let capacity = 8;
    while (capacity < members * 2) {
      capacity *= 2;
    }
    const base = this.indexTop;
    const top = base + 1 + capacity * 2;
    if (top > this.index.length) {
      let size = this.index.length * 2;
      while (size < top) {
        size *= 2;
      }
      const grown = new Int32Array(size);
      grown.set(this.index.subarray(0, base));
      this.index = grown;
    }
    const index = this.index;
    const mask = capacity - 1;
    index[base] = mask;
    index.fill(-1, base + 1, top);
    this.indexTop = top;
    for (let p = view; p !== -1; p = tape[p + 5]!) {
      if (tape[p] !== K_OBJ) {
        continue;
      }
      for (
        let k = p + SLOTS, end = tape[p + 3]!;
        k < end;
        k = tape[k + SLOTS + 3]!
      ) {
        const hash = tape[k + 5]!;
        let slot = hash & mask;
        for (;;) {
          const at = base + 1 + slot * 2;
          const keyNode = index[at]!;
          if (keyNode === -1) {
            index[at] = k;
            index[at + 1] = k + SLOTS;
            break;
          }
          if (tape[keyNode + 5] === hash && this.sameBytes(keyNode, k)) {
            index[at + 1] = this.foldPair(index[at + 1]!, k + SLOTS);
            break;
          }
          slot = (slot + 1) & mask;
        }
      }
    }
    return base;
  }

  /** The value of the key in the index at `base`, -1 when none of the objects has it. */
  indexGet(base: number, key: TapeKey): number {
    const index = this.index;
    const tape = this.tape;
    const mask = index[base]!;
    const hash = key.hash;
    const bytes = key.bytes;
    const len = bytes.length;
    let slot = hash & mask;
    for (;;) {
      const at = base + 1 + slot * 2;
      const keyNode = index[at]!;
      if (keyNode === -1) {
        return -1;
      }
      if (tape[keyNode + 5] === hash) {
        const start = tape[keyNode + 1]!;
        if (tape[keyNode + 2]! - start === len) {
          const body = this.bodies[tape[keyNode + 4]!]!;
          let j = 0;
          while (j < len && body[start + j] === bytes[j]) {
            j++;
          }
          if (j === len) {
            return index[at + 1]!;
          }
        }
      }
      slot = (slot + 1) & mask;
    }
  }

  closeIndex(base: number) {
    this.indexTop = base;
  }

  /**
   * The value of the key at `view`: from its index when it has one, -1 for none, see
   * {@link openIndex}, or looked up in its objects.
   */
  get(view: number, key: TapeKey, index: number): number {
    if (index !== -1) {
      return this.indexGet(index, key);
    }
    return this.tape[view + 5] === -1
      ? this.tape[view] === K_OBJ
        ? this.member(view, key)
        : -1
      : this.memberOf(view, key);
  }

  /** `deepMerge` of two values, the node that stands for it, see {@link fold}. */
  private foldPair(target: number, value: number): number {
    const tape = this.tape;
    if (this.isNull(value)) {
      return target;
    }
    const kind = tape[value]!;
    if ((kind === K_OBJ || kind === K_ARR) && tape[target] === kind) {
      this.link(target, value);
      return target;
    }
    return value;
  }

  private foldResult = -1;
  private foldKind = 0;
  /**
   * Folds the values like `deepMerge`: a null keeps what's there, an object (or list) after an
   * object (or list) is merged into it, anything else replaces it.
   */
  private fold(v: number) {
    const kind = this.tape[v]!;
    if (kind === K_PRIM && this.isNull(v)) {
      if (this.foldKind === 0) {
        this.foldKind = K_PRIM;
        this.foldResult = v;
      }
      return;
    }
    if ((kind === K_OBJ || kind === K_ARR) && this.foldKind === kind) {
      this.link(this.foldResult, v);
      return;
    }
    this.foldKind = kind === K_STR ? K_PRIM : kind;
    this.foldResult = v;
  }

  /** The value of the key across the objects merged at `view`, -1 when none has it. */
  memberOf(view: number, key: TapeKey): number {
    const tape = this.tape;
    if (tape[view + 5] === -1) {
      return tape[view] === K_OBJ ? this.member(view, key) : -1;
    }
    this.foldResult = -1;
    this.foldKind = 0;
    for (let p = view; p !== -1; p = tape[p + 5]!) {
      if (tape[p] !== K_OBJ) {
        continue;
      }
      const v = this.member(p, key);
      if (v !== -1) {
        this.fold(v);
      }
    }
    return this.foldResult;
  }

  /** The item at `index` across the lists merged at `view`, -1 when the first has none. */
  itemOf(view: number, index: number): number {
    const tape = this.tape;
    if (tape[view + 5] === -1) {
      return this.item(view, index);
    }
    this.foldResult = -1;
    this.foldKind = 0;
    for (let p = view; p !== -1; p = tape[p + 5]!) {
      if (tape[p] !== K_ARR) {
        continue;
      }
      const v = this.item(p, index);
      if (v !== -1) {
        this.fold(v);
      }
    }
    return this.foldResult;
  }

  /** The length of the first list at `view`, merging keeps its length. */
  listLength(list: number): number {
    const tape = this.tape;
    const end = tape[list + 3]!;
    let length = 0;
    for (let k = list + SLOTS; k < end; k = tape[k + 3]!) {
      length++;
    }
    return length;
  }

  /** The string at `node`, `undefined` when it isn't one. */
  string(node: number): string | undefined {
    if (
      node === -1 ||
      (this.tape[node] !== K_STR && this.tape[node] !== K_KEY)
    ) {
      return undefined;
    }
    const body = this.bodies[this.tape[node + 4]!]!;
    const start = this.tape[node + 1]! + 1;
    const end = this.tape[node + 2]! - 1;
    for (let i = start; i < end; i++) {
      // escapes or anything beyond ASCII go through the real thing
      if (body[i] === 92 || body[i]! > 127) {
        return JSON.parse(decoder.decode(body.subarray(start - 1, end + 1)));
      }
    }
    return byteString(body, start, end);
  }

  /**
   * The bytes of a scalar as a string that tells it apart from any other scalar, like
   * `"abc"` (quotes kept) or `12`, without decoding it.
   */
  scalarKey(node: number): string {
    const tape = this.tape;
    return byteString(
      this.bodies[tape[node + 4]!]!,
      tape[node + 1]!,
      tape[node + 2]!,
    );
  }

  /** The value at `view` as JS, merged values included. */
  read(view: number): unknown {
    if (view === -1) {
      return undefined;
    }
    const kind = this.tape[view]!;
    if (kind === K_OBJ) {
      const out: Record<string, unknown> = {};
      for (let p = view; p !== -1; p = this.tape[p + 5]!) {
        if (this.tape[p] !== K_OBJ) {
          continue;
        }
        const end = this.tape[p + 3]!;
        for (let k = p + SLOTS; k < end; k = this.tape[k + SLOTS + 3]!) {
          const key = this.string(k)!;
          if (key === '__proto__' || Object.hasOwn(out, key)) {
            // read through the merged value instead
            continue;
          }
          out[key] = this.read(this.memberOf(view, quotedKey(key)));
        }
      }
      return out;
    }
    if (kind === K_ARR) {
      const out: unknown[] = [];
      this.forEachItem(view, (item) => out.push(this.read(item)));
      return out;
    }
    if (kind === K_STR) {
      return this.string(view);
    }
    const body = this.bodies[this.tape[view + 4]!]!;
    return JSON.parse(
      latin1.decode(body.subarray(this.tape[view + 1]!, this.tape[view + 2]!)),
    );
  }

  /** The bytes of a scalar, for {@link ResponseWriter.copy}. */
  /** Writes the bytes of a value as they are. */
  copyTo(writer: ResponseWriter, node: number) {
    const tape = this.tape;
    writer.copy(this.bodies[tape[node + 4]!]!, tape[node + 1]!, tape[node + 2]!);
  }
}

/** JSON written as bytes, into a buffer that grows. */
export class ResponseWriter {
  out = new Uint8Array(1 << 14);
  length = 0;

  private ensure(extra: number) {
    if (this.length + extra <= this.out.length) {
      return;
    }
    let size = this.out.length * 2;
    while (size < this.length + extra) {
      size *= 2;
    }
    const grown = new Uint8Array(size);
    grown.set(this.out.subarray(0, this.length));
    this.out = grown;
  }

  byte(c: number) {
    this.ensure(1);
    this.out[this.length++] = c;
  }

  /** Writes `b`, from `from` on. */
  bytes(b: Uint8Array, from = 0) {
    const len = b.length - from;
    this.ensure(len);
    const at = this.length;
    if (len < 32) {
      const out = this.out;
      for (let k = 0; k < len; k++) {
        out[at + k] = b[from + k]!;
      }
    } else {
      this.out.set(from ? b.subarray(from) : b, at);
    }
    this.length = at + len;
  }

  /** Empties it for the next response, keeping its memory. */
  reset() {
    this.length = 0;
  }

  /** Copies `body[start..end]`. */
  copy(body: Uint8Array, start: number, end: number) {
    const len = end - start;
    this.ensure(len);
    if (len < 32) {
      // a view to copy with would cost more than the copy
      const out = this.out;
      const at = this.length;
      for (let k = 0; k < len; k++) {
        out[at + k] = body[start + k]!;
      }
    } else {
      if (nodeBufferCopy) {
        // without a view of it to copy from, unlike `set`
        nodeBufferCopy.call(body, this.out, this.length, start, end);
      } else {
        this.out.set(body.subarray(start, end), this.length);
      }
    }
    this.length += len;
  }

  null() {
    this.ensure(4);
    const out = this.out;
    out[this.length++] = 110;
    out[this.length++] = 117;
    out[this.length++] = 108;
    out[this.length++] = 108;
  }

  /** Writes a string, an escaped one when it needs to be. */
  string(s: string) {
    this.bytes(quotedString(s));
  }

  /** What's written, as its own bytes. */
  take(): Uint8Array {
    return this.out.slice(0, this.length);
  }
}

/** Node's `Buffer#copy`, it takes any `Uint8Array`, missing in other runtimes. */
const nodeBufferCopy = (
  globalThis as { Buffer?: { prototype: { copy: Function } } }
).Buffer?.prototype.copy;

const quotedStrings = new Map<string, Uint8Array>();
/** `"s"` as bytes, for the type names and keys a response repeats. */
function quotedString(s: string): Uint8Array {
  let quoted = quotedStrings.get(s);
  if (!quoted) {
    quoted = encoder.encode(JSON.stringify(s));
    if (quotedStrings.size < 10_000) {
      quotedStrings.set(s, quoted);
    }
  }
  return quoted;
}
