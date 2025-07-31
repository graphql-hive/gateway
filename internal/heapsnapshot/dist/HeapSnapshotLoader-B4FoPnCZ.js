var HeapSnapshotLoader$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get HeapSnapshotLoader () { return HeapSnapshotLoader; }
});

const HeapSnapshotProgressEvent = {
  Update: "ProgressUpdate",
  BrokenSnapshot: "BrokenSnapshot"
};
const baseSystemDistance = 1e8;
const baseUnreachableDistance = baseSystemDistance * 2;
class AllocationNodeCallers {
  nodesWithSingleCaller;
  branchingCallers;
  constructor(nodesWithSingleCaller, branchingCallers) {
    this.nodesWithSingleCaller = nodesWithSingleCaller;
    this.branchingCallers = branchingCallers;
  }
}
class SerializedAllocationNode {
  id;
  name;
  scriptName;
  scriptId;
  line;
  column;
  count;
  size;
  liveCount;
  liveSize;
  hasChildren;
  constructor(nodeId, functionName, scriptName, scriptId, line, column, count, size, liveCount, liveSize, hasChildren) {
    this.id = nodeId;
    this.name = functionName;
    this.scriptName = scriptName;
    this.scriptId = scriptId;
    this.line = line;
    this.column = column;
    this.count = count;
    this.size = size;
    this.liveCount = liveCount;
    this.liveSize = liveSize;
    this.hasChildren = hasChildren;
  }
}
class AllocationStackFrame {
  functionName;
  scriptName;
  scriptId;
  line;
  column;
  constructor(functionName, scriptName, scriptId, line, column) {
    this.functionName = functionName;
    this.scriptName = scriptName;
    this.scriptId = scriptId;
    this.line = line;
    this.column = column;
  }
}
class Node {
  id;
  name;
  distance;
  nodeIndex;
  retainedSize;
  selfSize;
  type;
  canBeQueried;
  detachedDOMTreeNode;
  isAddedNotRemoved;
  ignored;
  constructor(id, name, distance, nodeIndex, retainedSize, selfSize, type) {
    this.id = id;
    this.name = name;
    this.distance = distance;
    this.nodeIndex = nodeIndex;
    this.retainedSize = retainedSize;
    this.selfSize = selfSize;
    this.type = type;
    this.canBeQueried = false;
    this.detachedDOMTreeNode = false;
    this.isAddedNotRemoved = null;
    this.ignored = false;
  }
}
class Edge {
  name;
  node;
  type;
  edgeIndex;
  isAddedNotRemoved;
  constructor(name, node, type, edgeIndex) {
    this.name = name;
    this.node = node;
    this.type = type;
    this.edgeIndex = edgeIndex;
    this.isAddedNotRemoved = null;
  }
}
class Aggregate {
  count;
  distance;
  self;
  maxRet;
  name;
  idxs;
  constructor() {
  }
}
class AggregateForDiff {
  name;
  indexes;
  ids;
  selfSizes;
  constructor() {
    this.name = "";
    this.indexes = [];
    this.ids = [];
    this.selfSizes = [];
  }
}
class Diff {
  name;
  addedCount;
  removedCount;
  addedSize;
  removedSize;
  deletedIndexes;
  addedIndexes;
  countDelta;
  sizeDelta;
  constructor(name) {
    this.name = name;
    this.addedCount = 0;
    this.removedCount = 0;
    this.addedSize = 0;
    this.removedSize = 0;
    this.deletedIndexes = [];
    this.addedIndexes = [];
  }
}
class DiffForClass {
  name;
  addedCount;
  removedCount;
  addedSize;
  removedSize;
  deletedIndexes;
  addedIndexes;
  countDelta;
  sizeDelta;
  constructor() {
  }
}
class ComparatorConfig {
  fieldName1;
  ascending1;
  fieldName2;
  ascending2;
  constructor(fieldName1, ascending1, fieldName2, ascending2) {
    this.fieldName1 = fieldName1;
    this.ascending1 = ascending1;
    this.fieldName2 = fieldName2;
    this.ascending2 = ascending2;
  }
}
class WorkerCommand {
  callId;
  disposition;
  objectId;
  newObjectId;
  methodName;
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  methodArguments;
  source;
  constructor() {
  }
}
class ItemsRange {
  startPosition;
  endPosition;
  totalLength;
  items;
  constructor(startPosition, endPosition, totalLength, items) {
    this.startPosition = startPosition;
    this.endPosition = endPosition;
    this.totalLength = totalLength;
    this.items = items;
  }
}
class StaticData {
  nodeCount;
  rootNodeIndex;
  totalSize;
  maxJSObjectId;
  constructor(nodeCount, rootNodeIndex, totalSize, maxJSObjectId) {
    this.nodeCount = nodeCount;
    this.rootNodeIndex = rootNodeIndex;
    this.totalSize = totalSize;
    this.maxJSObjectId = maxJSObjectId;
  }
}
class NodeFilter {
  minNodeId;
  maxNodeId;
  allocationNodeId;
  filterName;
  constructor(minNodeId, maxNodeId) {
    this.minNodeId = minNodeId;
    this.maxNodeId = maxNodeId;
  }
  equals(o) {
    return this.minNodeId === o.minNodeId && this.maxNodeId === o.maxNodeId && this.allocationNodeId === o.allocationNodeId && this.filterName === o.filterName;
  }
}
class SearchConfig {
  query;
  caseSensitive;
  isRegex;
  shouldJump;
  jumpBackward;
  constructor(query, caseSensitive, isRegex, shouldJump, jumpBackward) {
    this.query = query;
    this.caseSensitive = caseSensitive;
    this.isRegex = isRegex;
    this.shouldJump = shouldJump;
    this.jumpBackward = jumpBackward;
  }
  toSearchRegex(_global) {
    throw new Error("Unsupported operation on search config");
  }
}
class Samples {
  timestamps;
  lastAssignedIds;
  sizes;
  constructor(timestamps, lastAssignedIds, sizes) {
    this.timestamps = timestamps;
    this.lastAssignedIds = lastAssignedIds;
    this.sizes = sizes;
  }
}
class Location {
  scriptId;
  lineNumber;
  columnNumber;
  constructor(scriptId, lineNumber, columnNumber) {
    this.scriptId = scriptId;
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
  }
}

var HeapSnapshotModel = /*#__PURE__*/Object.freeze({
  __proto__: null,
  Aggregate: Aggregate,
  AggregateForDiff: AggregateForDiff,
  AllocationNodeCallers: AllocationNodeCallers,
  AllocationStackFrame: AllocationStackFrame,
  ComparatorConfig: ComparatorConfig,
  Diff: Diff,
  DiffForClass: DiffForClass,
  Edge: Edge,
  HeapSnapshotProgressEvent: HeapSnapshotProgressEvent,
  ItemsRange: ItemsRange,
  Location: Location,
  Node: Node,
  NodeFilter: NodeFilter,
  Samples: Samples,
  SearchConfig: SearchConfig,
  SerializedAllocationNode: SerializedAllocationNode,
  StaticData: StaticData,
  WorkerCommand: WorkerCommand,
  baseSystemDistance: baseSystemDistance,
  baseUnreachableDistance: baseUnreachableDistance
});

class AllocationProfile {
  #strings;
  #nextNodeId;
  #functionInfos;
  #idToNode;
  #idToTopDownNode;
  #collapsedTopNodeIdToFunctionInfo;
  #traceTops;
  constructor(profile, liveObjectStats) {
    this.#strings = profile.strings;
    this.#nextNodeId = 1;
    this.#functionInfos = [];
    this.#idToNode = {};
    this.#idToTopDownNode = {};
    this.#collapsedTopNodeIdToFunctionInfo = {};
    this.#traceTops = null;
    this.#buildFunctionAllocationInfos(profile);
    this.#buildAllocationTree(profile, liveObjectStats);
  }
  #buildFunctionAllocationInfos(profile) {
    const strings = this.#strings;
    const functionInfoFields = profile.snapshot.meta.trace_function_info_fields;
    const functionNameOffset = functionInfoFields.indexOf("name");
    const scriptNameOffset = functionInfoFields.indexOf("script_name");
    const scriptIdOffset = functionInfoFields.indexOf("script_id");
    const lineOffset = functionInfoFields.indexOf("line");
    const columnOffset = functionInfoFields.indexOf("column");
    const functionInfoFieldCount = functionInfoFields.length;
    const rawInfos = profile.trace_function_infos;
    const infoLength = rawInfos.length;
    const functionInfos = this.#functionInfos = new Array(
      infoLength / functionInfoFieldCount
    );
    let index = 0;
    for (let i = 0; i < infoLength; i += functionInfoFieldCount) {
      functionInfos[index++] = new FunctionAllocationInfo(
        strings[rawInfos[i + functionNameOffset]],
        strings[rawInfos[i + scriptNameOffset]],
        rawInfos[i + scriptIdOffset],
        rawInfos[i + lineOffset],
        rawInfos[i + columnOffset]
      );
    }
  }
  #buildAllocationTree(profile, liveObjectStats) {
    const traceTreeRaw = profile.trace_tree;
    const functionInfos = this.#functionInfos;
    const idToTopDownNode = this.#idToTopDownNode;
    const traceNodeFields = profile.snapshot.meta.trace_node_fields;
    const nodeIdOffset = traceNodeFields.indexOf("id");
    const functionInfoIndexOffset = traceNodeFields.indexOf(
      "function_info_index"
    );
    const allocationCountOffset = traceNodeFields.indexOf("count");
    const allocationSizeOffset = traceNodeFields.indexOf("size");
    const childrenOffset = traceNodeFields.indexOf("children");
    const nodeFieldCount = traceNodeFields.length;
    function traverseNode(rawNodeArray, nodeOffset, parent) {
      const functionInfo = functionInfos[rawNodeArray[nodeOffset + functionInfoIndexOffset]];
      const id = rawNodeArray[nodeOffset + nodeIdOffset];
      const stats = liveObjectStats[id];
      const liveCount = stats ? stats.count : 0;
      const liveSize = stats ? stats.size : 0;
      const result = new TopDownAllocationNode(
        id,
        functionInfo,
        rawNodeArray[nodeOffset + allocationCountOffset],
        rawNodeArray[nodeOffset + allocationSizeOffset],
        liveCount,
        liveSize,
        parent
      );
      idToTopDownNode[id] = result;
      functionInfo.addTraceTopNode(result);
      const rawChildren = rawNodeArray[nodeOffset + childrenOffset];
      for (let i = 0; i < rawChildren.length; i += nodeFieldCount) {
        result.children.push(traverseNode(rawChildren, i, result));
      }
      return result;
    }
    return traverseNode(traceTreeRaw, 0, null);
  }
  serializeTraceTops() {
    if (this.#traceTops) {
      return this.#traceTops;
    }
    const result = this.#traceTops = [];
    const functionInfos = this.#functionInfos;
    for (let i = 0; i < functionInfos.length; i++) {
      const info = functionInfos[i];
      if (info.totalCount === 0) {
        continue;
      }
      const nodeId = this.#nextNodeId++;
      const isRoot = i === 0;
      result.push(
        this.#serializeNode(
          nodeId,
          info,
          info.totalCount,
          info.totalSize,
          info.totalLiveCount,
          info.totalLiveSize,
          !isRoot
        )
      );
      this.#collapsedTopNodeIdToFunctionInfo[nodeId] = info;
    }
    result.sort(function(a, b) {
      return b.size - a.size;
    });
    return result;
  }
  serializeCallers(nodeId) {
    let node = this.#ensureBottomUpNode(nodeId);
    const nodesWithSingleCaller = [];
    while (node.callers().length === 1) {
      node = node.callers()[0];
      nodesWithSingleCaller.push(this.#serializeCaller(node));
    }
    const branchingCallers = [];
    const callers = node.callers();
    for (let i = 0; i < callers.length; i++) {
      branchingCallers.push(this.#serializeCaller(callers[i]));
    }
    return new AllocationNodeCallers(
      nodesWithSingleCaller,
      branchingCallers
    );
  }
  serializeAllocationStack(traceNodeId) {
    let node = this.#idToTopDownNode[traceNodeId];
    const result = [];
    while (node) {
      const functionInfo = node.functionInfo;
      result.push(
        new AllocationStackFrame(
          functionInfo.functionName,
          functionInfo.scriptName,
          functionInfo.scriptId,
          functionInfo.line,
          functionInfo.column
        )
      );
      node = node.parent;
    }
    return result;
  }
  traceIds(allocationNodeId) {
    return this.#ensureBottomUpNode(allocationNodeId).traceTopIds;
  }
  #ensureBottomUpNode(nodeId) {
    let node = this.#idToNode[nodeId];
    if (!node) {
      const functionInfo = this.#collapsedTopNodeIdToFunctionInfo[nodeId];
      node = functionInfo.bottomUpRoot();
      delete this.#collapsedTopNodeIdToFunctionInfo[nodeId];
      this.#idToNode[nodeId] = node;
    }
    return node;
  }
  #serializeCaller(node) {
    const callerId = this.#nextNodeId++;
    this.#idToNode[callerId] = node;
    return this.#serializeNode(
      callerId,
      node.functionInfo,
      node.allocationCount,
      node.allocationSize,
      node.liveCount,
      node.liveSize,
      node.hasCallers()
    );
  }
  #serializeNode(nodeId, functionInfo, count, size, liveCount, liveSize, hasChildren) {
    return new SerializedAllocationNode(
      nodeId,
      functionInfo.functionName,
      functionInfo.scriptName,
      functionInfo.scriptId,
      functionInfo.line,
      functionInfo.column,
      count,
      size,
      liveCount,
      liveSize,
      hasChildren
    );
  }
}
class TopDownAllocationNode {
  id;
  functionInfo;
  allocationCount;
  allocationSize;
  liveCount;
  liveSize;
  parent;
  children;
  constructor(id, functionInfo, count, size, liveCount, liveSize, parent) {
    this.id = id;
    this.functionInfo = functionInfo;
    this.allocationCount = count;
    this.allocationSize = size;
    this.liveCount = liveCount;
    this.liveSize = liveSize;
    this.parent = parent;
    this.children = [];
  }
}
class BottomUpAllocationNode {
  functionInfo;
  allocationCount;
  allocationSize;
  liveCount;
  liveSize;
  traceTopIds;
  #callersInternal;
  constructor(functionInfo) {
    this.functionInfo = functionInfo;
    this.allocationCount = 0;
    this.allocationSize = 0;
    this.liveCount = 0;
    this.liveSize = 0;
    this.traceTopIds = [];
    this.#callersInternal = [];
  }
  addCaller(traceNode) {
    const functionInfo = traceNode.functionInfo;
    let result;
    for (let i = 0; i < this.#callersInternal.length; i++) {
      const caller = this.#callersInternal[i];
      if (caller.functionInfo === functionInfo) {
        result = caller;
        break;
      }
    }
    if (!result) {
      result = new BottomUpAllocationNode(functionInfo);
      this.#callersInternal.push(result);
    }
    return result;
  }
  callers() {
    return this.#callersInternal;
  }
  hasCallers() {
    return this.#callersInternal.length > 0;
  }
}
class FunctionAllocationInfo {
  functionName;
  scriptName;
  scriptId;
  line;
  column;
  totalCount;
  totalSize;
  totalLiveCount;
  totalLiveSize;
  #traceTops;
  #bottomUpTree;
  constructor(functionName, scriptName, scriptId, line, column) {
    this.functionName = functionName;
    this.scriptName = scriptName;
    this.scriptId = scriptId;
    this.line = line;
    this.column = column;
    this.totalCount = 0;
    this.totalSize = 0;
    this.totalLiveCount = 0;
    this.totalLiveSize = 0;
    this.#traceTops = [];
  }
  addTraceTopNode(node) {
    if (node.allocationCount === 0) {
      return;
    }
    this.#traceTops.push(node);
    this.totalCount += node.allocationCount;
    this.totalSize += node.allocationSize;
    this.totalLiveCount += node.liveCount;
    this.totalLiveSize += node.liveSize;
  }
  bottomUpRoot() {
    if (!this.#traceTops.length) {
      return null;
    }
    if (!this.#bottomUpTree) {
      this.#buildAllocationTraceTree();
    }
    return this.#bottomUpTree;
  }
  #buildAllocationTraceTree() {
    this.#bottomUpTree = new BottomUpAllocationNode(this);
    for (let i = 0; i < this.#traceTops.length; i++) {
      let node = this.#traceTops[i];
      let bottomUpNode = this.#bottomUpTree;
      const count = node.allocationCount;
      const size = node.allocationSize;
      const liveCount = node.liveCount;
      const liveSize = node.liveSize;
      const traceId = node.id;
      while (true) {
        bottomUpNode.allocationCount += count;
        bottomUpNode.allocationSize += size;
        bottomUpNode.liveCount += liveCount;
        bottomUpNode.liveSize += liveSize;
        bottomUpNode.traceTopIds.push(traceId);
        node = node.parent;
        if (node === null) {
          break;
        }
        bottomUpNode = bottomUpNode.addCaller(node);
      }
    }
  }
}

var AllocationProfile$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  AllocationProfile: AllocationProfile,
  BottomUpAllocationNode: BottomUpAllocationNode,
  FunctionAllocationInfo: FunctionAllocationInfo,
  TopDownAllocationNode: TopDownAllocationNode
});

function createExpandableBigUint32Array() {
  return new ExpandableBigUint32ArrayImpl();
}
function createFixedBigUint32Array(length, maxLengthForTesting) {
  try {
    if (maxLengthForTesting !== void 0 && length > maxLengthForTesting) ;
    return new BasicBigUint32ArrayImpl(length);
  } catch {
    return new SplitBigUint32ArrayImpl(length, maxLengthForTesting);
  }
}
class BasicBigUint32ArrayImpl extends Uint32Array {
  getValue(index) {
    return this[index];
  }
  setValue(index, value) {
    this[index] = value;
  }
  asUint32ArrayOrFail() {
    return this;
  }
  asArrayOrFail() {
    throw new Error("Not an array");
  }
}
class SplitBigUint32ArrayImpl {
  #data;
  #partLength;
  length;
  constructor(length, maxLengthForTesting) {
    this.#data = [];
    this.length = length;
    let partCount = 1;
    while (true) {
      partCount *= 2;
      this.#partLength = Math.ceil(length / partCount);
      try {
        if (maxLengthForTesting !== void 0 && this.#partLength > maxLengthForTesting) {
          throw new RangeError();
        }
        for (let i = 0; i < partCount; ++i) {
          this.#data[i] = new Uint32Array(this.#partLength);
        }
        return;
      } catch (e) {
        if (this.#partLength < 1e6) {
          throw e;
        }
      }
    }
  }
  getValue(index) {
    if (index >= 0 && index < this.length) {
      const partLength = this.#partLength;
      return this.#data[Math.floor(index / partLength)][index % partLength];
    }
    return this.#data[0][-1];
  }
  setValue(index, value) {
    if (index >= 0 && index < this.length) {
      const partLength = this.#partLength;
      this.#data[Math.floor(index / partLength)][index % partLength] = value;
    }
  }
  asUint32ArrayOrFail() {
    throw new Error("Not a Uint32Array");
  }
  asArrayOrFail() {
    throw new Error("Not an array");
  }
}
class ExpandableBigUint32ArrayImpl extends Array {
  getValue(index) {
    return this[index];
  }
  setValue(index, value) {
    this[index] = value;
  }
  asUint32ArrayOrFail() {
    throw new Error("Not a Uint32Array");
  }
  asArrayOrFail() {
    return this;
  }
}
function createBitVector(lengthOrBuffer) {
  return new BitVectorImpl(lengthOrBuffer);
}
class BitVectorImpl extends Uint8Array {
  constructor(lengthOrBuffer) {
    if (typeof lengthOrBuffer === "number") {
      super(Math.ceil(lengthOrBuffer / 8));
    } else {
      super(lengthOrBuffer);
    }
  }
  getBit(index) {
    const value = this[index >> 3] & 1 << (index & 7);
    return value !== 0;
  }
  setBit(index) {
    this[index >> 3] |= 1 << (index & 7);
  }
  clearBit(index) {
    this[index >> 3] &= ~(1 << (index & 7));
  }
  previous(index) {
    while (index !== index >> 3 << 3) {
      --index;
      if (this.getBit(index)) {
        return index;
      }
    }
    let byteIndex = (index >> 3) - 1;
    while (byteIndex >= 0 && this[byteIndex] === 0) {
      --byteIndex;
    }
    if (byteIndex < 0) {
      return -1;
    }
    for (index = (byteIndex << 3) + 7; index >= byteIndex << 3; --index) {
      if (this.getBit(index)) {
        return index;
      }
    }
    throw new Error("Unreachable");
  }
}

function swap(array, i1, i2) {
  const temp = array[i1];
  array[i1] = array[i2];
  array[i2] = temp;
}
function partition(array, comparator, left, right, pivotIndex) {
  const pivotValue = array[pivotIndex];
  swap(array, right, pivotIndex);
  let storeIndex = left;
  for (let i = left; i < right; ++i) {
    if (comparator(array[i], pivotValue) < 0) {
      swap(array, storeIndex, i);
      ++storeIndex;
    }
  }
  swap(array, right, storeIndex);
  return storeIndex;
}
function quickSortRange(array, comparator, left, right, sortWindowLeft, sortWindowRight) {
  if (right <= left) {
    return;
  }
  const pivotIndex = Math.floor(Math.random() * (right - left)) + left;
  const pivotNewIndex = partition(array, comparator, left, right, pivotIndex);
  if (sortWindowLeft < pivotNewIndex) {
    quickSortRange(
      array,
      comparator,
      left,
      pivotNewIndex - 1,
      sortWindowLeft,
      sortWindowRight
    );
  }
  if (pivotNewIndex < sortWindowRight) {
    quickSortRange(
      array,
      comparator,
      pivotNewIndex + 1,
      right,
      sortWindowLeft,
      sortWindowRight
    );
  }
}
function sortRange(array, comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight) {
  if (leftBound === 0 && rightBound === array.length - 1 && sortWindowLeft === 0 && sortWindowRight >= rightBound) {
    array.sort(comparator);
  } else {
    quickSortRange(
      array,
      comparator,
      leftBound,
      rightBound,
      sortWindowLeft,
      sortWindowRight
    );
  }
  return array;
}
const DEFAULT_COMPARATOR = (a, b) => {
  return a < b ? -1 : a > b ? 1 : 0;
};
function lowerBound(array, needle, comparator, left, right) {
  let l = 0;
  let r = array.length;
  while (l < r) {
    const m = l + r >> 1;
    if (comparator(needle, array[m]) > 0) {
      l = m + 1;
    } else {
      r = m;
    }
  }
  return r;
}

const SPECIAL_REGEX_CHARACTERS = "^[]{}()\\.^$*+?|-,";
const regexSpecialCharacters = function() {
  return SPECIAL_REGEX_CHARACTERS;
};
const createPlainTextSearchRegex = function(query, flags) {
  let regex = "";
  for (let i = 0; i < query.length; ++i) {
    const c = query.charAt(i);
    if (regexSpecialCharacters().indexOf(c) !== -1) {
      regex += "\\";
    }
    regex += c;
  }
  return new RegExp(regex, flags);
};

class Multimap {
  map = /* @__PURE__ */ new Map();
  set(key, value) {
    let set = this.map.get(key);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.map.set(key, set);
    }
    set.add(value);
  }
  get(key) {
    return this.map.get(key) || /* @__PURE__ */ new Set();
  }
  has(key) {
    return this.map.has(key);
  }
  hasValue(key, value) {
    const set = this.map.get(key);
    if (!set) {
      return false;
    }
    return set.has(value);
  }
  get size() {
    return this.map.size;
  }
  delete(key, value) {
    const values = this.get(key);
    if (!values) {
      return false;
    }
    const result = values.delete(value);
    if (!values.size) {
      this.map.delete(key);
    }
    return result;
  }
  deleteAll(key) {
    this.map.delete(key);
  }
  keysArray() {
    return [...this.map.keys()];
  }
  keys() {
    return this.map.keys();
  }
  valuesArray() {
    const result = [];
    for (const set of this.map.values()) {
      result.push(...set.values());
    }
    return result;
  }
  clear() {
    this.map.clear();
  }
}

function withResolvers() {
  if (Promise.withResolvers) return Promise.withResolvers();
  let resolveFn;
  let rejectFn;
  const promise = new Promise(function deferredPromiseExecutor(resolve, reject) {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return {
    promise,
    get resolve() {
      return resolveFn;
    },
    get reject() {
      return rejectFn;
    }
  };
}

class HeapSnapshotEdge {
  snapshot;
  edges;
  edgeIndex;
  constructor(snapshot, edgeIndex) {
    this.snapshot = snapshot;
    this.edges = snapshot.containmentEdges;
    this.edgeIndex = edgeIndex || 0;
  }
  clone() {
    return new HeapSnapshotEdge(this.snapshot, this.edgeIndex);
  }
  hasStringName() {
    throw new Error("Not implemented");
  }
  name() {
    throw new Error("Not implemented");
  }
  node() {
    return this.snapshot.createNode(this.nodeIndex());
  }
  nodeIndex() {
    if (typeof this.snapshot.edgeToNodeOffset === "undefined") {
      throw new Error("edgeToNodeOffset is undefined");
    }
    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeToNodeOffset);
  }
  toString() {
    return "HeapSnapshotEdge: " + this.name();
  }
  type() {
    return this.snapshot.edgeTypes[this.rawType()];
  }
  itemIndex() {
    return this.edgeIndex;
  }
  serialize() {
    return new Edge(
      this.name(),
      this.node().serialize(),
      this.type(),
      this.edgeIndex
    );
  }
  rawType() {
    if (typeof this.snapshot.edgeTypeOffset === "undefined") {
      throw new Error("edgeTypeOffset is undefined");
    }
    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeTypeOffset);
  }
  isInternal() {
    throw new Error("Not implemented");
  }
  isInvisible() {
    throw new Error("Not implemented");
  }
  isWeak() {
    throw new Error("Not implemented");
  }
  getValueForSorting(_fieldName) {
    throw new Error("Not implemented");
  }
  nameIndex() {
    throw new Error("Not implemented");
  }
}
class HeapSnapshotNodeIndexProvider {
  #node;
  constructor(snapshot) {
    this.#node = snapshot.createNode();
  }
  itemForIndex(index) {
    this.#node.nodeIndex = index;
    return this.#node;
  }
}
class HeapSnapshotEdgeIndexProvider {
  #edge;
  constructor(snapshot) {
    this.#edge = snapshot.createEdge(0);
  }
  itemForIndex(index) {
    this.#edge.edgeIndex = index;
    return this.#edge;
  }
}
class HeapSnapshotRetainerEdgeIndexProvider {
  #retainerEdge;
  constructor(snapshot) {
    this.#retainerEdge = snapshot.createRetainingEdge(0);
  }
  itemForIndex(index) {
    this.#retainerEdge.setRetainerIndex(index);
    return this.#retainerEdge;
  }
}
class HeapSnapshotEdgeIterator {
  #sourceNode;
  edge;
  constructor(node) {
    this.#sourceNode = node;
    this.edge = node.snapshot.createEdge(node.edgeIndexesStart());
  }
  hasNext() {
    return this.edge.edgeIndex < this.#sourceNode.edgeIndexesEnd();
  }
  item() {
    return this.edge;
  }
  next() {
    if (typeof this.edge.snapshot.edgeFieldsCount === "undefined") {
      throw new Error("edgeFieldsCount is undefined");
    }
    this.edge.edgeIndex += this.edge.snapshot.edgeFieldsCount;
  }
}
class HeapSnapshotRetainerEdge {
  snapshot;
  #retainerIndexInternal;
  #globalEdgeIndex;
  #retainingNodeIndex;
  #edgeInstance;
  #nodeInstance;
  constructor(snapshot, retainerIndex) {
    this.snapshot = snapshot;
    this.setRetainerIndex(retainerIndex);
  }
  clone() {
    return new HeapSnapshotRetainerEdge(this.snapshot, this.retainerIndex());
  }
  hasStringName() {
    return this.edge().hasStringName();
  }
  name() {
    return this.edge().name();
  }
  nameIndex() {
    return this.edge().nameIndex();
  }
  node() {
    return this.nodeInternal();
  }
  nodeIndex() {
    if (typeof this.#retainingNodeIndex === "undefined") {
      throw new Error("retainingNodeIndex is undefined");
    }
    return this.#retainingNodeIndex;
  }
  retainerIndex() {
    return this.#retainerIndexInternal;
  }
  setRetainerIndex(retainerIndex) {
    if (retainerIndex === this.#retainerIndexInternal) {
      return;
    }
    if (!this.snapshot.retainingEdges || !this.snapshot.retainingNodes) {
      throw new Error(
        "Snapshot does not contain retaining edges or retaining nodes"
      );
    }
    this.#retainerIndexInternal = retainerIndex;
    this.#globalEdgeIndex = this.snapshot.retainingEdges[retainerIndex];
    this.#retainingNodeIndex = this.snapshot.retainingNodes[retainerIndex];
    this.#edgeInstance = null;
    this.#nodeInstance = null;
  }
  set edgeIndex(edgeIndex) {
    this.setRetainerIndex(edgeIndex);
  }
  nodeInternal() {
    if (!this.#nodeInstance) {
      this.#nodeInstance = this.snapshot.createNode(this.#retainingNodeIndex);
    }
    return this.#nodeInstance;
  }
  edge() {
    if (!this.#edgeInstance) {
      this.#edgeInstance = this.snapshot.createEdge(this.#globalEdgeIndex);
    }
    return this.#edgeInstance;
  }
  toString() {
    return this.edge().toString();
  }
  itemIndex() {
    return this.#retainerIndexInternal;
  }
  serialize() {
    const node = this.node();
    const serializedNode = node.serialize();
    serializedNode.distance = this.#distance();
    serializedNode.ignored = this.snapshot.isNodeIgnoredInRetainersView(
      node.nodeIndex
    );
    return new Edge(
      this.name(),
      serializedNode,
      this.type(),
      this.#globalEdgeIndex
    );
  }
  type() {
    return this.edge().type();
  }
  isInternal() {
    return this.edge().isInternal();
  }
  getValueForSorting(fieldName) {
    if (fieldName === "!edgeDistance") {
      return this.#distance();
    }
    throw new Error("Invalid field name");
  }
  #distance() {
    if (this.snapshot.isEdgeIgnoredInRetainersView(this.#globalEdgeIndex)) {
      return baseUnreachableDistance;
    }
    return this.node().distanceForRetainersView();
  }
}
class HeapSnapshotRetainerEdgeIterator {
  #retainersEnd;
  retainer;
  constructor(retainedNode) {
    const snapshot = retainedNode.snapshot;
    const retainedNodeOrdinal = retainedNode.ordinal();
    if (!snapshot.firstRetainerIndex) {
      throw new Error("Snapshot does not contain firstRetainerIndex");
    }
    const retainerIndex = snapshot.firstRetainerIndex[retainedNodeOrdinal];
    this.#retainersEnd = snapshot.firstRetainerIndex[retainedNodeOrdinal + 1];
    this.retainer = snapshot.createRetainingEdge(retainerIndex);
  }
  hasNext() {
    return this.retainer.retainerIndex() < this.#retainersEnd;
  }
  item() {
    return this.retainer;
  }
  next() {
    this.retainer.setRetainerIndex(this.retainer.retainerIndex() + 1);
  }
}
class HeapSnapshotNode {
  snapshot;
  nodeIndex;
  constructor(snapshot, nodeIndex) {
    this.snapshot = snapshot;
    this.nodeIndex = nodeIndex || 0;
  }
  distance() {
    return this.snapshot.nodeDistances[this.nodeIndex / this.snapshot.nodeFieldCount];
  }
  distanceForRetainersView() {
    return this.snapshot.getDistanceForRetainersView(this.nodeIndex);
  }
  className() {
    return this.snapshot.strings[this.classIndex()];
  }
  classIndex() {
    return this.#detachednessAndClassIndex() >>> SHIFT_FOR_CLASS_INDEX;
  }
  // Returns a key which can uniquely describe both the class name for this node
  // and its Location, if relevant. These keys are meant to be cheap to produce,
  // so that building aggregates is fast. These keys are NOT the same as the
  // keys exposed to the frontend by functions such as aggregatesWithFilter and
  // aggregatesForDiff.
  classKeyInternal() {
    if (this.rawType() !== this.snapshot.nodeObjectType) {
      return this.classIndex();
    }
    const location = this.snapshot.getLocation(this.nodeIndex);
    return location ? `${location.scriptId},${location.lineNumber},${location.columnNumber},${this.className()}` : this.classIndex();
  }
  setClassIndex(index) {
    let value = this.#detachednessAndClassIndex();
    value &= BITMASK_FOR_DOM_LINK_STATE;
    value |= index << SHIFT_FOR_CLASS_INDEX;
    this.#setDetachednessAndClassIndex(value);
    if (this.classIndex() !== index) {
      throw new Error("String index overflow");
    }
  }
  dominatorIndex() {
    const nodeFieldCount = this.snapshot.nodeFieldCount;
    return this.snapshot.dominatorsTree[this.nodeIndex / this.snapshot.nodeFieldCount] * nodeFieldCount;
  }
  edges() {
    return new HeapSnapshotEdgeIterator(this);
  }
  edgesCount() {
    return (this.edgeIndexesEnd() - this.edgeIndexesStart()) / this.snapshot.edgeFieldsCount;
  }
  id() {
    throw new Error("Not implemented");
  }
  rawName() {
    return this.snapshot.strings[this.rawNameIndex()];
  }
  isRoot() {
    return this.nodeIndex === this.snapshot.rootNodeIndex;
  }
  isUserRoot() {
    throw new Error("Not implemented");
  }
  isHidden() {
    throw new Error("Not implemented");
  }
  isArray() {
    throw new Error("Not implemented");
  }
  isSynthetic() {
    throw new Error("Not implemented");
  }
  isDocumentDOMTreesRoot() {
    throw new Error("Not implemented");
  }
  name() {
    return this.rawName();
  }
  retainedSize() {
    return this.snapshot.retainedSizes[this.ordinal()];
  }
  retainers() {
    return new HeapSnapshotRetainerEdgeIterator(this);
  }
  retainersCount() {
    const snapshot = this.snapshot;
    const ordinal = this.ordinal();
    return snapshot.firstRetainerIndex[ordinal + 1] - snapshot.firstRetainerIndex[ordinal];
  }
  selfSize() {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(
      this.nodeIndex + snapshot.nodeSelfSizeOffset
    );
  }
  type() {
    return this.snapshot.nodeTypes[this.rawType()];
  }
  traceNodeId() {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(
      this.nodeIndex + snapshot.nodeTraceNodeIdOffset
    );
  }
  itemIndex() {
    return this.nodeIndex;
  }
  serialize() {
    return new Node(
      this.id(),
      this.name(),
      this.distance(),
      this.nodeIndex,
      this.retainedSize(),
      this.selfSize(),
      this.type()
    );
  }
  rawNameIndex() {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeNameOffset);
  }
  edgeIndexesStart() {
    return this.snapshot.firstEdgeIndexes[this.ordinal()];
  }
  edgeIndexesEnd() {
    return this.snapshot.firstEdgeIndexes[this.ordinal() + 1];
  }
  ordinal() {
    return this.nodeIndex / this.snapshot.nodeFieldCount;
  }
  nextNodeIndex() {
    return this.nodeIndex + this.snapshot.nodeFieldCount;
  }
  rawType() {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeTypeOffset);
  }
  isFlatConsString() {
    if (this.rawType() !== this.snapshot.nodeConsStringType) {
      return false;
    }
    for (let iter = this.edges(); iter.hasNext(); iter.next()) {
      const edge = iter.edge;
      if (!edge.isInternal()) {
        continue;
      }
      const edgeName = edge.name();
      if ((edgeName === "first" || edgeName === "second") && edge.node().name() === "") {
        return true;
      }
    }
    return false;
  }
  #detachednessAndClassIndex() {
    const { snapshot, nodeIndex } = this;
    const nodeDetachednessAndClassIndexOffset = snapshot.nodeDetachednessAndClassIndexOffset;
    return nodeDetachednessAndClassIndexOffset !== -1 ? snapshot.nodes.getValue(nodeIndex + nodeDetachednessAndClassIndexOffset) : snapshot.detachednessAndClassIndexArray[nodeIndex / snapshot.nodeFieldCount];
  }
  #setDetachednessAndClassIndex(value) {
    const { snapshot, nodeIndex } = this;
    const nodeDetachednessAndClassIndexOffset = snapshot.nodeDetachednessAndClassIndexOffset;
    if (nodeDetachednessAndClassIndexOffset !== -1) {
      snapshot.nodes.setValue(
        nodeIndex + nodeDetachednessAndClassIndexOffset,
        value
      );
    } else {
      snapshot.detachednessAndClassIndexArray[nodeIndex / snapshot.nodeFieldCount] = value;
    }
  }
  detachedness() {
    return this.#detachednessAndClassIndex() & BITMASK_FOR_DOM_LINK_STATE;
  }
  setDetachedness(detachedness) {
    let value = this.#detachednessAndClassIndex();
    value &= -4;
    value |= detachedness;
    this.#setDetachednessAndClassIndex(value);
  }
}
class HeapSnapshotNodeIterator {
  node;
  #nodesLength;
  constructor(node) {
    this.node = node;
    this.#nodesLength = node.snapshot.nodes.length;
  }
  hasNext() {
    return this.node.nodeIndex < this.#nodesLength;
  }
  item() {
    return this.node;
  }
  next() {
    this.node.nodeIndex = this.node.nextNodeIndex();
  }
}
class HeapSnapshotIndexRangeIterator {
  #itemProvider;
  #indexes;
  #position;
  constructor(itemProvider, indexes) {
    this.#itemProvider = itemProvider;
    this.#indexes = indexes;
    this.#position = 0;
  }
  hasNext() {
    return this.#position < this.#indexes.length;
  }
  item() {
    const index = this.#indexes[this.#position];
    return this.#itemProvider.itemForIndex(index);
  }
  next() {
    ++this.#position;
  }
}
class HeapSnapshotFilteredIterator {
  #iterator;
  #filter;
  constructor(iterator, filter) {
    this.#iterator = iterator;
    this.#filter = filter;
    this.skipFilteredItems();
  }
  hasNext() {
    return this.#iterator.hasNext();
  }
  item() {
    return this.#iterator.item();
  }
  next() {
    this.#iterator.next();
    this.skipFilteredItems();
  }
  skipFilteredItems() {
    while (this.#iterator.hasNext() && this.#filter && !this.#filter(this.#iterator.item())) {
      this.#iterator.next();
    }
  }
}
function serializeUIString(string, values = {}) {
  const serializedMessage = { string, values };
  return JSON.stringify(serializedMessage);
}
class HeapSnapshotProgress {
  #dispatcher;
  constructor(dispatcher) {
    this.#dispatcher = dispatcher;
  }
  updateStatus(status) {
    this.sendUpdateEvent(serializeUIString(status));
  }
  updateProgress(title, value, total) {
    const percentValue = ((total ? value / total : 0) * 100).toFixed(0);
    this.sendUpdateEvent(serializeUIString(title, { PH1: percentValue }));
  }
  reportProblem(error) {
    if (this.#dispatcher) {
      this.#dispatcher.sendEvent(
        HeapSnapshotProgressEvent.BrokenSnapshot,
        error
      );
    }
  }
  sendUpdateEvent(serializedText) {
    if (this.#dispatcher) {
      this.#dispatcher.sendEvent(
        HeapSnapshotProgressEvent.Update,
        serializedText
      );
    }
  }
}
function appendToProblemReport(report, messageOrNodeIndex) {
  if (report.length > 100) {
    return;
  }
  report.push(messageOrNodeIndex);
}
function formatProblemReport(snapshot, report) {
  const node = snapshot.rootNode();
  return report.map((messageOrNodeIndex) => {
    if (typeof messageOrNodeIndex === "string") {
      return messageOrNodeIndex;
    }
    node.nodeIndex = messageOrNodeIndex;
    return `${node.name()} @${node.id()}`;
  }).join("\n  ");
}
function reportProblemToPrimaryWorker(problemReport, port) {
  port.postMessage({ problemReport });
}
class SecondaryInitManager {
  argsStep1;
  argsStep2;
  argsStep3;
  constructor(port) {
    const { promise: argsStep1, resolve: resolveArgsStep1 } = withResolvers();
    this.argsStep1 = argsStep1;
    const { promise: argsStep2, resolve: resolveArgsStep2 } = withResolvers();
    this.argsStep2 = argsStep2;
    const { promise: argsStep3, resolve: resolveArgsStep3 } = withResolvers();
    this.argsStep3 = argsStep3;
    port.on("message", (data) => {
      switch (data.step) {
        case 1:
          resolveArgsStep1(data.args);
          break;
        case 2:
          resolveArgsStep2(data.args);
          break;
        case 3:
          resolveArgsStep3(data.args);
          break;
      }
    });
    void this.initialize(port);
  }
  async getNodeSelfSizes() {
    return (await this.argsStep3).nodeSelfSizes;
  }
  async initialize(port) {
    try {
      const argsStep1 = await this.argsStep1;
      const retainers = HeapSnapshot.buildRetainers(argsStep1);
      const argsStep2 = await this.argsStep2;
      const args = {
        ...argsStep2,
        ...argsStep1,
        ...retainers,
        essentialEdges: createBitVector(
          argsStep2.essentialEdgesBuffer
        ),
        port,
        nodeSelfSizesPromise: this.getNodeSelfSizes()
      };
      const dominatorsAndRetainedSizes = await HeapSnapshot.calculateDominatorsAndRetainedSizes(args);
      const dominatedNodesOutputs = HeapSnapshot.buildDominatedNodes({
        ...args,
        ...dominatorsAndRetainedSizes
      });
      const results = {
        ...retainers,
        ...dominatorsAndRetainedSizes,
        ...dominatedNodesOutputs
      };
      port.postMessage({ resultsFromSecondWorker: results }, [
        // TODO: node should be ok with this
        results.dominatorsTree.buffer,
        results.firstRetainerIndex.buffer,
        results.retainedSizes.buffer,
        results.retainingEdges.buffer,
        results.retainingNodes.buffer,
        results.dominatedNodes.buffer,
        results.firstDominatedNodeIndex.buffer
      ]);
    } catch (e) {
      port.postMessage({ error: e + "\n" + e?.stack });
    }
  }
}
const BITMASK_FOR_DOM_LINK_STATE = 3;
const SHIFT_FOR_CLASS_INDEX = 2;
const MIN_INTERFACE_PROPERTY_COUNT = 1;
const MAX_INTERFACE_NAME_LENGTH = 120;
const MIN_OBJECT_COUNT_PER_INTERFACE = 2;
const MIN_OBJECT_PROPORTION_PER_INTERFACE = 1e3;
class HeapSnapshot {
  nodes;
  containmentEdges;
  #metaNode;
  #rawSamples;
  #samples = null;
  strings;
  #locations;
  #progress;
  #noDistance = -5;
  rootNodeIndexInternal = 0;
  #snapshotDiffs = {};
  #aggregatesForDiffInternal;
  #aggregates = {};
  #aggregatesSortedFlags = {};
  profile;
  nodeTypeOffset;
  nodeNameOffset;
  nodeIdOffset;
  nodeSelfSizeOffset;
  #nodeEdgeCountOffset;
  nodeTraceNodeIdOffset;
  nodeFieldCount;
  nodeTypes;
  nodeArrayType;
  nodeHiddenType;
  nodeObjectType;
  nodeNativeType;
  nodeStringType;
  nodeConsStringType;
  nodeSlicedStringType;
  nodeCodeType;
  nodeSyntheticType;
  nodeClosureType;
  nodeRegExpType;
  edgeFieldsCount;
  edgeTypeOffset;
  edgeNameOffset;
  edgeToNodeOffset;
  edgeTypes;
  edgeElementType;
  edgeHiddenType;
  edgeInternalType;
  edgeShortcutType;
  edgeWeakType;
  edgeInvisibleType;
  edgePropertyType;
  #locationIndexOffset;
  #locationScriptIdOffset;
  #locationLineOffset;
  #locationColumnOffset;
  #locationFieldCount;
  nodeCount;
  #edgeCount;
  retainedSizes;
  firstEdgeIndexes;
  retainingNodes;
  retainingEdges;
  firstRetainerIndex;
  nodeDistances;
  firstDominatedNodeIndex;
  dominatedNodes;
  dominatorsTree;
  #allocationProfile;
  nodeDetachednessAndClassIndexOffset;
  #locationMap;
  #ignoredNodesInRetainersView = /* @__PURE__ */ new Set();
  #ignoredEdgesInRetainersView = /* @__PURE__ */ new Set();
  #nodeDistancesForRetainersView;
  #edgeNamesThatAreNotWeakMaps;
  detachednessAndClassIndexArray;
  #interfaceNames = /* @__PURE__ */ new Map();
  #interfaceDefinitions;
  constructor(profile, progress) {
    this.nodes = profile.nodes;
    this.containmentEdges = profile.edges;
    this.#metaNode = profile.snapshot.meta;
    this.#rawSamples = profile.samples;
    this.strings = profile.strings;
    this.#locations = profile.locations;
    this.#progress = progress;
    if (profile.snapshot.root_index) {
      this.rootNodeIndexInternal = profile.snapshot.root_index;
    }
    this.profile = profile;
    this.#edgeNamesThatAreNotWeakMaps = createBitVector(this.strings.length);
  }
  async initialize(secondWorker) {
    const meta = this.#metaNode;
    this.nodeTypeOffset = meta.node_fields.indexOf("type");
    this.nodeNameOffset = meta.node_fields.indexOf("name");
    this.nodeIdOffset = meta.node_fields.indexOf("id");
    this.nodeSelfSizeOffset = meta.node_fields.indexOf("self_size");
    this.#nodeEdgeCountOffset = meta.node_fields.indexOf("edge_count");
    this.nodeTraceNodeIdOffset = meta.node_fields.indexOf("trace_node_id");
    this.nodeDetachednessAndClassIndexOffset = meta.node_fields.indexOf("detachedness");
    this.nodeFieldCount = meta.node_fields.length;
    this.nodeTypes = meta.node_types[this.nodeTypeOffset];
    this.nodeArrayType = this.nodeTypes.indexOf("array");
    this.nodeHiddenType = this.nodeTypes.indexOf("hidden");
    this.nodeObjectType = this.nodeTypes.indexOf("object");
    this.nodeNativeType = this.nodeTypes.indexOf("native");
    this.nodeStringType = this.nodeTypes.indexOf("string");
    this.nodeConsStringType = this.nodeTypes.indexOf("concatenated string");
    this.nodeSlicedStringType = this.nodeTypes.indexOf("sliced string");
    this.nodeCodeType = this.nodeTypes.indexOf("code");
    this.nodeSyntheticType = this.nodeTypes.indexOf("synthetic");
    this.nodeClosureType = this.nodeTypes.indexOf("closure");
    this.nodeRegExpType = this.nodeTypes.indexOf("regexp");
    this.edgeFieldsCount = meta.edge_fields.length;
    this.edgeTypeOffset = meta.edge_fields.indexOf("type");
    this.edgeNameOffset = meta.edge_fields.indexOf("name_or_index");
    this.edgeToNodeOffset = meta.edge_fields.indexOf("to_node");
    this.edgeTypes = meta.edge_types[this.edgeTypeOffset];
    this.edgeTypes.push("invisible");
    this.edgeElementType = this.edgeTypes.indexOf("element");
    this.edgeHiddenType = this.edgeTypes.indexOf("hidden");
    this.edgeInternalType = this.edgeTypes.indexOf("internal");
    this.edgeShortcutType = this.edgeTypes.indexOf("shortcut");
    this.edgeWeakType = this.edgeTypes.indexOf("weak");
    this.edgeInvisibleType = this.edgeTypes.indexOf("invisible");
    this.edgePropertyType = this.edgeTypes.indexOf("property");
    const locationFields = meta.location_fields || [];
    this.#locationIndexOffset = locationFields.indexOf("object_index");
    this.#locationScriptIdOffset = locationFields.indexOf("script_id");
    this.#locationLineOffset = locationFields.indexOf("line");
    this.#locationColumnOffset = locationFields.indexOf("column");
    this.#locationFieldCount = locationFields.length;
    this.nodeCount = this.nodes.length / this.nodeFieldCount;
    this.#edgeCount = this.containmentEdges.length / this.edgeFieldsCount;
    this.#progress.updateStatus("Building edge indexes\u2026");
    this.firstEdgeIndexes = new Uint32Array(this.nodeCount + 1);
    this.buildEdgeIndexes();
    this.#progress.updateStatus("Building retainers\u2026");
    const resultsFromSecondWorker = this.startInitStep1InSecondThread(secondWorker);
    this.#progress.updateStatus("Propagating DOM state\u2026");
    this.propagateDOMState();
    this.#progress.updateStatus("Calculating node flags\u2026");
    this.calculateFlags();
    this.#progress.updateStatus("Building dominated nodes\u2026");
    this.startInitStep2InSecondThread(secondWorker);
    this.#progress.updateStatus("Calculating shallow sizes\u2026");
    this.calculateShallowSizes();
    this.#progress.updateStatus("Calculating retained sizes\u2026");
    this.startInitStep3InSecondThread(secondWorker);
    this.#progress.updateStatus("Calculating distances\u2026");
    this.nodeDistances = new Int32Array(this.nodeCount);
    this.calculateDistances(
      /* isForRetainersView=*/
      false
    );
    this.#progress.updateStatus("Calculating object names\u2026");
    this.calculateObjectNames();
    this.applyInterfaceDefinitions(this.inferInterfaceDefinitions());
    this.#progress.updateStatus("Calculating samples\u2026");
    this.buildSamples();
    this.#progress.updateStatus("Building locations\u2026");
    this.buildLocationMap();
    this.#progress.updateStatus("Calculating retained sizes\u2026");
    await this.installResultsFromSecondThread(resultsFromSecondWorker);
    this.#progress.updateStatus("Calculating statistics\u2026");
    this.calculateStatistics();
    if (this.profile.snapshot.trace_function_count) {
      this.#progress.updateStatus("Building allocation statistics\u2026");
      const nodes = this.nodes;
      const nodesLength = nodes.length;
      const nodeFieldCount = this.nodeFieldCount;
      const node = this.rootNode();
      const liveObjects = {};
      for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
        node.nodeIndex = nodeIndex;
        const traceNodeId = node.traceNodeId();
        let stats = liveObjects[traceNodeId];
        if (!stats) {
          liveObjects[traceNodeId] = stats = { count: 0, size: 0, ids: [] };
        }
        stats.count++;
        stats.size += node.selfSize();
        stats.ids.push(node.id());
      }
      this.#allocationProfile = new AllocationProfile(
        this.profile,
        liveObjects
      );
    }
    this.#progress.updateStatus("Finished processing.");
  }
  startInitStep1InSecondThread(secondWorker) {
    const resultsFromSecondWorker = new Promise(
      (resolve, reject) => {
        secondWorker.on("message", (data) => {
          if (data?.problemReport) {
            const problemReport = data.problemReport;
            this.#progress.reportProblem(
              formatProblemReport(this, problemReport)
            );
          } else if (data?.resultsFromSecondWorker) {
            const resultsFromSecondWorker2 = data.resultsFromSecondWorker;
            resolve(resultsFromSecondWorker2);
          } else if (data?.error) {
            reject(data.error);
          }
        });
      }
    );
    const edgeCount = this.#edgeCount;
    const {
      containmentEdges,
      edgeToNodeOffset,
      edgeFieldsCount,
      nodeFieldCount
    } = this;
    const edgeToNodeOrdinals = new Uint32Array(edgeCount);
    for (let edgeOrdinal = 0; edgeOrdinal < edgeCount; ++edgeOrdinal) {
      const toNodeIndex = containmentEdges.getValue(
        edgeOrdinal * edgeFieldsCount + edgeToNodeOffset
      );
      if (toNodeIndex % nodeFieldCount) {
        throw new Error("Invalid toNodeIndex " + toNodeIndex);
      }
      edgeToNodeOrdinals[edgeOrdinal] = toNodeIndex / nodeFieldCount;
    }
    const args = {
      edgeToNodeOrdinals,
      firstEdgeIndexes: this.firstEdgeIndexes,
      nodeCount: this.nodeCount,
      edgeFieldsCount: this.edgeFieldsCount,
      nodeFieldCount: this.nodeFieldCount
    };
    secondWorker.postMessage({ step: 1, args }, [edgeToNodeOrdinals.buffer]);
    return resultsFromSecondWorker;
  }
  startInitStep2InSecondThread(secondWorker) {
    const rootNodeOrdinal = this.rootNodeIndexInternal / this.nodeFieldCount;
    const essentialEdges = this.initEssentialEdges();
    const args = {
      rootNodeOrdinal,
      essentialEdgesBuffer: essentialEdges.buffer
    };
    secondWorker.postMessage({ step: 2, args }, [essentialEdges.buffer]);
  }
  startInitStep3InSecondThread(secondWorker) {
    const { nodes, nodeFieldCount, nodeSelfSizeOffset, nodeCount } = this;
    const nodeSelfSizes = new Uint32Array(nodeCount);
    for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
      nodeSelfSizes[nodeOrdinal] = nodes.getValue(
        nodeOrdinal * nodeFieldCount + nodeSelfSizeOffset
      );
    }
    const args = { nodeSelfSizes };
    secondWorker.postMessage({ step: 3, args }, [nodeSelfSizes.buffer]);
  }
  async installResultsFromSecondThread(resultsFromSecondWorker) {
    const results = await resultsFromSecondWorker;
    this.dominatedNodes = results.dominatedNodes;
    this.dominatorsTree = results.dominatorsTree;
    this.firstDominatedNodeIndex = results.firstDominatedNodeIndex;
    this.firstRetainerIndex = results.firstRetainerIndex;
    this.retainedSizes = results.retainedSizes;
    this.retainingEdges = results.retainingEdges;
    this.retainingNodes = results.retainingNodes;
  }
  buildEdgeIndexes() {
    const nodes = this.nodes;
    const nodeCount = this.nodeCount;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const nodeFieldCount = this.nodeFieldCount;
    const edgeFieldsCount = this.edgeFieldsCount;
    const nodeEdgeCountOffset = this.#nodeEdgeCountOffset;
    firstEdgeIndexes[nodeCount] = this.containmentEdges.length;
    for (let nodeOrdinal = 0, edgeIndex = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
      firstEdgeIndexes[nodeOrdinal] = edgeIndex;
      edgeIndex += nodes.getValue(nodeOrdinal * nodeFieldCount + nodeEdgeCountOffset) * edgeFieldsCount;
    }
  }
  static buildRetainers(inputs) {
    const {
      edgeToNodeOrdinals,
      firstEdgeIndexes,
      nodeCount,
      edgeFieldsCount,
      nodeFieldCount
    } = inputs;
    const edgeCount = edgeToNodeOrdinals.length;
    const retainingNodes = new Uint32Array(edgeCount);
    const retainingEdges = new Uint32Array(edgeCount);
    const firstRetainerIndex = new Uint32Array(nodeCount + 1);
    for (let edgeOrdinal = 0; edgeOrdinal < edgeCount; ++edgeOrdinal) {
      const toNodeOrdinal = edgeToNodeOrdinals[edgeOrdinal];
      ++firstRetainerIndex[toNodeOrdinal];
    }
    for (let i = 0, firstUnusedRetainerSlot = 0; i < nodeCount; i++) {
      const retainersCount = firstRetainerIndex[i];
      firstRetainerIndex[i] = firstUnusedRetainerSlot;
      retainingNodes[firstUnusedRetainerSlot] = retainersCount;
      firstUnusedRetainerSlot += retainersCount;
    }
    firstRetainerIndex[nodeCount] = retainingNodes.length;
    let nextNodeFirstEdgeIndex = firstEdgeIndexes[0];
    for (let srcNodeOrdinal = 0; srcNodeOrdinal < nodeCount; ++srcNodeOrdinal) {
      const firstEdgeIndex = nextNodeFirstEdgeIndex;
      nextNodeFirstEdgeIndex = firstEdgeIndexes[srcNodeOrdinal + 1];
      const srcNodeIndex = srcNodeOrdinal * nodeFieldCount;
      for (let edgeIndex = firstEdgeIndex; edgeIndex < nextNodeFirstEdgeIndex; edgeIndex += edgeFieldsCount) {
        const toNodeOrdinal = edgeToNodeOrdinals[edgeIndex / edgeFieldsCount];
        const firstRetainerSlotIndex = firstRetainerIndex[toNodeOrdinal];
        const nextUnusedRetainerSlotIndex = firstRetainerSlotIndex + --retainingNodes[firstRetainerSlotIndex];
        retainingNodes[nextUnusedRetainerSlotIndex] = srcNodeIndex;
        retainingEdges[nextUnusedRetainerSlotIndex] = edgeIndex;
      }
    }
    return {
      retainingNodes,
      retainingEdges,
      firstRetainerIndex
    };
  }
  allNodes() {
    return new HeapSnapshotNodeIterator(this.rootNode());
  }
  rootNode() {
    return this.createNode(this.rootNodeIndexInternal);
  }
  get rootNodeIndex() {
    return this.rootNodeIndexInternal;
  }
  get totalSize() {
    return this.rootNode().retainedSize() + (this.profile.snapshot.extra_native_bytes ?? 0);
  }
  createFilter(nodeFilter) {
    const { minNodeId, maxNodeId, allocationNodeId, filterName } = nodeFilter;
    let filter;
    if (typeof allocationNodeId === "number") {
      filter = this.createAllocationStackFilter(allocationNodeId);
      if (!filter) {
        throw new Error("Unable to create filter");
      }
      filter.key = "AllocationNodeId: " + allocationNodeId;
    } else if (typeof minNodeId === "number" && typeof maxNodeId === "number") {
      filter = this.createNodeIdFilter(minNodeId, maxNodeId);
      filter.key = "NodeIdRange: " + minNodeId + ".." + maxNodeId;
    } else if (filterName !== void 0) {
      filter = this.createNamedFilter(filterName);
      filter.key = "NamedFilter: " + filterName;
    }
    return filter;
  }
  search(searchConfig, nodeFilter) {
    const query = searchConfig.query;
    function filterString(matchedStringIndexes, string, index) {
      if (string.indexOf(query) !== -1) {
        matchedStringIndexes.add(index);
      }
      return matchedStringIndexes;
    }
    const regexp = searchConfig.isRegex ? new RegExp(query) : createPlainTextSearchRegex(query, "i");
    function filterRegexp(matchedStringIndexes, string, index) {
      if (regexp.test(string)) {
        matchedStringIndexes.add(index);
      }
      return matchedStringIndexes;
    }
    const useRegExp = searchConfig.isRegex || !searchConfig.caseSensitive;
    const stringFilter = useRegExp ? filterRegexp : filterString;
    const stringIndexes = this.strings.reduce(stringFilter, /* @__PURE__ */ new Set());
    const filter = this.createFilter(nodeFilter);
    const nodeIds = [];
    const nodesLength = this.nodes.length;
    const nodes = this.nodes;
    const nodeNameOffset = this.nodeNameOffset;
    const nodeIdOffset = this.nodeIdOffset;
    const nodeFieldCount = this.nodeFieldCount;
    const node = this.rootNode();
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      if (filter && !filter(node)) {
        continue;
      }
      if (node.selfSize() === 0) {
        continue;
      }
      const name = node.name();
      if (name === node.rawName()) {
        if (stringIndexes.has(nodes.getValue(nodeIndex + nodeNameOffset))) {
          nodeIds.push(nodes.getValue(nodeIndex + nodeIdOffset));
        }
      } else if (useRegExp ? regexp.test(name) : name.indexOf(query) !== -1) {
        nodeIds.push(nodes.getValue(nodeIndex + nodeIdOffset));
      }
    }
    return nodeIds;
  }
  aggregatesWithFilter(nodeFilter) {
    const filter = this.createFilter(nodeFilter);
    const key = filter ? filter.key : "allObjects";
    return this.getAggregatesByClassKey(false, key, filter);
  }
  createNodeIdFilter(minNodeId, maxNodeId) {
    function nodeIdFilter(node) {
      const id = node.id();
      return id > minNodeId && id <= maxNodeId;
    }
    return nodeIdFilter;
  }
  createAllocationStackFilter(bottomUpAllocationNodeId) {
    if (!this.#allocationProfile) {
      throw new Error("No Allocation Profile provided");
    }
    const traceIds = this.#allocationProfile.traceIds(bottomUpAllocationNodeId);
    if (!traceIds.length) {
      return void 0;
    }
    const set = {};
    for (let i = 0; i < traceIds.length; i++) {
      set[traceIds[i]] = true;
    }
    function traceIdFilter(node) {
      return Boolean(set[node.traceNodeId()]);
    }
    return traceIdFilter;
  }
  createNamedFilter(filterName) {
    const bitmap = createBitVector(this.nodeCount);
    const getBit = (node) => {
      const ordinal = node.nodeIndex / this.nodeFieldCount;
      return bitmap.getBit(ordinal);
    };
    const traverse = (filter) => {
      const distances = new Int32Array(this.nodeCount);
      for (let i = 0; i < this.nodeCount; ++i) {
        distances[i] = this.#noDistance;
      }
      const nodesToVisit = new Uint32Array(this.nodeCount);
      distances[this.rootNode().ordinal()] = 0;
      nodesToVisit[0] = this.rootNode().nodeIndex;
      const nodesToVisitLength = 1;
      this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
      for (let i = 0; i < this.nodeCount; ++i) {
        if (distances[i] !== this.#noDistance) {
          bitmap.setBit(i);
        }
      }
    };
    const markUnreachableNodes = () => {
      for (let i = 0; i < this.nodeCount; ++i) {
        if (this.nodeDistances[i] === this.#noDistance) {
          bitmap.setBit(i);
        }
      }
    };
    switch (filterName) {
      case "objectsRetainedByDetachedDomNodes":
        traverse((node, edge) => {
          return edge.node().detachedness() !== 2 /* DETACHED */;
        });
        markUnreachableNodes();
        return (node) => !getBit(node);
      case "objectsRetainedByConsole":
        traverse((node, edge) => {
          return !(node.isSynthetic() && edge.hasStringName() && edge.name().endsWith(" / DevTools console"));
        });
        markUnreachableNodes();
        return (node) => !getBit(node);
      case "duplicatedStrings": {
        const stringToNodeIndexMap = /* @__PURE__ */ new Map();
        const node = this.createNode(0);
        for (let i = 0; i < this.nodeCount; ++i) {
          node.nodeIndex = i * this.nodeFieldCount;
          const rawType = node.rawType();
          if (rawType === this.nodeStringType || rawType === this.nodeConsStringType) {
            if (node.isFlatConsString()) {
              continue;
            }
            const name = node.name();
            const alreadyVisitedNodeIndex = stringToNodeIndexMap.get(name);
            if (alreadyVisitedNodeIndex === void 0) {
              stringToNodeIndexMap.set(name, node.nodeIndex);
            } else {
              bitmap.setBit(alreadyVisitedNodeIndex / this.nodeFieldCount);
              bitmap.setBit(node.nodeIndex / this.nodeFieldCount);
            }
          }
        }
        return getBit;
      }
    }
    throw new Error("Invalid filter name");
  }
  getAggregatesByClassKey(sortedIndexes, key, filter) {
    let aggregates;
    if (key && this.#aggregates[key]) {
      aggregates = this.#aggregates[key];
    } else {
      const aggregatesMap = this.buildAggregates(filter);
      this.calculateClassesRetainedSize(aggregatesMap, filter);
      aggregates = /* @__PURE__ */ Object.create(null);
      for (const [classKey, aggregate] of aggregatesMap.entries()) {
        const newKey = this.classKeyFromClassKeyInternal(classKey);
        aggregates[newKey] = aggregate;
      }
      if (key) {
        this.#aggregates[key] = aggregates;
      }
    }
    if (sortedIndexes && (!key || !this.#aggregatesSortedFlags[key])) {
      this.sortAggregateIndexes(aggregates);
      if (key) {
        this.#aggregatesSortedFlags[key] = sortedIndexes;
      }
    }
    return aggregates;
  }
  allocationTracesTops() {
    return this.#allocationProfile.serializeTraceTops();
  }
  allocationNodeCallers(nodeId) {
    return this.#allocationProfile.serializeCallers(nodeId);
  }
  allocationStack(nodeIndex) {
    const node = this.createNode(nodeIndex);
    const allocationNodeId = node.traceNodeId();
    if (!allocationNodeId) {
      return null;
    }
    return this.#allocationProfile.serializeAllocationStack(allocationNodeId);
  }
  aggregatesForDiff(interfaceDefinitions) {
    if (this.#aggregatesForDiffInternal?.interfaceDefinitions === interfaceDefinitions) {
      return this.#aggregatesForDiffInternal.aggregates;
    }
    const originalInterfaceDefinitions = this.#interfaceDefinitions;
    this.applyInterfaceDefinitions(
      JSON.parse(interfaceDefinitions)
    );
    const aggregates = this.getAggregatesByClassKey(true, "allObjects");
    this.applyInterfaceDefinitions(originalInterfaceDefinitions ?? []);
    const result = {};
    const node = this.createNode();
    for (const classKey in aggregates) {
      const aggregate = aggregates[classKey];
      const indexes = aggregate.idxs;
      const ids = new Array(indexes.length);
      const selfSizes = new Array(indexes.length);
      for (let i = 0; i < indexes.length; i++) {
        node.nodeIndex = indexes[i];
        ids[i] = node.id();
        selfSizes[i] = node.selfSize();
      }
      result[classKey] = { name: node.className(), indexes, ids, selfSizes };
    }
    this.#aggregatesForDiffInternal = {
      interfaceDefinitions,
      aggregates: result
    };
    return result;
  }
  isUserRoot(_node) {
    return true;
  }
  calculateShallowSizes() {
  }
  calculateDistances(isForRetainersView, filter) {
    const nodeCount = this.nodeCount;
    if (isForRetainersView) {
      const originalFilter = filter;
      filter = (node, edge) => {
        return !this.#ignoredNodesInRetainersView.has(edge.nodeIndex()) && (!originalFilter || originalFilter(node, edge));
      };
      if (this.#nodeDistancesForRetainersView === void 0) {
        this.#nodeDistancesForRetainersView = new Int32Array(nodeCount);
      }
    }
    const distances = isForRetainersView ? this.#nodeDistancesForRetainersView : this.nodeDistances;
    const noDistance = this.#noDistance;
    for (let i = 0; i < nodeCount; ++i) {
      distances[i] = noDistance;
    }
    const nodesToVisit = new Uint32Array(this.nodeCount);
    let nodesToVisitLength = 0;
    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      const node = iter.edge.node();
      if (this.isUserRoot(node)) {
        distances[node.ordinal()] = 1;
        nodesToVisit[nodesToVisitLength++] = node.nodeIndex;
      }
    }
    this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
    distances[this.rootNode().ordinal()] = nodesToVisitLength > 0 ? baseSystemDistance : 0;
    nodesToVisit[0] = this.rootNode().nodeIndex;
    nodesToVisitLength = 1;
    this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
  }
  bfs(nodesToVisit, nodesToVisitLength, distances, filter) {
    const edgeFieldsCount = this.edgeFieldsCount;
    const nodeFieldCount = this.nodeFieldCount;
    const containmentEdges = this.containmentEdges;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const nodeCount = this.nodeCount;
    const edgeWeakType = this.edgeWeakType;
    const noDistance = this.#noDistance;
    let index = 0;
    const edge = this.createEdge(0);
    const node = this.createNode(0);
    while (index < nodesToVisitLength) {
      const nodeIndex = nodesToVisit[index++];
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const distance = distances[nodeOrdinal] + 1;
      const firstEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];
      node.nodeIndex = nodeIndex;
      for (let edgeIndex = firstEdgeIndex; edgeIndex < edgesEnd; edgeIndex += edgeFieldsCount) {
        const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
        if (edgeType === edgeWeakType) {
          continue;
        }
        const childNodeIndex = containmentEdges.getValue(
          edgeIndex + edgeToNodeOffset
        );
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (distances[childNodeOrdinal] !== noDistance) {
          continue;
        }
        edge.edgeIndex = edgeIndex;
        if (filter && !filter(node, edge)) {
          continue;
        }
        distances[childNodeOrdinal] = distance;
        nodesToVisit[nodesToVisitLength++] = childNodeIndex;
      }
    }
    if (nodesToVisitLength > nodeCount) {
      throw new Error(
        "BFS failed. Nodes to visit (" + nodesToVisitLength + ") is more than nodes count (" + nodeCount + ")"
      );
    }
  }
  buildAggregates(filter) {
    const aggregates = /* @__PURE__ */ new Map();
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this.nodeFieldCount;
    const selfSizeOffset = this.nodeSelfSizeOffset;
    const node = this.rootNode();
    const nodeDistances = this.nodeDistances;
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      if (filter && !filter(node)) {
        continue;
      }
      const selfSize = nodes.getValue(nodeIndex + selfSizeOffset);
      if (!selfSize) {
        continue;
      }
      const classKey = node.classKeyInternal();
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const distance = nodeDistances[nodeOrdinal];
      let aggregate = aggregates.get(classKey);
      if (!aggregate) {
        aggregate = {
          count: 1,
          distance,
          self: selfSize,
          maxRet: 0,
          name: node.className(),
          idxs: [nodeIndex]
        };
        aggregates.set(classKey, aggregate);
      } else {
        aggregate.distance = Math.min(aggregate.distance, distance);
        ++aggregate.count;
        aggregate.self += selfSize;
        aggregate.idxs.push(nodeIndex);
      }
    }
    for (const aggregate of aggregates.values()) {
      aggregate.idxs = aggregate.idxs.slice();
    }
    return aggregates;
  }
  calculateClassesRetainedSize(aggregates, filter) {
    const rootNodeIndex = this.rootNodeIndexInternal;
    const node = this.createNode(rootNodeIndex);
    const list = [rootNodeIndex];
    const sizes = [-1];
    const classKeys = [];
    const seenClassKeys = /* @__PURE__ */ new Map();
    const nodeFieldCount = this.nodeFieldCount;
    const dominatedNodes = this.dominatedNodes;
    const firstDominatedNodeIndex = this.firstDominatedNodeIndex;
    while (list.length) {
      const nodeIndex = list.pop();
      node.nodeIndex = nodeIndex;
      let classKey = node.classKeyInternal();
      const seen = Boolean(seenClassKeys.get(classKey));
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const dominatedIndexFrom = firstDominatedNodeIndex[nodeOrdinal];
      const dominatedIndexTo = firstDominatedNodeIndex[nodeOrdinal + 1];
      if (!seen && (!filter || filter(node)) && node.selfSize()) {
        aggregates.get(classKey).maxRet += node.retainedSize();
        if (dominatedIndexFrom !== dominatedIndexTo) {
          seenClassKeys.set(classKey, true);
          sizes.push(list.length);
          classKeys.push(classKey);
        }
      }
      for (let i = dominatedIndexFrom; i < dominatedIndexTo; i++) {
        list.push(dominatedNodes[i]);
      }
      const l = list.length;
      while (sizes[sizes.length - 1] === l) {
        sizes.pop();
        classKey = classKeys.pop();
        seenClassKeys.set(classKey, false);
      }
    }
  }
  sortAggregateIndexes(aggregates) {
    const nodeA = this.createNode();
    const nodeB = this.createNode();
    for (const clss in aggregates) {
      aggregates[clss].idxs.sort((idxA, idxB) => {
        nodeA.nodeIndex = idxA;
        nodeB.nodeIndex = idxB;
        return nodeA.id() < nodeB.id() ? -1 : 1;
      });
    }
  }
  tryParseWeakMapEdgeName(edgeNameIndex) {
    const previousResult = this.#edgeNamesThatAreNotWeakMaps.getBit(edgeNameIndex);
    if (previousResult) {
      return void 0;
    }
    const edgeName = this.strings[edgeNameIndex];
    const ephemeronNameRegex = /^\d+(?<duplicatedPart> \/ part of key \(.*? @\d+\) -> value \(.*? @\d+\) pair in WeakMap \(table @(?<tableId>\d+)\))$/;
    const match = edgeName.match(ephemeronNameRegex);
    if (!match) {
      this.#edgeNamesThatAreNotWeakMaps.setBit(edgeNameIndex);
      return void 0;
    }
    return match.groups;
  }
  computeIsEssentialEdge(nodeIndex, edgeIndex, userObjectsMapAndFlag) {
    const edgeType = this.containmentEdges.getValue(
      edgeIndex + this.edgeTypeOffset
    );
    if (edgeType === this.edgeInternalType) {
      const edgeNameIndex = this.containmentEdges.getValue(
        edgeIndex + this.edgeNameOffset
      );
      const match = this.tryParseWeakMapEdgeName(edgeNameIndex);
      if (match) {
        const nodeId = this.nodes.getValue(nodeIndex + this.nodeIdOffset);
        if (nodeId === parseInt(match.tableId, 10)) {
          return false;
        }
      }
    }
    if (edgeType === this.edgeWeakType) {
      return false;
    }
    const childNodeIndex = this.containmentEdges.getValue(
      edgeIndex + this.edgeToNodeOffset
    );
    if (nodeIndex === childNodeIndex) {
      return false;
    }
    if (nodeIndex !== this.rootNodeIndex) {
      if (edgeType === this.edgeShortcutType) {
        return false;
      }
      const flags = userObjectsMapAndFlag ? userObjectsMapAndFlag.map : null;
      const userObjectFlag = userObjectsMapAndFlag ? userObjectsMapAndFlag.flag : 0;
      const nodeOrdinal = nodeIndex / this.nodeFieldCount;
      const childNodeOrdinal = childNodeIndex / this.nodeFieldCount;
      const nodeFlag = !flags || flags[nodeOrdinal] & userObjectFlag;
      const childNodeFlag = !flags || flags[childNodeOrdinal] & userObjectFlag;
      if (childNodeFlag && !nodeFlag) {
        return false;
      }
    }
    return true;
  }
  // Returns a bitmap indicating whether each edge should be considered when building the dominator tree.
  initEssentialEdges() {
    const essentialEdges = createBitVector(
      this.#edgeCount
    );
    const { nodes, nodeFieldCount, edgeFieldsCount } = this;
    const userObjectsMapAndFlag = this.userObjectsMapAndFlag();
    const endNodeIndex = nodes.length;
    const node = this.createNode(0);
    for (let nodeIndex = 0; nodeIndex < endNodeIndex; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      const edgeIndexesEnd = node.edgeIndexesEnd();
      for (let edgeIndex = node.edgeIndexesStart(); edgeIndex < edgeIndexesEnd; edgeIndex += edgeFieldsCount) {
        if (this.computeIsEssentialEdge(
          nodeIndex,
          edgeIndex,
          userObjectsMapAndFlag
        )) {
          essentialEdges.setBit(edgeIndex / edgeFieldsCount);
        }
      }
    }
    return essentialEdges;
  }
  static hasOnlyWeakRetainers(inputs, nodeOrdinal) {
    const {
      retainingEdges,
      edgeFieldsCount,
      firstRetainerIndex,
      essentialEdges
    } = inputs;
    const beginRetainerIndex = firstRetainerIndex[nodeOrdinal];
    const endRetainerIndex = firstRetainerIndex[nodeOrdinal + 1];
    for (let retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
      const retainerEdgeIndex = retainingEdges[retainerIndex];
      if (essentialEdges.getBit(retainerEdgeIndex / edgeFieldsCount)) {
        return false;
      }
    }
    return true;
  }
  // The algorithm for building the dominator tree is from the paper:
  // Thomas Lengauer and Robert Endre Tarjan. 1979. A fast algorithm for finding dominators in a flowgraph.
  // ACM Trans. Program. Lang. Syst. 1, 1 (July 1979), 121–141. https://doi.org/10.1145/357062.357071
  static async calculateDominatorsAndRetainedSizes(inputs) {
    const {
      nodeCount,
      firstEdgeIndexes,
      edgeFieldsCount,
      nodeFieldCount,
      firstRetainerIndex,
      retainingEdges,
      retainingNodes,
      edgeToNodeOrdinals,
      rootNodeOrdinal,
      essentialEdges,
      nodeSelfSizesPromise,
      port
    } = inputs;
    function isEssentialEdge(edgeIndex) {
      return essentialEdges.getBit(edgeIndex / edgeFieldsCount);
    }
    const arrayLength = nodeCount + 1;
    const parent = new Uint32Array(arrayLength);
    const ancestor = new Uint32Array(arrayLength);
    const vertex = new Uint32Array(arrayLength);
    const label = new Uint32Array(arrayLength);
    const semi = new Uint32Array(arrayLength);
    const bucket = new Array(arrayLength);
    let n = 0;
    const nextEdgeIndex = new Uint32Array(arrayLength);
    const dfs = (root) => {
      const rootOrdinal = root - 1;
      nextEdgeIndex[rootOrdinal] = firstEdgeIndexes[rootOrdinal];
      let v = root;
      while (v !== 0) {
        if (semi[v] === 0) {
          semi[v] = ++n;
          vertex[n] = label[v] = v;
        }
        let vNext = parent[v];
        const vOrdinal = v - 1;
        for (; nextEdgeIndex[vOrdinal] < firstEdgeIndexes[vOrdinal + 1]; nextEdgeIndex[vOrdinal] += edgeFieldsCount) {
          const edgeIndex = nextEdgeIndex[vOrdinal];
          if (!isEssentialEdge(edgeIndex)) {
            continue;
          }
          const wOrdinal = edgeToNodeOrdinals[edgeIndex / edgeFieldsCount];
          const w = wOrdinal + 1;
          if (semi[w] === 0) {
            parent[w] = v;
            nextEdgeIndex[wOrdinal] = firstEdgeIndexes[wOrdinal];
            vNext = w;
            break;
          }
        }
        v = vNext;
      }
    };
    const compressionStack = new Uint32Array(arrayLength);
    const compress = (v) => {
      let stackPointer = 0;
      while (ancestor[ancestor[v]] !== 0) {
        compressionStack[++stackPointer] = v;
        v = ancestor[v];
      }
      while (stackPointer > 0) {
        const w = compressionStack[stackPointer--];
        if (semi[label[ancestor[w]]] < semi[label[w]]) {
          label[w] = label[ancestor[w]];
        }
        ancestor[w] = ancestor[ancestor[w]];
      }
    };
    const evaluate = (v) => {
      if (ancestor[v] === 0) {
        return v;
      }
      compress(v);
      return label[v];
    };
    const link = (v, w) => {
      ancestor[w] = v;
    };
    const r = rootNodeOrdinal + 1;
    n = 0;
    const dom = new Uint32Array(arrayLength);
    dfs(r);
    if (n < nodeCount) {
      const errors = [
        `Heap snapshot: ${nodeCount - n} nodes are unreachable from the root.`
      ];
      appendToProblemReport(
        errors,
        "The following nodes have only weak retainers:"
      );
      for (let v = 1; v <= nodeCount; v++) {
        const vOrdinal = v - 1;
        if (semi[v] === 0 && HeapSnapshot.hasOnlyWeakRetainers(inputs, vOrdinal)) {
          appendToProblemReport(errors, vOrdinal * nodeFieldCount);
          parent[v] = r;
          dfs(v);
        }
      }
      reportProblemToPrimaryWorker(errors, port);
    }
    if (n < nodeCount) {
      const errors = [
        `Heap snapshot: Still found ${nodeCount - n} unreachable nodes:`
      ];
      for (let v = 1; v <= nodeCount; v++) {
        if (semi[v] === 0) {
          const vOrdinal = v - 1;
          appendToProblemReport(errors, vOrdinal * nodeFieldCount);
          parent[v] = r;
          semi[v] = ++n;
          vertex[n] = label[v] = v;
        }
      }
      reportProblemToPrimaryWorker(errors, port);
    }
    for (let i = n; i >= 2; --i) {
      const w = vertex[i];
      const wOrdinal = w - 1;
      let isOrphanNode = true;
      for (let retainerIndex = firstRetainerIndex[wOrdinal]; retainerIndex < firstRetainerIndex[wOrdinal + 1]; retainerIndex++) {
        if (!isEssentialEdge(retainingEdges[retainerIndex])) {
          continue;
        }
        isOrphanNode = false;
        const vOrdinal = retainingNodes[retainerIndex] / nodeFieldCount;
        const v = vOrdinal + 1;
        const u = evaluate(v);
        if (semi[u] < semi[w]) {
          semi[w] = semi[u];
        }
      }
      if (isOrphanNode) {
        semi[w] = semi[r];
      }
      if (bucket[vertex[semi[w]]] === void 0) {
        bucket[vertex[semi[w]]] = /* @__PURE__ */ new Set();
      }
      bucket[vertex[semi[w]]].add(w);
      link(parent[w], w);
      if (bucket[parent[w]] !== void 0) {
        for (const v of bucket[parent[w]]) {
          const u = evaluate(v);
          dom[v] = semi[u] < semi[v] ? u : parent[w];
        }
        bucket[parent[w]].clear();
      }
    }
    dom[0] = dom[r] = r;
    for (let i = 2; i <= n; i++) {
      const w = vertex[i];
      if (dom[w] !== vertex[semi[w]]) {
        dom[w] = dom[dom[w]];
      }
    }
    const dominatorsTree = new Uint32Array(nodeCount);
    const retainedSizes = new Float64Array(nodeCount);
    const nodeSelfSizes = await nodeSelfSizesPromise;
    for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; nodeOrdinal++) {
      dominatorsTree[nodeOrdinal] = dom[nodeOrdinal + 1] - 1;
      retainedSizes[nodeOrdinal] = nodeSelfSizes[nodeOrdinal];
    }
    for (let i = n; i > 1; i--) {
      const nodeOrdinal = vertex[i] - 1;
      const dominatorOrdinal = dominatorsTree[nodeOrdinal];
      retainedSizes[dominatorOrdinal] += retainedSizes[nodeOrdinal];
    }
    return { dominatorsTree, retainedSizes };
  }
  static buildDominatedNodes(inputs) {
    const { nodeCount, dominatorsTree, rootNodeOrdinal, nodeFieldCount } = inputs;
    const indexArray = new Uint32Array(nodeCount + 1);
    const dominatedNodes = new Uint32Array(nodeCount - 1);
    let fromNodeOrdinal = 0;
    let toNodeOrdinal = nodeCount;
    if (rootNodeOrdinal === fromNodeOrdinal) {
      fromNodeOrdinal = 1;
    } else if (rootNodeOrdinal === toNodeOrdinal - 1) {
      toNodeOrdinal = toNodeOrdinal - 1;
    } else {
      throw new Error("Root node is expected to be either first or last");
    }
    for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
      ++indexArray[dominatorsTree[nodeOrdinal]];
    }
    let firstDominatedNodeIndex = 0;
    for (let i = 0, l = nodeCount; i < l; ++i) {
      const dominatedCount = dominatedNodes[firstDominatedNodeIndex] = indexArray[i];
      indexArray[i] = firstDominatedNodeIndex;
      firstDominatedNodeIndex += dominatedCount;
    }
    indexArray[nodeCount] = dominatedNodes.length;
    for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
      const dominatorOrdinal = dominatorsTree[nodeOrdinal];
      let dominatedRefIndex = indexArray[dominatorOrdinal];
      dominatedRefIndex += --dominatedNodes[dominatedRefIndex];
      dominatedNodes[dominatedRefIndex] = nodeOrdinal * nodeFieldCount;
    }
    return { firstDominatedNodeIndex: indexArray, dominatedNodes };
  }
  calculateObjectNames() {
    const {
      nodes,
      nodeCount,
      nodeNameOffset,
      nodeNativeType,
      nodeHiddenType,
      nodeObjectType,
      nodeCodeType,
      nodeClosureType,
      nodeRegExpType
    } = this;
    if (this.nodeDetachednessAndClassIndexOffset === -1) {
      this.detachednessAndClassIndexArray = new Uint32Array(nodeCount);
    }
    const stringTable = /* @__PURE__ */ new Map();
    const getIndexForString = (s) => {
      let index = stringTable.get(s);
      if (index === void 0) {
        index = this.addString(s);
        stringTable.set(s, index);
      }
      return index;
    };
    const hiddenClassIndex = getIndexForString("(system)");
    const codeClassIndex = getIndexForString("(compiled code)");
    const functionClassIndex = getIndexForString("Function");
    const regExpClassIndex = getIndexForString("RegExp");
    function getNodeClassIndex(node2) {
      switch (node2.rawType()) {
        case nodeHiddenType:
          return hiddenClassIndex;
        case nodeObjectType:
        case nodeNativeType: {
          let name = node2.rawName();
          if (name.startsWith("<")) {
            const firstSpace = name.indexOf(" ");
            if (firstSpace !== -1) {
              name = name.substring(0, firstSpace) + ">";
            }
            return getIndexForString(name);
          }
          if (name.startsWith("Detached <")) {
            const firstSpace = name.indexOf(" ", 10);
            if (firstSpace !== -1) {
              name = name.substring(0, firstSpace) + ">";
            }
            return getIndexForString(name);
          }
          return nodes.getValue(node2.nodeIndex + nodeNameOffset);
        }
        case nodeCodeType:
          return codeClassIndex;
        case nodeClosureType:
          return functionClassIndex;
        case nodeRegExpType:
          return regExpClassIndex;
        default:
          return getIndexForString("(" + node2.type() + ")");
      }
    }
    const node = this.createNode(0);
    for (let i = 0; i < nodeCount; ++i) {
      node.setClassIndex(getNodeClassIndex(node));
      node.nodeIndex = node.nextNodeIndex();
    }
  }
  interfaceDefinitions() {
    return JSON.stringify(this.#interfaceDefinitions ?? []);
  }
  isPlainJSObject(node) {
    return node.rawType() === this.nodeObjectType && node.rawName() === "Object";
  }
  inferInterfaceDefinitions() {
    const { edgePropertyType } = this;
    const candidates = /* @__PURE__ */ new Map();
    let totalObjectCount = 0;
    for (let it = this.allNodes(); it.hasNext(); it.next()) {
      const node = it.item();
      if (!this.isPlainJSObject(node)) {
        continue;
      }
      ++totalObjectCount;
      let interfaceName = "{";
      const properties = [];
      for (let edgeIt = node.edges(); edgeIt.hasNext(); edgeIt.next()) {
        const edge = edgeIt.item();
        const edgeName = edge.name();
        if (edge.rawType() !== edgePropertyType || edgeName === "__proto__") {
          continue;
        }
        const formattedEdgeName = JSHeapSnapshotNode.formatPropertyName(edgeName);
        if (interfaceName.length > MIN_INTERFACE_PROPERTY_COUNT && interfaceName.length + formattedEdgeName.length > MAX_INTERFACE_NAME_LENGTH) {
          break;
        }
        if (interfaceName.length !== 1) {
          interfaceName += ", ";
        }
        interfaceName += formattedEdgeName;
        properties.push(edgeName);
      }
      if (properties.length === 0) {
        continue;
      }
      interfaceName += "}";
      const candidate = candidates.get(interfaceName);
      if (candidate) {
        ++candidate.count;
      } else {
        candidates.set(interfaceName, {
          name: interfaceName,
          properties,
          count: 1
        });
      }
    }
    const sortedCandidates = Array.from(candidates.values());
    sortedCandidates.sort((a, b) => b.count - a.count);
    const result = [];
    const minCount = Math.max(
      MIN_OBJECT_COUNT_PER_INTERFACE,
      totalObjectCount / MIN_OBJECT_PROPORTION_PER_INTERFACE
    );
    for (let i = 0; i < sortedCandidates.length; ++i) {
      const candidate = sortedCandidates[i];
      if (candidate.count < minCount) {
        break;
      }
      result.push(candidate);
    }
    return result;
  }
  applyInterfaceDefinitions(definitions) {
    const { edgePropertyType } = this;
    this.#interfaceDefinitions = definitions;
    this.#aggregates = {};
    this.#aggregatesSortedFlags = {};
    function selectBetterMatch(a, b) {
      if (!b || a.propertyCount > b.propertyCount) {
        return a;
      }
      if (b.propertyCount > a.propertyCount) {
        return b;
      }
      return a.index <= b.index ? a : b;
    }
    const propertyTree = {
      next: /* @__PURE__ */ new Map(),
      matchInfo: null,
      greatestNext: null
    };
    for (let interfaceIndex = 0; interfaceIndex < definitions.length; ++interfaceIndex) {
      const definition = definitions[interfaceIndex];
      const properties = definition.properties.toSorted();
      let currentNode = propertyTree;
      for (const property of properties) {
        const nextMap = currentNode.next;
        let nextNode = nextMap.get(property);
        if (!nextNode) {
          nextNode = {
            next: /* @__PURE__ */ new Map(),
            matchInfo: null,
            greatestNext: null
          };
          nextMap.set(property, nextNode);
          if (currentNode.greatestNext === null || currentNode.greatestNext < property) {
            currentNode.greatestNext = property;
          }
        }
        currentNode = nextNode;
      }
      if (!currentNode.matchInfo) {
        currentNode.matchInfo = {
          name: definition.name,
          propertyCount: properties.length,
          index: interfaceIndex
        };
      }
    }
    const initialMatch = {
      name: "Object",
      propertyCount: 0,
      index: Infinity
    };
    for (let it = this.allNodes(); it.hasNext(); it.next()) {
      const node = it.item();
      if (!this.isPlainJSObject(node)) {
        continue;
      }
      const properties = [];
      for (let edgeIt = node.edges(); edgeIt.hasNext(); edgeIt.next()) {
        const edge = edgeIt.item();
        if (edge.rawType() === edgePropertyType) {
          properties.push(edge.name());
        }
      }
      properties.sort();
      const states = /* @__PURE__ */ new Set();
      states.add(propertyTree);
      let match = selectBetterMatch(initialMatch, propertyTree.matchInfo);
      for (const property of properties) {
        for (const currentState of Array.from(states.keys())) {
          if (currentState.greatestNext === null || property >= currentState.greatestNext) {
            states.delete(currentState);
          }
          const nextState = currentState.next.get(property);
          if (nextState) {
            states.add(nextState);
            match = selectBetterMatch(match, nextState.matchInfo);
          }
        }
      }
      let classIndex = match === initialMatch ? node.rawNameIndex() : this.#interfaceNames.get(match.name);
      if (classIndex === void 0) {
        classIndex = this.addString(match.name);
        this.#interfaceNames.set(match.name, classIndex);
      }
      node.setClassIndex(classIndex);
    }
  }
  /**
   * Iterates children of a node.
   */
  iterateFilteredChildren(nodeOrdinal, edgeFilterCallback, childCallback) {
    const beginEdgeIndex = this.firstEdgeIndexes[nodeOrdinal];
    const endEdgeIndex = this.firstEdgeIndexes[nodeOrdinal + 1];
    for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += this.edgeFieldsCount) {
      const childNodeIndex = this.containmentEdges.getValue(
        edgeIndex + this.edgeToNodeOffset
      );
      const childNodeOrdinal = childNodeIndex / this.nodeFieldCount;
      const type = this.containmentEdges.getValue(
        edgeIndex + this.edgeTypeOffset
      );
      if (!edgeFilterCallback(type)) {
        continue;
      }
      childCallback(childNodeOrdinal);
    }
  }
  /**
   * Adds a string to the snapshot.
   */
  addString(string) {
    this.strings.push(string);
    return this.strings.length - 1;
  }
  /**
   * The phase propagates whether a node is attached or detached through the
   * graph and adjusts the low-level representation of nodes.
   *
   * State propagation:
   * 1. Any object reachable from an attached object is itself attached.
   * 2. Any object reachable from a detached object that is not already
   *    attached is considered detached.
   *
   * Representation:
   * - Name of any detached node is changed from "<Name>"" to
   *   "Detached <Name>".
   */
  propagateDOMState() {
    if (this.nodeDetachednessAndClassIndexOffset === -1) {
      return;
    }
    const visited = new Uint8Array(this.nodeCount);
    const attached = [];
    const detached = [];
    const stringIndexCache = /* @__PURE__ */ new Map();
    const node = this.createNode(0);
    const addDetachedPrefixToNodeName = function(snapshot, nodeIndex) {
      const oldStringIndex = snapshot.nodes.getValue(
        nodeIndex + snapshot.nodeNameOffset
      );
      let newStringIndex = stringIndexCache.get(oldStringIndex);
      if (newStringIndex === void 0) {
        newStringIndex = snapshot.addString(
          "Detached " + snapshot.strings[oldStringIndex]
        );
        stringIndexCache.set(oldStringIndex, newStringIndex);
      }
      snapshot.nodes.setValue(
        nodeIndex + snapshot.nodeNameOffset,
        newStringIndex
      );
    };
    const processNode = function(snapshot, nodeOrdinal, newState) {
      if (visited[nodeOrdinal]) {
        return;
      }
      const nodeIndex = nodeOrdinal * snapshot.nodeFieldCount;
      if (snapshot.nodes.getValue(nodeIndex + snapshot.nodeTypeOffset) !== snapshot.nodeNativeType) {
        visited[nodeOrdinal] = 1;
        return;
      }
      node.nodeIndex = nodeIndex;
      node.setDetachedness(newState);
      if (newState === 1 /* ATTACHED */) {
        attached.push(nodeOrdinal);
      } else if (newState === 2 /* DETACHED */) {
        addDetachedPrefixToNodeName(snapshot, nodeIndex);
        detached.push(nodeOrdinal);
      }
      visited[nodeOrdinal] = 1;
    };
    const propagateState = function(snapshot, parentNodeOrdinal, newState) {
      snapshot.iterateFilteredChildren(
        parentNodeOrdinal,
        (edgeType) => ![
          snapshot.edgeHiddenType,
          snapshot.edgeInvisibleType,
          snapshot.edgeWeakType
        ].includes(edgeType),
        (nodeOrdinal) => processNode(snapshot, nodeOrdinal, newState)
      );
    };
    for (let nodeOrdinal = 0; nodeOrdinal < this.nodeCount; ++nodeOrdinal) {
      node.nodeIndex = nodeOrdinal * this.nodeFieldCount;
      const state = node.detachedness();
      if (state === 0 /* UNKNOWN */) {
        continue;
      }
      processNode(this, nodeOrdinal, state);
    }
    while (attached.length !== 0) {
      const nodeOrdinal = attached.pop();
      propagateState(this, nodeOrdinal, 1 /* ATTACHED */);
    }
    while (detached.length !== 0) {
      const nodeOrdinal = detached.pop();
      node.nodeIndex = nodeOrdinal * this.nodeFieldCount;
      const nodeState = node.detachedness();
      if (nodeState === 1 /* ATTACHED */) {
        continue;
      }
      propagateState(this, nodeOrdinal, 2 /* DETACHED */);
    }
  }
  buildSamples() {
    const samples = this.#rawSamples;
    if (!samples?.length) {
      return;
    }
    const sampleCount = samples.length / 2;
    const sizeForRange = new Array(sampleCount);
    const timestamps = new Array(sampleCount);
    const lastAssignedIds = new Array(sampleCount);
    const timestampOffset = this.#metaNode.sample_fields.indexOf("timestamp_us");
    const lastAssignedIdOffset = this.#metaNode.sample_fields.indexOf("last_assigned_id");
    for (let i = 0; i < sampleCount; i++) {
      sizeForRange[i] = 0;
      timestamps[i] = samples[2 * i + timestampOffset] / 1e3;
      lastAssignedIds[i] = samples[2 * i + lastAssignedIdOffset];
    }
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this.nodeFieldCount;
    const node = this.rootNode();
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      node.nodeIndex = nodeIndex;
      const nodeId = node.id();
      if (nodeId % 2 === 0) {
        continue;
      }
      const rangeIndex = lowerBound(
        lastAssignedIds,
        nodeId,
        DEFAULT_COMPARATOR
      );
      if (rangeIndex === sampleCount) {
        continue;
      }
      sizeForRange[rangeIndex] += node.selfSize();
    }
    this.#samples = new Samples(
      timestamps,
      lastAssignedIds,
      sizeForRange
    );
  }
  buildLocationMap() {
    const map = /* @__PURE__ */ new Map();
    const locations = this.#locations;
    for (let i = 0; i < locations.length; i += this.#locationFieldCount) {
      const nodeIndex = locations[i + this.#locationIndexOffset];
      const scriptId = locations[i + this.#locationScriptIdOffset];
      const line = locations[i + this.#locationLineOffset];
      const col = locations[i + this.#locationColumnOffset];
      map.set(nodeIndex, new Location(scriptId, line, col));
    }
    this.#locationMap = map;
  }
  getLocation(nodeIndex) {
    return this.#locationMap.get(nodeIndex) || null;
  }
  getSamples() {
    return this.#samples;
  }
  calculateFlags() {
    throw new Error("Not implemented");
  }
  calculateStatistics() {
    throw new Error("Not implemented");
  }
  userObjectsMapAndFlag() {
    throw new Error("Not implemented");
  }
  calculateSnapshotDiff(baseSnapshotId, baseSnapshotAggregates) {
    let snapshotDiff = this.#snapshotDiffs[baseSnapshotId];
    if (snapshotDiff) {
      return snapshotDiff;
    }
    snapshotDiff = {};
    const aggregates = this.getAggregatesByClassKey(true, "allObjects");
    for (const classKey in baseSnapshotAggregates) {
      const baseAggregate = baseSnapshotAggregates[classKey];
      const diff = this.calculateDiffForClass(
        baseAggregate,
        aggregates[classKey]
      );
      if (diff) {
        snapshotDiff[classKey] = diff;
      }
    }
    const emptyBaseAggregate = new AggregateForDiff();
    for (const classKey in aggregates) {
      if (classKey in baseSnapshotAggregates) {
        continue;
      }
      const classDiff = this.calculateDiffForClass(
        emptyBaseAggregate,
        aggregates[classKey]
      );
      if (classDiff) {
        snapshotDiff[classKey] = classDiff;
      }
    }
    this.#snapshotDiffs[baseSnapshotId] = snapshotDiff;
    return snapshotDiff;
  }
  calculateDiffForClass(baseAggregate, aggregate) {
    const baseIds = baseAggregate.ids;
    const baseIndexes = baseAggregate.indexes;
    const baseSelfSizes = baseAggregate.selfSizes;
    const indexes = aggregate ? aggregate.idxs : [];
    let i = 0;
    let j = 0;
    const l = baseIds.length;
    const m = indexes.length;
    const diff = new Diff(
      aggregate ? aggregate.name : baseAggregate.name
    );
    const nodeB = this.createNode(indexes[j]);
    while (i < l && j < m) {
      const nodeAId = baseIds[i];
      if (nodeAId < nodeB.id()) {
        diff.deletedIndexes.push(baseIndexes[i]);
        diff.removedCount++;
        diff.removedSize += baseSelfSizes[i];
        ++i;
      } else if (nodeAId > nodeB.id()) {
        diff.addedIndexes.push(indexes[j]);
        diff.addedCount++;
        diff.addedSize += nodeB.selfSize();
        nodeB.nodeIndex = indexes[++j];
      } else {
        ++i;
        nodeB.nodeIndex = indexes[++j];
      }
    }
    while (i < l) {
      diff.deletedIndexes.push(baseIndexes[i]);
      diff.removedCount++;
      diff.removedSize += baseSelfSizes[i];
      ++i;
    }
    while (j < m) {
      diff.addedIndexes.push(indexes[j]);
      diff.addedCount++;
      diff.addedSize += nodeB.selfSize();
      nodeB.nodeIndex = indexes[++j];
    }
    diff.countDelta = diff.addedCount - diff.removedCount;
    diff.sizeDelta = diff.addedSize - diff.removedSize;
    if (!diff.addedCount && !diff.removedCount) {
      return null;
    }
    return diff;
  }
  nodeForSnapshotObjectId(snapshotObjectId) {
    for (let it = this.allNodes(); it.hasNext(); it.next()) {
      if (it.node.id() === snapshotObjectId) {
        return it.node;
      }
    }
    return null;
  }
  // Converts an internal class key, suitable for categorizing within this
  // snapshot, to a public class key, which can be used in comparisons
  // between multiple snapshots.
  classKeyFromClassKeyInternal(key) {
    return typeof key === "number" ? "," + this.strings[key] : key;
  }
  nodeClassKey(snapshotObjectId) {
    const node = this.nodeForSnapshotObjectId(snapshotObjectId);
    if (node) {
      return this.classKeyFromClassKeyInternal(node.classKeyInternal());
    }
    return null;
  }
  idsOfObjectsWithName(name) {
    const ids = [];
    for (let it = this.allNodes(); it.hasNext(); it.next()) {
      if (it.item().name() === name) {
        ids.push(it.item().id());
      }
    }
    return ids;
  }
  createEdgesProvider(nodeIndex) {
    const node = this.createNode(nodeIndex);
    const filter = this.containmentEdgesFilter();
    const indexProvider = new HeapSnapshotEdgeIndexProvider(this);
    return new HeapSnapshotEdgesProvider(
      this,
      filter,
      node.edges(),
      indexProvider
    );
  }
  createEdgesProviderForTest(nodeIndex, filter) {
    const node = this.createNode(nodeIndex);
    const indexProvider = new HeapSnapshotEdgeIndexProvider(this);
    return new HeapSnapshotEdgesProvider(
      this,
      filter,
      node.edges(),
      indexProvider
    );
  }
  retainingEdgesFilter() {
    return null;
  }
  containmentEdgesFilter() {
    return null;
  }
  createRetainingEdgesProvider(nodeIndex) {
    const node = this.createNode(nodeIndex);
    const filter = this.retainingEdgesFilter();
    const indexProvider = new HeapSnapshotRetainerEdgeIndexProvider(this);
    return new HeapSnapshotEdgesProvider(
      this,
      filter,
      node.retainers(),
      indexProvider
    );
  }
  createAddedNodesProvider(baseSnapshotId, classKey) {
    const snapshotDiff = this.#snapshotDiffs[baseSnapshotId];
    const diffForClass = snapshotDiff[classKey];
    return new HeapSnapshotNodesProvider(this, diffForClass.addedIndexes);
  }
  createDeletedNodesProvider(nodeIndexes) {
    return new HeapSnapshotNodesProvider(this, nodeIndexes);
  }
  createNodesProviderForClass(classKey, nodeFilter) {
    return new HeapSnapshotNodesProvider(
      this,
      this.aggregatesWithFilter(nodeFilter)[classKey].idxs
    );
  }
  maxJsNodeId() {
    const nodeFieldCount = this.nodeFieldCount;
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    let id = 0;
    for (let nodeIndex = this.nodeIdOffset; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      const nextId = nodes.getValue(nodeIndex);
      if (nextId % 2 === 0) {
        continue;
      }
      if (id < nextId) {
        id = nextId;
      }
    }
    return id;
  }
  updateStaticData() {
    return new StaticData(
      this.nodeCount,
      this.rootNodeIndexInternal,
      this.totalSize,
      this.maxJsNodeId()
    );
  }
  ignoreNodeInRetainersView(nodeIndex) {
    this.#ignoredNodesInRetainersView.add(nodeIndex);
    this.calculateDistances(
      /* isForRetainersView=*/
      true
    );
    this.#updateIgnoredEdgesInRetainersView();
  }
  unignoreNodeInRetainersView(nodeIndex) {
    this.#ignoredNodesInRetainersView.delete(nodeIndex);
    if (this.#ignoredNodesInRetainersView.size === 0) {
      this.#nodeDistancesForRetainersView = void 0;
    } else {
      this.calculateDistances(
        /* isForRetainersView=*/
        true
      );
    }
    this.#updateIgnoredEdgesInRetainersView();
  }
  unignoreAllNodesInRetainersView() {
    this.#ignoredNodesInRetainersView.clear();
    this.#nodeDistancesForRetainersView = void 0;
    this.#updateIgnoredEdgesInRetainersView();
  }
  #updateIgnoredEdgesInRetainersView() {
    const distances = this.#nodeDistancesForRetainersView;
    this.#ignoredEdgesInRetainersView.clear();
    if (distances === void 0) {
      return;
    }
    const unreachableWeakMapEdges = new Multimap();
    const noDistance = this.#noDistance;
    const { nodeCount, nodeFieldCount } = this;
    const node = this.createNode(0);
    for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
      if (distances[nodeOrdinal] !== noDistance) {
        continue;
      }
      node.nodeIndex = nodeOrdinal * nodeFieldCount;
      for (let iter = node.edges(); iter.hasNext(); iter.next()) {
        const edge = iter.edge;
        if (!edge.isInternal()) {
          continue;
        }
        const match = this.tryParseWeakMapEdgeName(edge.nameIndex());
        if (match) {
          unreachableWeakMapEdges.set(edge.nodeIndex(), match.duplicatedPart);
        }
      }
    }
    for (const targetNodeIndex of unreachableWeakMapEdges.keys()) {
      node.nodeIndex = targetNodeIndex;
      for (let it = node.retainers(); it.hasNext(); it.next()) {
        const reverseEdge = it.item();
        if (!reverseEdge.isInternal()) {
          continue;
        }
        const match = this.tryParseWeakMapEdgeName(reverseEdge.nameIndex());
        if (match && unreachableWeakMapEdges.hasValue(
          targetNodeIndex,
          match.duplicatedPart
        )) {
          const forwardEdgeIndex = this.retainingEdges[reverseEdge.itemIndex()];
          this.#ignoredEdgesInRetainersView.add(forwardEdgeIndex);
        }
      }
    }
  }
  areNodesIgnoredInRetainersView() {
    return this.#ignoredNodesInRetainersView.size > 0;
  }
  getDistanceForRetainersView(nodeIndex) {
    const nodeOrdinal = nodeIndex / this.nodeFieldCount;
    const distances = this.#nodeDistancesForRetainersView ?? this.nodeDistances;
    const distance = distances[nodeOrdinal];
    if (distance === this.#noDistance) {
      return Math.max(0, this.nodeDistances[nodeOrdinal]) + baseUnreachableDistance;
    }
    return distance;
  }
  isNodeIgnoredInRetainersView(nodeIndex) {
    return this.#ignoredNodesInRetainersView.has(nodeIndex);
  }
  isEdgeIgnoredInRetainersView(edgeIndex) {
    return this.#ignoredEdgesInRetainersView.has(edgeIndex);
  }
}
class HeapSnapshotItemProvider {
  iterator;
  #indexProvider;
  #isEmptyInternal;
  iterationOrder;
  currentComparator;
  #sortedPrefixLength;
  #sortedSuffixLength;
  constructor(iterator, indexProvider) {
    this.iterator = iterator;
    this.#indexProvider = indexProvider;
    this.#isEmptyInternal = !iterator.hasNext();
    this.iterationOrder = null;
    this.currentComparator = null;
    this.#sortedPrefixLength = 0;
    this.#sortedSuffixLength = 0;
  }
  createIterationOrder() {
    if (this.iterationOrder) {
      return;
    }
    this.iterationOrder = [];
    for (let iterator = this.iterator; iterator.hasNext(); iterator.next()) {
      this.iterationOrder.push(iterator.item().itemIndex());
    }
  }
  isEmpty() {
    return this.#isEmptyInternal;
  }
  serializeItemsRange(begin, end) {
    this.createIterationOrder();
    if (begin > end) {
      throw new Error("Start position > end position: " + begin + " > " + end);
    }
    if (!this.iterationOrder) {
      throw new Error("Iteration order undefined");
    }
    if (end > this.iterationOrder.length) {
      end = this.iterationOrder.length;
    }
    if (this.#sortedPrefixLength < end && begin < this.iterationOrder.length - this.#sortedSuffixLength && this.currentComparator) {
      const currentComparator = this.currentComparator;
      this.sort(
        currentComparator,
        this.#sortedPrefixLength,
        this.iterationOrder.length - 1 - this.#sortedSuffixLength,
        begin,
        end - 1
      );
      if (begin <= this.#sortedPrefixLength) {
        this.#sortedPrefixLength = end;
      }
      if (end >= this.iterationOrder.length - this.#sortedSuffixLength) {
        this.#sortedSuffixLength = this.iterationOrder.length - begin;
      }
    }
    let position = begin;
    const count = end - begin;
    const result = new Array(count);
    for (let i = 0; i < count; ++i) {
      const itemIndex = this.iterationOrder[position++];
      const item = this.#indexProvider.itemForIndex(itemIndex);
      result[i] = item.serialize();
    }
    return new ItemsRange(
      begin,
      end,
      this.iterationOrder.length,
      result
    );
  }
  sortAndRewind(comparator) {
    this.currentComparator = comparator;
    this.#sortedPrefixLength = 0;
    this.#sortedSuffixLength = 0;
  }
}
class HeapSnapshotEdgesProvider extends HeapSnapshotItemProvider {
  snapshot;
  constructor(snapshot, filter, edgesIter, indexProvider) {
    const iter = filter ? new HeapSnapshotFilteredIterator(
      edgesIter,
      filter
    ) : edgesIter;
    super(iter, indexProvider);
    this.snapshot = snapshot;
  }
  sort(comparator, leftBound, rightBound, windowLeft, windowRight) {
    const fieldName1 = comparator.fieldName1;
    const fieldName2 = comparator.fieldName2;
    const ascending1 = comparator.ascending1;
    const ascending2 = comparator.ascending2;
    const edgeA = this.iterator.item().clone();
    const edgeB = edgeA.clone();
    const nodeA = this.snapshot.createNode();
    const nodeB = this.snapshot.createNode();
    function compareEdgeField(fieldName, ascending, indexA, indexB) {
      edgeA.edgeIndex = indexA;
      edgeB.edgeIndex = indexB;
      let result = 0;
      if (fieldName === "!edgeName") {
        if (edgeB.name() === "__proto__") {
          return -1;
        }
        if (edgeA.name() === "__proto__") {
          return 1;
        }
        result = edgeA.hasStringName() === edgeB.hasStringName() ? edgeA.name() < edgeB.name() ? -1 : edgeA.name() > edgeB.name() ? 1 : 0 : edgeA.hasStringName() ? -1 : 1;
      } else {
        result = edgeA.getValueForSorting(fieldName) - edgeB.getValueForSorting(fieldName);
      }
      return ascending ? result : -result;
    }
    function compareNodeField(fieldName, ascending, indexA, indexB) {
      edgeA.edgeIndex = indexA;
      nodeA.nodeIndex = edgeA.nodeIndex();
      const valueA = nodeA[fieldName]();
      edgeB.edgeIndex = indexB;
      nodeB.nodeIndex = edgeB.nodeIndex();
      const valueB = nodeB[fieldName]();
      const result = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      return ascending ? result : -result;
    }
    function compareEdgeAndEdge(indexA, indexB) {
      let result = compareEdgeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareEdgeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }
    function compareEdgeAndNode(indexA, indexB) {
      let result = compareEdgeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareNodeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }
    function compareNodeAndEdge(indexA, indexB) {
      let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareEdgeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }
    function compareNodeAndNode(indexA, indexB) {
      let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
      if (result === 0) {
        result = compareNodeField(fieldName2, ascending2, indexA, indexB);
      }
      if (result === 0) {
        return indexA - indexB;
      }
      return result;
    }
    if (!this.iterationOrder) {
      throw new Error("Iteration order not defined");
    }
    function isEdgeFieldName(fieldName) {
      return fieldName.startsWith("!edge");
    }
    if (isEdgeFieldName(fieldName1)) {
      if (isEdgeFieldName(fieldName2)) {
        sortRange(
          this.iterationOrder,
          compareEdgeAndEdge,
          leftBound,
          rightBound,
          windowLeft,
          windowRight
        );
      } else {
        sortRange(
          this.iterationOrder,
          compareEdgeAndNode,
          leftBound,
          rightBound,
          windowLeft,
          windowRight
        );
      }
    } else if (isEdgeFieldName(fieldName2)) {
      sortRange(
        this.iterationOrder,
        compareNodeAndEdge,
        leftBound,
        rightBound,
        windowLeft,
        windowRight
      );
    } else {
      sortRange(
        this.iterationOrder,
        compareNodeAndNode,
        leftBound,
        rightBound,
        windowLeft,
        windowRight
      );
    }
  }
}
class HeapSnapshotNodesProvider extends HeapSnapshotItemProvider {
  snapshot;
  constructor(snapshot, nodeIndexes) {
    const indexProvider = new HeapSnapshotNodeIndexProvider(snapshot);
    const it = new HeapSnapshotIndexRangeIterator(indexProvider, nodeIndexes);
    super(it, indexProvider);
    this.snapshot = snapshot;
  }
  nodePosition(snapshotObjectId) {
    this.createIterationOrder();
    const node = this.snapshot.createNode();
    let i = 0;
    if (!this.iterationOrder) {
      throw new Error("Iteration order not defined");
    }
    for (; i < this.iterationOrder.length; i++) {
      node.nodeIndex = this.iterationOrder[i];
      if (node.id() === snapshotObjectId) {
        break;
      }
    }
    if (i === this.iterationOrder.length) {
      return -1;
    }
    const targetNodeIndex = this.iterationOrder[i];
    let smallerCount = 0;
    const currentComparator = this.currentComparator;
    const compare = this.buildCompareFunction(currentComparator);
    for (let i2 = 0; i2 < this.iterationOrder.length; i2++) {
      if (compare(this.iterationOrder[i2], targetNodeIndex) < 0) {
        ++smallerCount;
      }
    }
    return smallerCount;
  }
  buildCompareFunction(comparator) {
    const nodeA = this.snapshot.createNode();
    const nodeB = this.snapshot.createNode();
    const fieldAccessor1 = nodeA[comparator.fieldName1];
    const fieldAccessor2 = nodeA[comparator.fieldName2];
    const ascending1 = comparator.ascending1 ? 1 : -1;
    const ascending2 = comparator.ascending2 ? 1 : -1;
    function sortByNodeField(fieldAccessor, ascending) {
      const valueA = fieldAccessor.call(nodeA);
      const valueB = fieldAccessor.call(nodeB);
      return valueA < valueB ? -ascending : valueA > valueB ? ascending : 0;
    }
    function sortByComparator(indexA, indexB) {
      nodeA.nodeIndex = indexA;
      nodeB.nodeIndex = indexB;
      let result = sortByNodeField(fieldAccessor1, ascending1);
      if (result === 0) {
        result = sortByNodeField(fieldAccessor2, ascending2);
      }
      return result || indexA - indexB;
    }
    return sortByComparator;
  }
  sort(comparator, leftBound, rightBound, windowLeft, windowRight) {
    if (!this.iterationOrder) {
      throw new Error("Iteration order not defined");
    }
    sortRange(
      this.iterationOrder,
      this.buildCompareFunction(comparator),
      leftBound,
      rightBound,
      windowLeft,
      windowRight
    );
  }
}
class JSHeapSnapshot extends HeapSnapshot {
  nodeFlags;
  flags;
  #statistics;
  constructor(profile, progress) {
    super(profile, progress);
    this.nodeFlags = {
      // bit flags in 8-bit value
      canBeQueried: 1,
      detachedDOMTreeNode: 2,
      pageObject: 4
      // The idea is to track separately the objects owned by the page and the objects owned by debugger.
    };
  }
  createNode(nodeIndex) {
    return new JSHeapSnapshotNode(
      this,
      nodeIndex === void 0 ? -1 : nodeIndex
    );
  }
  createEdge(edgeIndex) {
    return new JSHeapSnapshotEdge(this, edgeIndex);
  }
  createRetainingEdge(retainerIndex) {
    return new JSHeapSnapshotRetainerEdge(this, retainerIndex);
  }
  containmentEdgesFilter() {
    return (edge) => !edge.isInvisible();
  }
  retainingEdgesFilter() {
    const containmentEdgesFilter = this.containmentEdgesFilter();
    function filter(edge) {
      return containmentEdgesFilter(edge) && !edge.node().isRoot() && !edge.isWeak();
    }
    return filter;
  }
  calculateFlags() {
    this.flags = new Uint8Array(this.nodeCount);
    this.markDetachedDOMTreeNodes();
    this.markQueriableHeapObjects();
    this.markPageOwnedNodes();
  }
  #hasUserRoots() {
    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      if (this.isUserRoot(iter.edge.node())) {
        return true;
      }
    }
    return false;
  }
  // Updates the shallow sizes for "owned" objects of types kArray or kHidden to
  // zero, and add their sizes to the "owner" object instead.
  calculateShallowSizes() {
    if (!this.#hasUserRoots()) {
      return;
    }
    const { nodeCount, nodes, nodeFieldCount, nodeSelfSizeOffset } = this;
    const kUnvisited = 4294967295;
    const kHasMultipleOwners = 4294967294;
    if (nodeCount >= kHasMultipleOwners) {
      throw new Error("Too many nodes for calculateShallowSizes");
    }
    const owners = new Uint32Array(nodeCount);
    const worklist = [];
    const node = this.createNode(0);
    for (let i = 0; i < nodeCount; ++i) {
      if (node.isHidden() || node.isArray() || node.isNative() && node.rawName() === "system / ExternalStringData") {
        owners[i] = kUnvisited;
      } else {
        owners[i] = i;
        worklist.push(i);
      }
      node.nodeIndex = node.nextNodeIndex();
    }
    while (worklist.length !== 0) {
      const id = worklist.pop();
      const owner = owners[id];
      node.nodeIndex = id * nodeFieldCount;
      for (let iter = node.edges(); iter.hasNext(); iter.next()) {
        const edge = iter.edge;
        if (edge.isWeak()) {
          continue;
        }
        const targetId = edge.nodeIndex() / nodeFieldCount;
        switch (owners[targetId]) {
          case kUnvisited:
            owners[targetId] = owner;
            worklist.push(targetId);
            break;
          case targetId:
          case owner:
          case kHasMultipleOwners:
            break;
          default:
            owners[targetId] = kHasMultipleOwners;
            worklist.push(targetId);
            break;
        }
      }
    }
    for (let i = 0; i < nodeCount; ++i) {
      const ownerId = owners[i];
      switch (ownerId) {
        case kUnvisited:
        case kHasMultipleOwners:
        case i:
          break;
        default: {
          const ownedNodeIndex = i * nodeFieldCount;
          const ownerNodeIndex = ownerId * nodeFieldCount;
          node.nodeIndex = ownerNodeIndex;
          if (node.isSynthetic() || node.isRoot()) {
            break;
          }
          const sizeToTransfer = nodes.getValue(
            ownedNodeIndex + nodeSelfSizeOffset
          );
          nodes.setValue(ownedNodeIndex + nodeSelfSizeOffset, 0);
          nodes.setValue(
            ownerNodeIndex + nodeSelfSizeOffset,
            nodes.getValue(ownerNodeIndex + nodeSelfSizeOffset) + sizeToTransfer
          );
          break;
        }
      }
    }
  }
  calculateDistances(isForRetainersView) {
    const pendingEphemeronEdges = /* @__PURE__ */ new Set();
    const snapshot = this;
    function filter(node, edge) {
      if (node.isHidden() && edge.name() === "sloppy_function_map" && node.rawName() === "system / NativeContext") {
        return false;
      }
      if (node.isArray() && node.rawName() === "(map descriptors)") {
        const index = parseInt(edge.name(), 10);
        return index < 2 || index % 3 !== 1;
      }
      if (edge.isInternal()) {
        const match = snapshot.tryParseWeakMapEdgeName(edge.nameIndex());
        if (match) {
          if (!pendingEphemeronEdges.delete(match.duplicatedPart)) {
            pendingEphemeronEdges.add(match.duplicatedPart);
            return false;
          }
        }
      }
      return true;
    }
    super.calculateDistances(isForRetainersView, filter);
  }
  isUserRoot(node) {
    return node.isUserRoot() || node.isDocumentDOMTreesRoot();
  }
  userObjectsMapAndFlag() {
    return { map: this.flags, flag: this.nodeFlags.pageObject };
  }
  flagsOfNode(node) {
    return this.flags[node.nodeIndex / this.nodeFieldCount];
  }
  markDetachedDOMTreeNodes() {
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeFieldCount = this.nodeFieldCount;
    const nodeNativeType = this.nodeNativeType;
    const nodeTypeOffset = this.nodeTypeOffset;
    const flag = this.nodeFlags.detachedDOMTreeNode;
    const node = this.rootNode();
    for (let nodeIndex = 0, ordinal = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount, ordinal++) {
      const nodeType = nodes.getValue(nodeIndex + nodeTypeOffset);
      if (nodeType !== nodeNativeType) {
        continue;
      }
      node.nodeIndex = nodeIndex;
      if (node.name().startsWith("Detached ")) {
        this.flags[ordinal] |= flag;
      }
    }
  }
  markQueriableHeapObjects() {
    const flag = this.nodeFlags.canBeQueried;
    const hiddenEdgeType = this.edgeHiddenType;
    const internalEdgeType = this.edgeInternalType;
    const invisibleEdgeType = this.edgeInvisibleType;
    const weakEdgeType = this.edgeWeakType;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const edgeFieldsCount = this.edgeFieldsCount;
    const containmentEdges = this.containmentEdges;
    const nodeFieldCount = this.nodeFieldCount;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const flags = this.flags;
    const list = [];
    for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
      if (iter.edge.node().isUserRoot()) {
        list.push(iter.edge.node().nodeIndex / nodeFieldCount);
      }
    }
    while (list.length) {
      const nodeOrdinal = list.pop();
      if (flags[nodeOrdinal] & flag) {
        continue;
      }
      flags[nodeOrdinal] |= flag;
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        const childNodeIndex = containmentEdges.getValue(
          edgeIndex + edgeToNodeOffset
        );
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (flags[childNodeOrdinal] & flag) {
          continue;
        }
        const type = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
        if (type === hiddenEdgeType || type === invisibleEdgeType || type === internalEdgeType || type === weakEdgeType) {
          continue;
        }
        list.push(childNodeOrdinal);
      }
    }
  }
  markPageOwnedNodes() {
    const edgeShortcutType = this.edgeShortcutType;
    const edgeElementType = this.edgeElementType;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const edgeFieldsCount = this.edgeFieldsCount;
    const edgeWeakType = this.edgeWeakType;
    const firstEdgeIndexes = this.firstEdgeIndexes;
    const containmentEdges = this.containmentEdges;
    const nodeFieldCount = this.nodeFieldCount;
    const nodesCount = this.nodeCount;
    const flags = this.flags;
    const pageObjectFlag = this.nodeFlags.pageObject;
    const nodesToVisit = new Uint32Array(nodesCount);
    let nodesToVisitLength = 0;
    const rootNodeOrdinal = this.rootNodeIndexInternal / nodeFieldCount;
    const node = this.rootNode();
    for (let edgeIndex = firstEdgeIndexes[rootNodeOrdinal], endEdgeIndex = firstEdgeIndexes[rootNodeOrdinal + 1]; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
      const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
      const nodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
      if (edgeType === edgeElementType) {
        node.nodeIndex = nodeIndex;
        if (!node.isDocumentDOMTreesRoot()) {
          continue;
        }
      } else if (edgeType !== edgeShortcutType) {
        continue;
      }
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      nodesToVisit[nodesToVisitLength++] = nodeOrdinal;
      flags[nodeOrdinal] |= pageObjectFlag;
    }
    while (nodesToVisitLength) {
      const nodeOrdinal = nodesToVisit[--nodesToVisitLength];
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
        const childNodeIndex = containmentEdges.getValue(
          edgeIndex + edgeToNodeOffset
        );
        const childNodeOrdinal = childNodeIndex / nodeFieldCount;
        if (flags[childNodeOrdinal] & pageObjectFlag) {
          continue;
        }
        const type = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
        if (type === edgeWeakType) {
          continue;
        }
        nodesToVisit[nodesToVisitLength++] = childNodeOrdinal;
        flags[childNodeOrdinal] |= pageObjectFlag;
      }
    }
  }
  calculateStatistics() {
    const nodeFieldCount = this.nodeFieldCount;
    const nodes = this.nodes;
    const nodesLength = nodes.length;
    const nodeTypeOffset = this.nodeTypeOffset;
    const nodeSizeOffset = this.nodeSelfSizeOffset;
    const nodeNativeType = this.nodeNativeType;
    const nodeCodeType = this.nodeCodeType;
    const nodeConsStringType = this.nodeConsStringType;
    const nodeSlicedStringType = this.nodeSlicedStringType;
    const nodeHiddenType = this.nodeHiddenType;
    const nodeStringType = this.nodeStringType;
    let sizeNative = this.profile.snapshot.extra_native_bytes ?? 0;
    let sizeTypedArrays = 0;
    let sizeCode = 0;
    let sizeStrings = 0;
    let sizeJSArrays = 0;
    let sizeSystem = 0;
    const node = this.rootNode();
    for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
      const nodeSize = nodes.getValue(nodeIndex + nodeSizeOffset);
      const nodeType = nodes.getValue(nodeIndex + nodeTypeOffset);
      if (nodeType === nodeHiddenType) {
        sizeSystem += nodeSize;
        continue;
      }
      node.nodeIndex = nodeIndex;
      if (nodeType === nodeNativeType) {
        sizeNative += nodeSize;
        if (node.rawName() === "system / JSArrayBufferData") {
          sizeTypedArrays += nodeSize;
        }
      } else if (nodeType === nodeCodeType) {
        sizeCode += nodeSize;
      } else if (nodeType === nodeConsStringType || nodeType === nodeSlicedStringType || nodeType === nodeStringType) {
        sizeStrings += nodeSize;
      } else if (node.rawName() === "Array") {
        sizeJSArrays += this.calculateArraySize(node);
      }
    }
    this.#statistics = {
      total: this.totalSize,
      native: {
        total: sizeNative,
        typedArrays: sizeTypedArrays
      },
      v8heap: {
        total: this.totalSize - sizeNative,
        code: sizeCode,
        jsArrays: sizeJSArrays,
        strings: sizeStrings,
        system: sizeSystem
      }
    };
  }
  calculateArraySize(node) {
    let size = node.selfSize();
    const beginEdgeIndex = node.edgeIndexesStart();
    const endEdgeIndex = node.edgeIndexesEnd();
    const containmentEdges = this.containmentEdges;
    const strings = this.strings;
    const edgeToNodeOffset = this.edgeToNodeOffset;
    const edgeTypeOffset = this.edgeTypeOffset;
    const edgeNameOffset = this.edgeNameOffset;
    const edgeFieldsCount = this.edgeFieldsCount;
    const edgeInternalType = this.edgeInternalType;
    for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
      const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
      if (edgeType !== edgeInternalType) {
        continue;
      }
      const edgeName = strings[containmentEdges.getValue(edgeIndex + edgeNameOffset)];
      if (edgeName !== "elements") {
        continue;
      }
      const elementsNodeIndex = containmentEdges.getValue(
        edgeIndex + edgeToNodeOffset
      );
      node.nodeIndex = elementsNodeIndex;
      if (node.retainersCount() === 1) {
        size += node.selfSize();
      }
      break;
    }
    return size;
  }
  getStatistics() {
    return this.#statistics;
  }
}
class JSHeapSnapshotNode extends HeapSnapshotNode {
  constructor(snapshot, nodeIndex) {
    super(snapshot, nodeIndex);
  }
  canBeQueried() {
    const snapshot = this.snapshot;
    const flags = snapshot.flagsOfNode(this);
    return Boolean(flags & snapshot.nodeFlags.canBeQueried);
  }
  name() {
    const snapshot = this.snapshot;
    if (this.rawType() === snapshot.nodeConsStringType) {
      return this.consStringName();
    }
    if (this.rawType() === snapshot.nodeObjectType && this.rawName() === "Object") {
      return this.#plainObjectName();
    }
    return this.rawName();
  }
  consStringName() {
    const snapshot = this.snapshot;
    const consStringType = snapshot.nodeConsStringType;
    const edgeInternalType = snapshot.edgeInternalType;
    const edgeFieldsCount = snapshot.edgeFieldsCount;
    const edgeToNodeOffset = snapshot.edgeToNodeOffset;
    const edgeTypeOffset = snapshot.edgeTypeOffset;
    const edgeNameOffset = snapshot.edgeNameOffset;
    const strings = snapshot.strings;
    const edges = snapshot.containmentEdges;
    const firstEdgeIndexes = snapshot.firstEdgeIndexes;
    const nodeFieldCount = snapshot.nodeFieldCount;
    const nodeTypeOffset = snapshot.nodeTypeOffset;
    const nodeNameOffset = snapshot.nodeNameOffset;
    const nodes = snapshot.nodes;
    const nodesStack = [];
    nodesStack.push(this.nodeIndex);
    let name = "";
    while (nodesStack.length && name.length < 1024) {
      const nodeIndex = nodesStack.pop();
      if (nodes.getValue(nodeIndex + nodeTypeOffset) !== consStringType) {
        name += strings[nodes.getValue(nodeIndex + nodeNameOffset)];
        continue;
      }
      const nodeOrdinal = nodeIndex / nodeFieldCount;
      const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
      const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
      let firstNodeIndex = 0;
      let secondNodeIndex = 0;
      for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex && (!firstNodeIndex || !secondNodeIndex); edgeIndex += edgeFieldsCount) {
        const edgeType = edges.getValue(edgeIndex + edgeTypeOffset);
        if (edgeType === edgeInternalType) {
          const edgeName = strings[edges.getValue(edgeIndex + edgeNameOffset)];
          if (edgeName === "first") {
            firstNodeIndex = edges.getValue(edgeIndex + edgeToNodeOffset);
          } else if (edgeName === "second") {
            secondNodeIndex = edges.getValue(edgeIndex + edgeToNodeOffset);
          }
        }
      }
      nodesStack.push(secondNodeIndex);
      nodesStack.push(firstNodeIndex);
    }
    return name;
  }
  // Creates a name for plain JS objects, which looks something like
  // '{propName, otherProp, thirdProp, ..., secondToLastProp, lastProp}'.
  // A variable number of property names is included, depending on the length
  // of the property names, so that the result fits nicely in a reasonably
  // sized DevTools window.
  #plainObjectName() {
    const snapshot = this.snapshot;
    const { edgeFieldsCount, edgePropertyType } = snapshot;
    const edge = snapshot.createEdge(0);
    let categoryNameStart = "{";
    let categoryNameEnd = "}";
    let edgeIndexFromStart = this.edgeIndexesStart();
    let edgeIndexFromEnd = this.edgeIndexesEnd() - edgeFieldsCount;
    let nextFromEnd = false;
    while (edgeIndexFromStart <= edgeIndexFromEnd) {
      edge.edgeIndex = nextFromEnd ? edgeIndexFromEnd : edgeIndexFromStart;
      if (edge.rawType() !== edgePropertyType || edge.name() === "__proto__") {
        if (nextFromEnd) {
          edgeIndexFromEnd -= edgeFieldsCount;
        } else {
          edgeIndexFromStart += edgeFieldsCount;
        }
        continue;
      }
      const formatted = JSHeapSnapshotNode.formatPropertyName(edge.name());
      if (categoryNameStart.length > 1 && categoryNameStart.length + categoryNameEnd.length + formatted.length > 100) {
        break;
      }
      if (nextFromEnd) {
        edgeIndexFromEnd -= edgeFieldsCount;
        if (categoryNameEnd.length > 1) {
          categoryNameEnd = ", " + categoryNameEnd;
        }
        categoryNameEnd = formatted + categoryNameEnd;
      } else {
        edgeIndexFromStart += edgeFieldsCount;
        if (categoryNameStart.length > 1) {
          categoryNameStart += ", ";
        }
        categoryNameStart += formatted;
      }
      nextFromEnd = !nextFromEnd;
    }
    if (edgeIndexFromStart <= edgeIndexFromEnd) {
      categoryNameStart += ", ...";
    }
    if (categoryNameEnd.length > 1) {
      categoryNameStart += ", ";
    }
    return categoryNameStart + categoryNameEnd;
  }
  static formatPropertyName(name) {
    if (/[,'"{}]/.test(name)) {
      name = JSON.stringify({ [name]: 0 });
      name = name.substring(1, name.length - 3);
    }
    return name;
  }
  id() {
    const snapshot = this.snapshot;
    return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeIdOffset);
  }
  isHidden() {
    return this.rawType() === this.snapshot.nodeHiddenType;
  }
  isArray() {
    return this.rawType() === this.snapshot.nodeArrayType;
  }
  isSynthetic() {
    return this.rawType() === this.snapshot.nodeSyntheticType;
  }
  isNative() {
    return this.rawType() === this.snapshot.nodeNativeType;
  }
  isUserRoot() {
    return !this.isSynthetic();
  }
  isDocumentDOMTreesRoot() {
    return this.isSynthetic() && this.rawName() === "(Document DOM trees)";
  }
  serialize() {
    const result = super.serialize();
    const snapshot = this.snapshot;
    const flags = snapshot.flagsOfNode(this);
    if (flags & snapshot.nodeFlags.canBeQueried) {
      result.canBeQueried = true;
    }
    if (flags & snapshot.nodeFlags.detachedDOMTreeNode) {
      result.detachedDOMTreeNode = true;
    }
    return result;
  }
}
class JSHeapSnapshotEdge extends HeapSnapshotEdge {
  constructor(snapshot, edgeIndex) {
    super(snapshot, edgeIndex);
  }
  clone() {
    const snapshot = this.snapshot;
    return new JSHeapSnapshotEdge(snapshot, this.edgeIndex);
  }
  hasStringName() {
    if (!this.isShortcut()) {
      return this.hasStringNameInternal();
    }
    return isNaN(parseInt(this.nameInternal(), 10));
  }
  isElement() {
    return this.rawType() === this.snapshot.edgeElementType;
  }
  isHidden() {
    return this.rawType() === this.snapshot.edgeHiddenType;
  }
  isWeak() {
    return this.rawType() === this.snapshot.edgeWeakType;
  }
  isInternal() {
    return this.rawType() === this.snapshot.edgeInternalType;
  }
  isInvisible() {
    return this.rawType() === this.snapshot.edgeInvisibleType;
  }
  isShortcut() {
    return this.rawType() === this.snapshot.edgeShortcutType;
  }
  name() {
    const name = this.nameInternal();
    if (!this.isShortcut()) {
      return String(name);
    }
    const numName = parseInt(name, 10);
    return String(isNaN(numName) ? name : numName);
  }
  toString() {
    const name = this.name();
    switch (this.type()) {
      case "context":
        return "->" + name;
      case "element":
        return "[" + name + "]";
      case "weak":
        return "[[" + name + "]]";
      case "property":
        return name.indexOf(" ") === -1 ? "." + name : '["' + name + '"]';
      case "shortcut":
        if (typeof name === "string") {
          return name.indexOf(" ") === -1 ? "." + name : '["' + name + '"]';
        }
        return "[" + name + "]";
      case "internal":
      case "hidden":
      case "invisible":
        return "{" + name + "}";
    }
    return "?" + name + "?";
  }
  hasStringNameInternal() {
    const type = this.rawType();
    const snapshot = this.snapshot;
    return type !== snapshot.edgeElementType && type !== snapshot.edgeHiddenType;
  }
  nameInternal() {
    return this.hasStringNameInternal() ? this.snapshot.strings[this.nameOrIndex()] : this.nameOrIndex();
  }
  nameOrIndex() {
    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeNameOffset);
  }
  rawType() {
    return this.edges.getValue(this.edgeIndex + this.snapshot.edgeTypeOffset);
  }
  nameIndex() {
    if (!this.hasStringNameInternal()) {
      throw new Error("Edge does not have string name");
    }
    return this.nameOrIndex();
  }
}
class JSHeapSnapshotRetainerEdge extends HeapSnapshotRetainerEdge {
  constructor(snapshot, retainerIndex) {
    super(snapshot, retainerIndex);
  }
  clone() {
    const snapshot = this.snapshot;
    return new JSHeapSnapshotRetainerEdge(snapshot, this.retainerIndex());
  }
  isHidden() {
    return this.edge().isHidden();
  }
  isInvisible() {
    return this.edge().isInvisible();
  }
  isShortcut() {
    return this.edge().isShortcut();
  }
  isWeak() {
    return this.edge().isWeak();
  }
}

var HeapSnapshot$1 = /*#__PURE__*/Object.freeze({
  __proto__: null,
  HeapSnapshot: HeapSnapshot,
  HeapSnapshotEdge: HeapSnapshotEdge,
  HeapSnapshotEdgeIndexProvider: HeapSnapshotEdgeIndexProvider,
  HeapSnapshotEdgeIterator: HeapSnapshotEdgeIterator,
  HeapSnapshotEdgesProvider: HeapSnapshotEdgesProvider,
  HeapSnapshotFilteredIterator: HeapSnapshotFilteredIterator,
  HeapSnapshotIndexRangeIterator: HeapSnapshotIndexRangeIterator,
  HeapSnapshotItemProvider: HeapSnapshotItemProvider,
  HeapSnapshotNode: HeapSnapshotNode,
  HeapSnapshotNodeIndexProvider: HeapSnapshotNodeIndexProvider,
  HeapSnapshotNodeIterator: HeapSnapshotNodeIterator,
  HeapSnapshotNodesProvider: HeapSnapshotNodesProvider,
  HeapSnapshotProgress: HeapSnapshotProgress,
  HeapSnapshotRetainerEdge: HeapSnapshotRetainerEdge,
  HeapSnapshotRetainerEdgeIndexProvider: HeapSnapshotRetainerEdgeIndexProvider,
  HeapSnapshotRetainerEdgeIterator: HeapSnapshotRetainerEdgeIterator,
  JSHeapSnapshot: JSHeapSnapshot,
  JSHeapSnapshotEdge: JSHeapSnapshotEdge,
  JSHeapSnapshotNode: JSHeapSnapshotNode,
  JSHeapSnapshotRetainerEdge: JSHeapSnapshotRetainerEdge,
  SecondaryInitManager: SecondaryInitManager,
  serializeUIString: serializeUIString
});

class HeapSnapshotWorkerDispatcher {
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #objects;
  #postMessage;
  constructor(postMessage) {
    this.#objects = [];
    this.#postMessage = postMessage;
  }
  sendEvent(name, data2) {
    this.#postMessage({ eventName: name, data: data2 });
  }
  async dispatchMessage({
    data,
    ports
  }) {
    const response = {
      callId: data.callId,
      result: null,
      error: void 0,
      errorCallStack: void 0,
      errorMethodName: void 0
    };
    try {
      switch (data.disposition) {
        case "createLoader":
          this.#objects[data.objectId] = new HeapSnapshotLoader(this);
          break;
        case "dispose": {
          delete this.#objects[data.objectId];
          break;
        }
        case "getter": {
          const object = this.#objects[data.objectId];
          const result = object[data.methodName];
          response.result = result;
          break;
        }
        case "factory": {
          const object = this.#objects[data.objectId];
          const args = data.methodArguments.slice();
          args.push(...ports);
          const result = await object[data.methodName].apply(object, args);
          if (result) {
            this.#objects[data.newObjectId] = result;
          }
          response.result = Boolean(result);
          break;
        }
        case "method": {
          const object = this.#objects[data.objectId];
          response.result = object[data.methodName].apply(
            object,
            data.methodArguments
          );
          break;
        }
        case "evaluateForTest": {
          try {
            globalThis.HeapSnapshotWorker = {
              AllocationProfile: AllocationProfile$1,
              HeapSnapshot: HeapSnapshot$1,
              HeapSnapshotLoader: HeapSnapshotLoader$1
            };
            globalThis.HeapSnapshotModel = HeapSnapshotModel;
            response.result = await eval(data.source);
          } catch (error) {
            response.result = error.toString();
          }
          break;
        }
        case "setupForSecondaryInit": {
          this.#objects[data.objectId] = new SecondaryInitManager(
            ports[0]
          );
        }
      }
    } catch (error) {
      response.error = error.toString();
      response.errorCallStack = error.stack;
      if (data.methodName) {
        response.errorMethodName = data.methodName;
      }
    }
    this.#postMessage(response);
  }
}

class BalancedJSONTokenizer {
  callback;
  index;
  balance;
  buffer;
  findMultiple;
  closingDoubleQuoteRegex;
  lastBalancedIndex;
  constructor(callback, findMultiple) {
    this.callback = callback;
    this.index = 0;
    this.balance = 0;
    this.buffer = "";
    this.findMultiple = findMultiple || false;
    this.closingDoubleQuoteRegex = /[^\\](?:\\\\)*"/g;
  }
  write(chunk) {
    this.buffer += chunk;
    const lastIndex = this.buffer.length;
    const buffer = this.buffer;
    let index;
    for (index = this.index; index < lastIndex; ++index) {
      const character = buffer[index];
      if (character === '"') {
        this.closingDoubleQuoteRegex.lastIndex = index;
        if (!this.closingDoubleQuoteRegex.test(buffer)) {
          break;
        }
        index = this.closingDoubleQuoteRegex.lastIndex - 1;
      } else if (character === "{") {
        ++this.balance;
      } else if (character === "}") {
        --this.balance;
        if (this.balance < 0) {
          this.reportBalanced();
          return false;
        }
        if (!this.balance) {
          this.lastBalancedIndex = index + 1;
          if (!this.findMultiple) {
            break;
          }
        }
      } else if (character === "]" && !this.balance) {
        this.reportBalanced();
        return false;
      }
    }
    this.index = index;
    this.reportBalanced();
    return true;
  }
  reportBalanced() {
    if (!this.lastBalancedIndex) {
      return;
    }
    this.callback(this.buffer.slice(0, this.lastBalancedIndex));
    this.buffer = this.buffer.slice(this.lastBalancedIndex);
    this.index -= this.lastBalancedIndex;
    this.lastBalancedIndex = 0;
  }
  remainder() {
    return this.buffer;
  }
}

class HeapSnapshotLoader {
  #progress;
  #buffer;
  #dataCallback;
  #done;
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #snapshot;
  #array;
  #arrayIndex;
  #json = "";
  parsingComplete;
  constructor(dispatcherOrProgress) {
    this.#reset();
    if (dispatcherOrProgress instanceof HeapSnapshotWorkerDispatcher) {
      this.#progress = new HeapSnapshotProgress(dispatcherOrProgress);
    } else {
      this.#progress = dispatcherOrProgress;
    }
    this.#buffer = [];
    this.#dataCallback = null;
    this.#done = false;
    this.parsingComplete = this.#parseInput();
  }
  dispose() {
    this.#reset();
  }
  #reset() {
    this.#json = "";
    this.#snapshot = void 0;
  }
  close() {
    this.#done = true;
    if (this.#dataCallback) {
      this.#dataCallback("");
    }
  }
  async buildSnapshot(secondWorker) {
    this.#snapshot = this.#snapshot || {};
    this.#progress.updateStatus("Processing snapshot\u2026");
    const result = new JSHeapSnapshot(
      this.#snapshot,
      this.#progress
    );
    await result.initialize(secondWorker);
    this.#reset();
    return result;
  }
  #parseUintArray() {
    let index = 0;
    const char0 = "0".charCodeAt(0);
    const char9 = "9".charCodeAt(0);
    const closingBracket = "]".charCodeAt(0);
    const length = this.#json.length;
    while (true) {
      while (index < length) {
        const code = this.#json.charCodeAt(index);
        if (char0 <= code && code <= char9) {
          break;
        } else if (code === closingBracket) {
          this.#json = this.#json.slice(index + 1);
          return false;
        }
        ++index;
      }
      if (index === length) {
        this.#json = "";
        return true;
      }
      let nextNumber = 0;
      const startIndex = index;
      while (index < length) {
        const code = this.#json.charCodeAt(index);
        if (char0 > code || code > char9) {
          break;
        }
        nextNumber *= 10;
        nextNumber += code - char0;
        ++index;
      }
      if (index === length) {
        this.#json = this.#json.slice(startIndex);
        return true;
      }
      if (!this.#array) {
        throw new Error("Array not instantiated");
      }
      this.#array.setValue(this.#arrayIndex++, nextNumber);
    }
  }
  #parseStringsArray() {
    this.#progress.updateStatus("Parsing strings\u2026");
    const closingBracketIndex = this.#json.lastIndexOf("]");
    if (closingBracketIndex === -1) {
      throw new Error("Incomplete JSON");
    }
    this.#json = this.#json.slice(0, closingBracketIndex + 1);
    if (!this.#snapshot) {
      throw new Error("No snapshot in parseStringsArray");
    }
    this.#snapshot.strings = JSON.parse(this.#json);
  }
  write(chunk) {
    this.#buffer.push(chunk);
    if (!this.#dataCallback) {
      return;
    }
    this.#dataCallback(this.#buffer.shift());
    this.#dataCallback = null;
  }
  #fetchChunk() {
    if (this.#buffer.length > 0) {
      return Promise.resolve(this.#buffer.shift());
    }
    const { promise, resolve } = withResolvers();
    this.#dataCallback = resolve;
    return promise;
  }
  async #findToken(token, startIndex) {
    while (true) {
      const pos = this.#json.indexOf(token, startIndex || 0);
      if (pos !== -1) {
        return pos;
      }
      startIndex = this.#json.length - token.length + 1;
      this.#json += await this.#fetchChunk();
    }
  }
  async #parseArray(name, title, length) {
    const nameIndex = await this.#findToken(name);
    const bracketIndex = await this.#findToken("[", nameIndex);
    this.#json = this.#json.slice(bracketIndex + 1);
    this.#array = length === void 0 ? createExpandableBigUint32Array() : createFixedBigUint32Array(length);
    this.#arrayIndex = 0;
    while (this.#parseUintArray()) {
      if (length) {
        this.#progress.updateProgress(
          title,
          this.#arrayIndex,
          this.#array.length
        );
      } else {
        this.#progress.updateStatus(title);
      }
      this.#json += await this.#fetchChunk();
    }
    const result = this.#array;
    this.#array = null;
    return result;
  }
  async #parseInput() {
    const snapshotToken = '"snapshot"';
    const snapshotTokenIndex = await this.#findToken(snapshotToken);
    if (snapshotTokenIndex === -1) {
      throw new Error("Snapshot token not found");
    }
    this.#progress.updateStatus("Loading snapshot info\u2026");
    const json = this.#json.slice(
      snapshotTokenIndex + snapshotToken.length + 1
    );
    let jsonTokenizerDone = false;
    const jsonTokenizer = new BalancedJSONTokenizer((metaJSON) => {
      this.#json = jsonTokenizer.remainder();
      jsonTokenizerDone = true;
      this.#snapshot = this.#snapshot || {};
      this.#snapshot.snapshot = JSON.parse(metaJSON);
    });
    jsonTokenizer.write(json);
    while (!jsonTokenizerDone) {
      jsonTokenizer.write(await this.#fetchChunk());
    }
    this.#snapshot = this.#snapshot || {};
    const nodes = await this.#parseArray(
      '"nodes"',
      "Loading nodes\u2026 {PH1}%",
      this.#snapshot.snapshot.meta.node_fields.length * this.#snapshot.snapshot.node_count
    );
    this.#snapshot.nodes = nodes;
    const edges = await this.#parseArray(
      '"edges"',
      "Loading edges\u2026 {PH1}%",
      this.#snapshot.snapshot.meta.edge_fields.length * this.#snapshot.snapshot.edge_count
    );
    this.#snapshot.edges = edges;
    if (this.#snapshot.snapshot.trace_function_count) {
      const traceFunctionInfos = await this.#parseArray(
        '"trace_function_infos"',
        "Loading allocation traces\u2026 {PH1}%",
        this.#snapshot.snapshot.meta.trace_function_info_fields.length * this.#snapshot.snapshot.trace_function_count
      );
      this.#snapshot.trace_function_infos = traceFunctionInfos.asUint32ArrayOrFail();
      const thisTokenEndIndex = await this.#findToken(":");
      const nextTokenIndex = await this.#findToken('"', thisTokenEndIndex);
      const openBracketIndex = this.#json.indexOf("[");
      const closeBracketIndex = this.#json.lastIndexOf("]", nextTokenIndex);
      this.#snapshot.trace_tree = JSON.parse(
        this.#json.substring(openBracketIndex, closeBracketIndex + 1)
      );
      this.#json = this.#json.slice(closeBracketIndex + 1);
    }
    if (this.#snapshot.snapshot.meta.sample_fields) {
      const samples = await this.#parseArray('"samples"', "Loading samples\u2026");
      this.#snapshot.samples = samples.asArrayOrFail();
    }
    if (this.#snapshot.snapshot.meta["location_fields"]) {
      const locations = await this.#parseArray(
        '"locations"',
        "Loading locations\u2026"
      );
      this.#snapshot.locations = locations.asArrayOrFail();
    } else {
      this.#snapshot.locations = [];
    }
    this.#progress.updateStatus("Loading strings\u2026");
    const stringsTokenIndex = await this.#findToken('"strings"');
    const bracketIndex = await this.#findToken("[", stringsTokenIndex);
    this.#json = this.#json.slice(bracketIndex);
    while (this.#buffer.length > 0 || !this.#done) {
      this.#json += await this.#fetchChunk();
    }
    this.#parseStringsArray();
  }
}

export { HeapSnapshotLoader as H, JSHeapSnapshot as J, SecondaryInitManager as S, HeapSnapshotProgress as a, HeapSnapshotEdge as b, HeapSnapshotNodeIndexProvider as c, HeapSnapshotEdgeIndexProvider as d, HeapSnapshotRetainerEdgeIndexProvider as e, HeapSnapshotEdgeIterator as f, HeapSnapshotRetainerEdge as g, HeapSnapshotRetainerEdgeIterator as h, HeapSnapshotNode as i, HeapSnapshotNodeIterator as j, HeapSnapshotIndexRangeIterator as k, HeapSnapshotFilteredIterator as l, HeapSnapshot as m, HeapSnapshotItemProvider as n, HeapSnapshotEdgesProvider as o, HeapSnapshotNodesProvider as p, JSHeapSnapshotNode as q, JSHeapSnapshotEdge as r, serializeUIString as s, JSHeapSnapshotRetainerEdge as t, HeapSnapshotWorkerDispatcher as u };
