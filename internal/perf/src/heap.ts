import { HeapProfiler } from 'inspector';
import { serializer } from '@memlab/core';
import { getFullHeapFromFile, PluginUtils } from '@memlab/heap-analysis';
import { CallTreeNode, Frame } from 'speedscope/profile';
import { importFromChromeHeapProfile } from 'speedscope/profile/v8heapalloc';

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
  /** Callstack of heaviest frames ordered from root the leaf (this frame). */
  callstack: HeapSamplingProfileNode[];
}

/**
 * Analyses the {@link v8Profile v8 heap sampling profile}.
 *
 * @returns The heaviest leaf frames.
 */
export function analyzeHeapSamplingProfile(
  v8Profile: HeapProfiler.SamplingHeapProfile,
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
    if (selfPerc > 0.1) {
      // self sizes taking up higher than 10% of the whole profile are considered big
      highSelfSizeFrames.push(frame);
    }
  });
  highSelfSizeFrames.sort((a, b) => b.getSelfWeight() - a.getSelfWeight());

  const heaviestFrames: HeapSamplingProfileFrame[] = [];

  for (const frame of highSelfSizeFrames) {
    // get the callers of this frame (this frame is the leaf node)
    const callers = profile.getInvertedProfileForCallersOf(frame);

    // "grouped" call tree is one in which each node has at most one child per
    // frame. nodes are ordered in decreasing order of weight
    const calltree = callers.getGroupedCalltreeRoot();

    // the call stack with the biggest size from the root to the leaf node (this frame)
    const biggestWeightStack: Frame[] = [];
    let node: CallTreeNode | undefined = calltree.children[0];
    while (node) {
      biggestWeightStack.push(node.frame);
      node = node.children[0];
    }
    biggestWeightStack.reverse();

    heaviestFrames.push({
      name: frame.name,
      file: frame.file || null,
      selfSize: frame.getSelfWeight(),
      selfSizeInMB: Number((frame.getSelfWeight() / (1024 * 1024)).toFixed(2)),
      totalSize: frame.getTotalWeight(),
      totalSizeInMB: Number(
        (frame.getTotalWeight() / (1024 * 1024)).toFixed(2),
      ),
      callstack: biggestWeightStack.map((frame) => ({
        name: frame.name,
        file: frame.file || null,
        selfSize: frame.getSelfWeight(),
        selfSizeInMB: Number(
          (frame.getSelfWeight() / (1024 * 1024)).toFixed(2),
        ),
        totalSize: frame.getTotalWeight(),
        totalSizeInMB: Number(
          (frame.getTotalWeight() / (1024 * 1024)).toFixed(2),
        ),
      })),
    });
  }

  return heaviestFrames;
}
