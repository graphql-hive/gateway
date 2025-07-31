import { MessagePort } from 'node:worker_threads';
import { Readable } from 'node:stream';

declare class AllocationNodeCallers {
    nodesWithSingleCaller: SerializedAllocationNode[];
    branchingCallers: SerializedAllocationNode[];
    constructor(nodesWithSingleCaller: SerializedAllocationNode[], branchingCallers: SerializedAllocationNode[]);
}
declare class SerializedAllocationNode {
    id: number;
    name: string;
    scriptName: string;
    scriptId: number;
    line: number;
    column: number;
    count: number;
    size: number;
    liveCount: number;
    liveSize: number;
    hasChildren: boolean;
    constructor(nodeId: number, functionName: string, scriptName: string, scriptId: number, line: number, column: number, count: number, size: number, liveCount: number, liveSize: number, hasChildren: boolean);
}
declare class AllocationStackFrame {
    functionName: string;
    scriptName: string;
    scriptId: number;
    line: number;
    column: number;
    constructor(functionName: string, scriptName: string, scriptId: number, line: number, column: number);
}
declare class Node {
    id: number;
    name: string;
    distance: number;
    nodeIndex: number;
    retainedSize: number;
    selfSize: number;
    type: string;
    canBeQueried: boolean;
    detachedDOMTreeNode: boolean;
    isAddedNotRemoved: boolean | null;
    ignored: boolean;
    constructor(id: number, name: string, distance: number, nodeIndex: number, retainedSize: number, selfSize: number, type: string);
}
declare class Edge {
    name: string;
    node: Node;
    type: string;
    edgeIndex: number;
    isAddedNotRemoved: boolean | null;
    constructor(name: string, node: Node, type: string, edgeIndex: number);
}
declare class Aggregate {
    count: number;
    distance: number;
    self: number;
    maxRet: number;
    name: string;
    idxs: number[];
    constructor();
}
declare class AggregateForDiff {
    name: string;
    indexes: number[];
    ids: number[];
    selfSizes: number[];
    constructor();
}
declare class Diff {
    name: string;
    addedCount: number;
    removedCount: number;
    addedSize: number;
    removedSize: number;
    deletedIndexes: number[];
    addedIndexes: number[];
    countDelta: number;
    sizeDelta: number;
    constructor(name: string);
}
declare class ComparatorConfig {
    fieldName1: string;
    ascending1: boolean;
    fieldName2: string;
    ascending2: boolean;
    constructor(fieldName1: string, ascending1: boolean, fieldName2: string, ascending2: boolean);
}
declare class WorkerCommand {
    callId: number;
    disposition: string;
    objectId: number;
    newObjectId: number;
    methodName: string;
    methodArguments: any[];
    source: string;
    constructor();
}
declare class ItemsRange {
    startPosition: number;
    endPosition: number;
    totalLength: number;
    items: Array<Node | Edge>;
    constructor(startPosition: number, endPosition: number, totalLength: number, items: Array<Node | Edge>);
}
declare class StaticData {
    nodeCount: number;
    rootNodeIndex: number;
    totalSize: number;
    maxJSObjectId: number;
    constructor(nodeCount: number, rootNodeIndex: number, totalSize: number, maxJSObjectId: number);
}
interface Statistics {
    total: number;
    native: {
        total: number;
        typedArrays: number;
    };
    v8heap: {
        total: number;
        code: number;
        jsArrays: number;
        strings: number;
        system: number;
    };
}
declare class NodeFilter {
    minNodeId: number | undefined;
    maxNodeId: number | undefined;
    allocationNodeId: number | undefined;
    filterName: string | undefined;
    constructor(minNodeId?: number, maxNodeId?: number);
    equals(o: NodeFilter): boolean;
}
declare class SearchConfig {
    query: string;
    caseSensitive: boolean;
    isRegex: boolean;
    shouldJump: boolean;
    jumpBackward: boolean;
    constructor(query: string, caseSensitive: boolean, isRegex: boolean, shouldJump: boolean, jumpBackward: boolean);
    toSearchRegex(_global?: boolean): {
        regex: RegExp;
        fromQuery: boolean;
    };
}
declare class Samples {
    timestamps: number[];
    lastAssignedIds: number[];
    sizes: number[];
    constructor(timestamps: number[], lastAssignedIds: number[], sizes: number[]);
}
declare class Location {
    scriptId: number;
    lineNumber: number;
    columnNumber: number;
    constructor(scriptId: number, lineNumber: number, columnNumber: number);
}

declare class HeapSnapshotWorkerDispatcher {
    #private;
    constructor(postMessage: MessagePort['postMessage']);
    sendEvent(name: string, data: unknown): void;
    dispatchMessage({ data, ports, }: {
        data: WorkerCommand;
        ports: readonly MessagePort[];
    }): Promise<void>;
}

/**
 * An object which provides functionality similar to Uint32Array. It may be
 * implemented as:
 * 1. A Uint32Array,
 * 2. An array of Uint32Arrays, to support more data than Uint32Array, or
 * 3. A plain array, in which case the length may change by setting values.
 */
interface BigUint32Array {
    get length(): number;
    getValue(index: number): number;
    setValue(index: number, value: number): void;
    asUint32ArrayOrFail(): Uint32Array;
    asArrayOrFail(): number[];
}
interface BitVector {
    getBit(index: number): boolean;
    setBit(index: number): void;
    clearBit(index: number): void;
    previous(index: number): number;
    get buffer(): ArrayBuffer;
}

interface HeapSnapshotItem {
    itemIndex(): number;
    serialize(): Object;
}
declare class HeapSnapshotEdge implements HeapSnapshotItem {
    snapshot: HeapSnapshot;
    protected readonly edges: BigUint32Array;
    edgeIndex: number;
    constructor(snapshot: HeapSnapshot, edgeIndex?: number);
    clone(): HeapSnapshotEdge;
    hasStringName(): boolean;
    name(): string;
    node(): HeapSnapshotNode;
    nodeIndex(): number;
    toString(): string;
    type(): string;
    itemIndex(): number;
    serialize(): Edge;
    rawType(): number;
    isInternal(): boolean;
    isInvisible(): boolean;
    isWeak(): boolean;
    getValueForSorting(_fieldName: string): number;
    nameIndex(): number;
}
interface HeapSnapshotItemIterator {
    hasNext(): boolean;
    item(): HeapSnapshotItem;
    next(): void;
}
interface HeapSnapshotItemIndexProvider {
    itemForIndex(newIndex: number): HeapSnapshotItem;
}
declare class HeapSnapshotNodeIndexProvider implements HeapSnapshotItemIndexProvider {
    #private;
    constructor(snapshot: HeapSnapshot);
    itemForIndex(index: number): HeapSnapshotNode;
}
declare class HeapSnapshotEdgeIndexProvider implements HeapSnapshotItemIndexProvider {
    #private;
    constructor(snapshot: HeapSnapshot);
    itemForIndex(index: number): HeapSnapshotEdge;
}
declare class HeapSnapshotRetainerEdgeIndexProvider implements HeapSnapshotItemIndexProvider {
    #private;
    constructor(snapshot: HeapSnapshot);
    itemForIndex(index: number): HeapSnapshotRetainerEdge;
}
declare class HeapSnapshotEdgeIterator implements HeapSnapshotItemIterator {
    #private;
    edge: JSHeapSnapshotEdge;
    constructor(node: HeapSnapshotNode);
    hasNext(): boolean;
    item(): HeapSnapshotEdge;
    next(): void;
}
declare class HeapSnapshotRetainerEdge implements HeapSnapshotItem {
    #private;
    protected snapshot: HeapSnapshot;
    constructor(snapshot: HeapSnapshot, retainerIndex: number);
    clone(): HeapSnapshotRetainerEdge;
    hasStringName(): boolean;
    name(): string;
    nameIndex(): number;
    node(): HeapSnapshotNode;
    nodeIndex(): number;
    retainerIndex(): number;
    setRetainerIndex(retainerIndex: number): void;
    set edgeIndex(edgeIndex: number);
    private nodeInternal;
    protected edge(): JSHeapSnapshotEdge;
    toString(): string;
    itemIndex(): number;
    serialize(): Edge;
    type(): string;
    isInternal(): boolean;
    getValueForSorting(fieldName: string): number;
}
declare class HeapSnapshotRetainerEdgeIterator implements HeapSnapshotItemIterator {
    #private;
    retainer: JSHeapSnapshotRetainerEdge;
    constructor(retainedNode: HeapSnapshotNode);
    hasNext(): boolean;
    item(): HeapSnapshotRetainerEdge;
    next(): void;
}
declare class HeapSnapshotNode implements HeapSnapshotItem {
    #private;
    snapshot: HeapSnapshot;
    nodeIndex: number;
    constructor(snapshot: HeapSnapshot, nodeIndex?: number);
    distance(): number;
    distanceForRetainersView(): number;
    className(): string;
    classIndex(): number;
    classKeyInternal(): string | number;
    setClassIndex(index: number): void;
    dominatorIndex(): number;
    edges(): HeapSnapshotEdgeIterator;
    edgesCount(): number;
    id(): number;
    rawName(): string;
    isRoot(): boolean;
    isUserRoot(): boolean;
    isHidden(): boolean;
    isArray(): boolean;
    isSynthetic(): boolean;
    isDocumentDOMTreesRoot(): boolean;
    name(): string;
    retainedSize(): number;
    retainers(): HeapSnapshotRetainerEdgeIterator;
    retainersCount(): number;
    selfSize(): number;
    type(): string;
    traceNodeId(): number;
    itemIndex(): number;
    serialize(): Node;
    rawNameIndex(): number;
    edgeIndexesStart(): number;
    edgeIndexesEnd(): number;
    ordinal(): number;
    nextNodeIndex(): number;
    rawType(): number;
    isFlatConsString(): boolean;
    detachedness(): DOMLinkState;
    setDetachedness(detachedness: DOMLinkState): void;
}
declare class HeapSnapshotNodeIterator implements HeapSnapshotItemIterator {
    #private;
    node: HeapSnapshotNode;
    constructor(node: HeapSnapshotNode);
    hasNext(): boolean;
    item(): HeapSnapshotNode;
    next(): void;
}
declare class HeapSnapshotIndexRangeIterator implements HeapSnapshotItemIterator {
    #private;
    constructor(itemProvider: HeapSnapshotItemIndexProvider, indexes: number[] | Uint32Array);
    hasNext(): boolean;
    item(): HeapSnapshotItem;
    next(): void;
}
declare class HeapSnapshotFilteredIterator implements HeapSnapshotItemIterator {
    #private;
    constructor(iterator: HeapSnapshotItemIterator, filter?: (arg0: HeapSnapshotItem) => boolean);
    hasNext(): boolean;
    item(): HeapSnapshotItem;
    next(): void;
    private skipFilteredItems;
}
declare function serializeUIString(string: string, values?: Record<string, Object>): string;
declare class HeapSnapshotProgress {
    #private;
    constructor(dispatcher?: HeapSnapshotWorkerDispatcher);
    updateStatus(status: string): void;
    updateProgress(title: string, value: number, total: number): void;
    reportProblem(error: string): void;
    private sendUpdateEvent;
}
interface Profile {
    root_index: number;
    nodes: BigUint32Array;
    edges: BigUint32Array;
    snapshot: HeapSnapshotHeader;
    samples: number[];
    strings: string[];
    locations: number[];
    trace_function_infos: Uint32Array;
    trace_tree: Object;
}
interface LiveObjects {
    [x: number]: {
        count: number;
        size: number;
        ids: number[];
    };
}
interface SecondaryInitArgumentsStep1 {
    edgeToNodeOrdinals: Uint32Array;
    firstEdgeIndexes: Uint32Array;
    nodeCount: number;
    edgeFieldsCount: number;
    nodeFieldCount: number;
}
interface SecondaryInitArgumentsStep2 {
    rootNodeOrdinal: number;
    essentialEdgesBuffer: ArrayBuffer;
}
interface SecondaryInitArgumentsStep3 {
    nodeSelfSizes: Uint32Array;
}
type ArgumentsToBuildRetainers = SecondaryInitArgumentsStep1;
interface Retainers {
    firstRetainerIndex: Uint32Array;
    retainingNodes: Uint32Array;
    retainingEdges: Uint32Array;
}
interface ArgumentsToComputeDominatorsAndRetainedSizes extends SecondaryInitArgumentsStep1, Retainers, SecondaryInitArgumentsStep2 {
    essentialEdges: BitVector;
    port: MessagePort;
    nodeSelfSizesPromise: Promise<Uint32Array>;
}
interface DominatorsAndRetainedSizes {
    dominatorsTree: Uint32Array;
    retainedSizes: Float64Array;
}
interface ArgumentsToBuildDominatedNodes extends ArgumentsToComputeDominatorsAndRetainedSizes, DominatorsAndRetainedSizes {
}
interface DominatedNodes {
    firstDominatedNodeIndex: Uint32Array;
    dominatedNodes: Uint32Array;
}
declare class SecondaryInitManager {
    argsStep1: Promise<SecondaryInitArgumentsStep1>;
    argsStep2: Promise<SecondaryInitArgumentsStep2>;
    argsStep3: Promise<SecondaryInitArgumentsStep3>;
    constructor(port: MessagePort);
    private getNodeSelfSizes;
    private initialize;
}
/**
 * DOM node link state.
 */
declare const enum DOMLinkState {
    UNKNOWN = 0,
    ATTACHED = 1,
    DETACHED = 2
}
declare abstract class HeapSnapshot {
    #private;
    nodes: BigUint32Array;
    containmentEdges: BigUint32Array;
    strings: string[];
    rootNodeIndexInternal: number;
    profile: Profile;
    nodeTypeOffset: number;
    nodeNameOffset: number;
    nodeIdOffset: number;
    nodeSelfSizeOffset: number;
    nodeTraceNodeIdOffset: number;
    nodeFieldCount: number;
    nodeTypes: string[];
    nodeArrayType: number;
    nodeHiddenType: number;
    nodeObjectType: number;
    nodeNativeType: number;
    nodeStringType: number;
    nodeConsStringType: number;
    nodeSlicedStringType: number;
    nodeCodeType: number;
    nodeSyntheticType: number;
    nodeClosureType: number;
    nodeRegExpType: number;
    edgeFieldsCount: number;
    edgeTypeOffset: number;
    edgeNameOffset: number;
    edgeToNodeOffset: number;
    edgeTypes: string[];
    edgeElementType: number;
    edgeHiddenType: number;
    edgeInternalType: number;
    edgeShortcutType: number;
    edgeWeakType: number;
    edgeInvisibleType: number;
    edgePropertyType: number;
    nodeCount: number;
    retainedSizes: Float64Array;
    firstEdgeIndexes: Uint32Array;
    retainingNodes: Uint32Array;
    retainingEdges: Uint32Array;
    firstRetainerIndex: Uint32Array;
    nodeDistances: Int32Array;
    firstDominatedNodeIndex: Uint32Array;
    dominatedNodes: Uint32Array;
    dominatorsTree: Uint32Array;
    nodeDetachednessAndClassIndexOffset: number;
    detachednessAndClassIndexArray?: Uint32Array;
    constructor(profile: Profile, progress: HeapSnapshotProgress);
    initialize(secondWorker: MessagePort): Promise<void>;
    private startInitStep1InSecondThread;
    private startInitStep2InSecondThread;
    private startInitStep3InSecondThread;
    private installResultsFromSecondThread;
    private buildEdgeIndexes;
    static buildRetainers(inputs: ArgumentsToBuildRetainers): Retainers;
    abstract createNode(_nodeIndex?: number): HeapSnapshotNode;
    abstract createEdge(_edgeIndex: number): JSHeapSnapshotEdge;
    abstract createRetainingEdge(_retainerIndex: number): JSHeapSnapshotRetainerEdge;
    private allNodes;
    rootNode(): HeapSnapshotNode;
    get rootNodeIndex(): number;
    get totalSize(): number;
    private createFilter;
    search(searchConfig: SearchConfig, nodeFilter: NodeFilter): number[];
    aggregatesWithFilter(nodeFilter: NodeFilter): {
        [x: string]: Aggregate;
    };
    private createNodeIdFilter;
    private createAllocationStackFilter;
    private createNamedFilter;
    getAggregatesByClassKey(sortedIndexes: boolean, key?: string, filter?: (arg0: HeapSnapshotNode) => boolean): {
        [x: string]: Aggregate;
    };
    allocationTracesTops(): SerializedAllocationNode[];
    allocationNodeCallers(nodeId: number): AllocationNodeCallers;
    allocationStack(nodeIndex: number): AllocationStackFrame[] | null;
    aggregatesForDiff(interfaceDefinitions: string): {
        [x: string]: AggregateForDiff;
    };
    isUserRoot(_node: HeapSnapshotNode): boolean;
    calculateShallowSizes(): void;
    calculateDistances(isForRetainersView: boolean, filter?: (arg0: HeapSnapshotNode, arg1: HeapSnapshotEdge) => boolean): void;
    private bfs;
    private buildAggregates;
    private calculateClassesRetainedSize;
    private sortAggregateIndexes;
    tryParseWeakMapEdgeName(edgeNameIndex: number): {
        duplicatedPart: string;
        tableId: string;
    } | undefined;
    private computeIsEssentialEdge;
    private initEssentialEdges;
    static hasOnlyWeakRetainers(inputs: ArgumentsToComputeDominatorsAndRetainedSizes, nodeOrdinal: number): boolean;
    static calculateDominatorsAndRetainedSizes(inputs: ArgumentsToComputeDominatorsAndRetainedSizes): Promise<DominatorsAndRetainedSizes>;
    static buildDominatedNodes(inputs: ArgumentsToBuildDominatedNodes): DominatedNodes;
    private calculateObjectNames;
    interfaceDefinitions(): string;
    private isPlainJSObject;
    private inferInterfaceDefinitions;
    private applyInterfaceDefinitions;
    /**
     * Iterates children of a node.
     */
    private iterateFilteredChildren;
    /**
     * Adds a string to the snapshot.
     */
    private addString;
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
    private propagateDOMState;
    private buildSamples;
    private buildLocationMap;
    getLocation(nodeIndex: number): Location | null;
    getSamples(): Samples | null;
    calculateFlags(): void;
    calculateStatistics(): void;
    userObjectsMapAndFlag(): {
        map: Uint8Array;
        flag: number;
    } | null;
    calculateSnapshotDiff(baseSnapshotId: string, baseSnapshotAggregates: {
        [x: string]: AggregateForDiff;
    }): {
        [x: string]: Diff;
    };
    private calculateDiffForClass;
    private nodeForSnapshotObjectId;
    classKeyFromClassKeyInternal(key: string | number): string;
    nodeClassKey(snapshotObjectId: number): string | null;
    idsOfObjectsWithName(name: string): number[];
    createEdgesProvider(nodeIndex: number): HeapSnapshotEdgesProvider;
    createEdgesProviderForTest(nodeIndex: number, filter: ((arg0: HeapSnapshotEdge) => boolean) | null): HeapSnapshotEdgesProvider;
    retainingEdgesFilter(): ((arg0: HeapSnapshotEdge) => boolean) | null;
    containmentEdgesFilter(): ((arg0: HeapSnapshotEdge) => boolean) | null;
    createRetainingEdgesProvider(nodeIndex: number): HeapSnapshotEdgesProvider;
    createAddedNodesProvider(baseSnapshotId: string, classKey: string): HeapSnapshotNodesProvider;
    createDeletedNodesProvider(nodeIndexes: number[]): HeapSnapshotNodesProvider;
    createNodesProviderForClass(classKey: string, nodeFilter: NodeFilter): HeapSnapshotNodesProvider;
    private maxJsNodeId;
    updateStaticData(): StaticData;
    ignoreNodeInRetainersView(nodeIndex: number): void;
    unignoreNodeInRetainersView(nodeIndex: number): void;
    unignoreAllNodesInRetainersView(): void;
    areNodesIgnoredInRetainersView(): boolean;
    getDistanceForRetainersView(nodeIndex: number): number;
    isNodeIgnoredInRetainersView(nodeIndex: number): boolean;
    isEdgeIgnoredInRetainersView(edgeIndex: number): boolean;
}
interface HeapSnapshotMetaInfo {
    location_fields: string[];
    node_fields: string[];
    node_types: string[][];
    edge_fields: string[];
    edge_types: string[][];
    trace_function_info_fields: string[];
    trace_node_fields: string[];
    sample_fields: string[];
    type_strings: {
        [key: string]: string;
    };
}
interface HeapSnapshotHeader {
    title: string;
    meta: HeapSnapshotMetaInfo;
    node_count: number;
    edge_count: number;
    trace_function_count: number;
    root_index: number;
    extra_native_bytes?: number;
}
declare abstract class HeapSnapshotItemProvider {
    #private;
    protected readonly iterator: HeapSnapshotItemIterator;
    protected iterationOrder: number[] | null;
    protected currentComparator: ComparatorConfig | null;
    constructor(iterator: HeapSnapshotItemIterator, indexProvider: HeapSnapshotItemIndexProvider);
    protected createIterationOrder(): void;
    isEmpty(): boolean;
    serializeItemsRange(begin: number, end: number): ItemsRange;
    sortAndRewind(comparator: ComparatorConfig): void;
    abstract sort(comparator: ComparatorConfig, leftBound: number, rightBound: number, windowLeft: number, windowRight: number): void;
}
declare class HeapSnapshotEdgesProvider extends HeapSnapshotItemProvider {
    snapshot: HeapSnapshot;
    constructor(snapshot: HeapSnapshot, filter: ((arg0: HeapSnapshotEdge) => boolean) | null, edgesIter: HeapSnapshotEdgeIterator | HeapSnapshotRetainerEdgeIterator, indexProvider: HeapSnapshotItemIndexProvider);
    sort(comparator: ComparatorConfig, leftBound: number, rightBound: number, windowLeft: number, windowRight: number): void;
}
declare class HeapSnapshotNodesProvider extends HeapSnapshotItemProvider {
    snapshot: HeapSnapshot;
    constructor(snapshot: HeapSnapshot, nodeIndexes: number[] | Uint32Array);
    nodePosition(snapshotObjectId: number): number;
    private buildCompareFunction;
    sort(comparator: ComparatorConfig, leftBound: number, rightBound: number, windowLeft: number, windowRight: number): void;
}
declare class JSHeapSnapshot extends HeapSnapshot {
    #private;
    readonly nodeFlags: {
        canBeQueried: number;
        detachedDOMTreeNode: number;
        pageObject: number;
    };
    private flags;
    constructor(profile: Profile, progress: HeapSnapshotProgress);
    createNode(nodeIndex?: number): JSHeapSnapshotNode;
    createEdge(edgeIndex: number): JSHeapSnapshotEdge;
    createRetainingEdge(retainerIndex: number): JSHeapSnapshotRetainerEdge;
    containmentEdgesFilter(): (arg0: HeapSnapshotEdge) => boolean;
    retainingEdgesFilter(): (arg0: HeapSnapshotEdge) => boolean;
    calculateFlags(): void;
    calculateShallowSizes(): void;
    calculateDistances(isForRetainersView: boolean): void;
    isUserRoot(node: HeapSnapshotNode): boolean;
    userObjectsMapAndFlag(): {
        map: Uint8Array;
        flag: number;
    } | null;
    flagsOfNode(node: HeapSnapshotNode): number;
    private markDetachedDOMTreeNodes;
    private markQueriableHeapObjects;
    private markPageOwnedNodes;
    calculateStatistics(): void;
    private calculateArraySize;
    getStatistics(): Statistics;
}
declare class JSHeapSnapshotNode extends HeapSnapshotNode {
    #private;
    constructor(snapshot: JSHeapSnapshot, nodeIndex?: number);
    canBeQueried(): boolean;
    name(): string;
    private consStringName;
    static formatPropertyName(name: string): string;
    id(): number;
    isHidden(): boolean;
    isArray(): boolean;
    isSynthetic(): boolean;
    isNative(): boolean;
    isUserRoot(): boolean;
    isDocumentDOMTreesRoot(): boolean;
    serialize(): Node;
}
declare class JSHeapSnapshotEdge extends HeapSnapshotEdge {
    constructor(snapshot: JSHeapSnapshot, edgeIndex?: number);
    clone(): JSHeapSnapshotEdge;
    hasStringName(): boolean;
    isElement(): boolean;
    isHidden(): boolean;
    isWeak(): boolean;
    isInternal(): boolean;
    isInvisible(): boolean;
    isShortcut(): boolean;
    name(): string;
    toString(): string;
    private hasStringNameInternal;
    private nameInternal;
    private nameOrIndex;
    rawType(): number;
    nameIndex(): number;
}
declare class JSHeapSnapshotRetainerEdge extends HeapSnapshotRetainerEdge {
    constructor(snapshot: JSHeapSnapshot, retainerIndex: number);
    clone(): JSHeapSnapshotRetainerEdge;
    isHidden(): boolean;
    isInvisible(): boolean;
    isShortcut(): boolean;
    isWeak(): boolean;
}
interface AggregatedInfo {
    count: number;
    distance: number;
    self: number;
    maxRet: number;
    name: string;
    idxs: number[];
}

interface ParseHeapSnapshotOptions {
    /**
     * Whether to suppress console output.
     *
     * @default true
     */
    silent?: boolean;
}
declare function parseHeapSnapshot(data: Readable, opts?: ParseHeapSnapshotOptions): Promise<JSHeapSnapshot>;

export { type AggregatedInfo, HeapSnapshot, HeapSnapshotEdge, HeapSnapshotEdgeIndexProvider, HeapSnapshotEdgeIterator, HeapSnapshotEdgesProvider, HeapSnapshotFilteredIterator, type HeapSnapshotHeader, HeapSnapshotIndexRangeIterator, type HeapSnapshotItem, type HeapSnapshotItemIndexProvider, type HeapSnapshotItemIterator, HeapSnapshotItemProvider, HeapSnapshotNode, HeapSnapshotNodeIndexProvider, HeapSnapshotNodeIterator, HeapSnapshotNodesProvider, HeapSnapshotProgress, HeapSnapshotRetainerEdge, HeapSnapshotRetainerEdgeIndexProvider, HeapSnapshotRetainerEdgeIterator, JSHeapSnapshot, JSHeapSnapshotEdge, JSHeapSnapshotNode, JSHeapSnapshotRetainerEdge, type LiveObjects, type ParseHeapSnapshotOptions, type Profile, SecondaryInitManager, parseHeapSnapshot, serializeUIString };
