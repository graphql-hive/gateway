import { HeapProfiler } from 'inspector';
import path from 'path';
import { serializer } from '@memlab/core';
import { getFullHeapFromFile, PluginUtils } from '@memlab/heap-analysis';
import { CallTreeNode, Frame } from 'speedscope/profile';
import { importFromChromeHeapProfile } from 'speedscope/profile/v8heapalloc';

const __project = path.resolve(__dirname, '..', '..', '..') + path.sep;

/**
 * Analyses the {@link file heap snapshot file} logging the largest single objects and summed objects.
 *
 * TODO: Leak detection and return something.
 * TODO: innacurate when comparing results to chrome devtools
 */
export async function analyzeHeapSnapshot(file: string) {
  const snap = await getFullHeapFromFile(file);

  // these are largest _single_ objects in the heap
  const largestSingleObjects = PluginUtils.filterOutLargestObjects(
    snap,
    PluginUtils.isNodeWorthInspecting,
    5,
  );
  console.group('Largest single objects');
  for (const node of largestSingleObjects) {
    console.group(`(${node.type}) ${node.name}`.trim());

    console.log('self size', (node.self_size / 1024).toFixed(2), 'kB');
    console.log(
      'retained size',
      (node.retainedSize / (1024 * 1024)).toFixed(2),
      'MB',
    );

    console.groupEnd();
  }
  console.groupEnd();

  //

  // a summed node is a node whose sizes are summed up for all instances of that node
  type SummedObject = {
    type: string;
    name: string;
    selfSize: number;
    retainedSize: number;
  };

  const summedObjects: {
    [key: string]: SummedObject;
  } = {};

  snap.nodes.forEach((node) => {
    if (!PluginUtils.isNodeWorthInspecting(node)) {
      // we only care about nodes we have control over, like objects and strings
      return;
    }

    const key = serializer.summarizeNodeShape(node);

    if (summedObjects[key]) {
      summedObjects[key].selfSize += node.self_size;
      summedObjects[key].retainedSize += node.retainedSize;
    } else {
      summedObjects[key] = {
        type: node.type,
        name: node.name,
        selfSize: node.self_size,
        retainedSize: node.retainedSize,
      };
    }
  });

  const largestSummedObjects: SummedObject[] = [];

  for (const object of Object.values(summedObjects)) {
    // only the top 10 nodes with the highest retained size
    largestSummedObjects.push(object);
    largestSummedObjects.sort((n1, n2) => n2.retainedSize - n1.retainedSize);
    if (largestSummedObjects.length > 10) {
      largestSummedObjects.pop();
    }
  }

  console.group('Largest summed objects');
  for (const node of largestSummedObjects) {
    console.group(`(${node.type}) ${node.name}`.trim());

    console.log('self size', (node.selfSize / (1024 * 1024)).toFixed(2), 'MB');
    console.log(
      'retained size',
      (node.retainedSize / (1024 * 1024)).toFixed(2),
      'MB',
    );

    console.groupEnd();
  }
  console.groupEnd();
}

export interface HeapSamplingProfileNode {
  name: string;
  /**
   * The project relative path to the file with the node.
   * Optionally suffixed with a line number if available.
   */
  file: string | null;
  /** The size in memory the frame itself allocated in bytes. */
  selfSize: number;
  /** {@link selfSize Self size} in MBs. */
  selfSizeInMB: number;
  /** The size in memory the frame and its callees allocated in bytes. */
  totalSize: number;
  /** {@link totalSize Total size} in MBs. */
  totalSizeInMB: number;
}

export interface HeapSamplingProfileFrame extends HeapSamplingProfileNode {
  /**
   * Callstack of heaviest frames ordered from the leaf (this frame) to the root.
   * The leaf node is not included.
   */
  callstack: HeapSamplingProfileNode[];
}

/**
 * Analyses the {@link v8Profile v8 heap sampling profile}.
 *
 * @param v8Profile - The v8 heap sampling profile.
 * @param threshold - The exclusive threshold of {@link HeapSamplingProfileNode.selfSize node's self size} usage of the whole memory that's considered heavy. Defaults to `0.05` (5%).
 *
 * @returns The heaviest leaf frames.
 */
export function getHeaviestFramesFromHeapSamplingProfile(
  v8Profile: HeapProfiler.SamplingHeapProfile,
  threshold = 0.05,
): HeapSamplingProfileFrame[] {
  const profile = importFromChromeHeapProfile(
    // @ts-expect-error is ok, speedscope will add the id and totalSize properties
    v8Profile,
  );

  // frames that on their own have allocated a lot of memory out of all memory
  const totalSize = profile.getTotalNonIdleWeight();
  const highSelfSizeFrames: Frame[] = [];
  profile.forEachFrame((frame) => {
    const selfPerc = frame.getSelfWeight() / totalSize;
    if (selfPerc > threshold) {
      highSelfSizeFrames.push(frame);
    }
  });
  highSelfSizeFrames.sort((a, b) => b.getSelfWeight() - a.getSelfWeight());

  const heaviestFrames: HeapSamplingProfileFrame[] = [];

  function toHeapSamplingProfileNode(frame: Frame): HeapSamplingProfileNode {
    let file = frame.file?.split(__project)[1] || null;
    if (file && frame.line) {
      file += `:${frame.line + 1}`; // we increment because the line is weirdly off by one
    }
    return {
      name: frame.name,
      // we split then take the first element to remove the project path even if it has file:/// prefix
      file,
      selfSize: frame.getSelfWeight(),
      selfSizeInMB: Number((frame.getSelfWeight() / (1024 * 1024)).toFixed(2)),
      totalSize: frame.getTotalWeight(),
      totalSizeInMB: Number(
        (frame.getTotalWeight() / (1024 * 1024)).toFixed(2),
      ),
    };
  }

  for (const frame of highSelfSizeFrames) {
    // get the callers of this frame (this frame is the leaf node)
    const callers = profile.getInvertedProfileForCallersOf(frame);

    // "grouped" call tree is one in which each node has at most one child per
    // frame. nodes are ordered in decreasing order of weight
    const calltree = callers.getGroupedCalltreeRoot();

    // the call stack with the biggest size from the root to the leaf node (this frame)
    const biggestWeightStack: Frame[] = [];
    let node: CallTreeNode | undefined =
      // we want to omit this frame from the callstack, so we take the first child of first child
      calltree.children[0]?.children[0];
    while (node) {
      biggestWeightStack.push(node.frame);
      node = node.children[0];
    }

    heaviestFrames.push({
      ...toHeapSamplingProfileNode(frame),
      callstack: biggestWeightStack.map(toHeapSamplingProfileNode),
    });
  }

  return heaviestFrames;
}
