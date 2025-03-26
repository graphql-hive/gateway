import fs from 'fs/promises';
import { HeapProfiler } from 'inspector';
import path from 'path';
import { HeapSnapshotProgress, JSHeapSnapshot } from '@internal/heapsnapshot';
import { CallTreeNode, Frame } from 'speedscope/profile';
import { importFromChromeHeapProfile } from 'speedscope/profile/v8heapalloc';
import { HeapSnapshotLoader } from '../../heapsnapshot/src/HeapSnapshotLoader';

const __project = path.resolve(__dirname, '..', '..', '..') + path.sep;

export async function compareHeapSnapshotFiles(snapshotFiles: string[]) {
  const profiles = await Promise.all(
    snapshotFiles.map((file) =>
      fs.readFile(file, 'utf8').then((c) => JSON.parse(c)),
    ),
  );

  class Progress implements HeapSnapshotProgress {
    reportProblem(error: string): void {
      console.error(error);
    }
    updateProgress(title: string, value: number, total: number): void {
      console.log(title, value, total);
    }
    updateStatus(status: string): void {
      console.log(status);
    }
  }

  const loader = new HeapSnapshotLoader(null as any);
  loader.write(JSON.stringify(profiles[0]));
  loader.close();

  const worker = new Worker('////');
  const chan = new MessageChannel();

  worker.postMessage(
    {
      disposition: 'setupForSecondaryInit',
      objectId: 0,
    },
    [chan.port2],
  );

  const snap = await loader.buildSnapshot(chan.port1);

  const snaps: JSHeapSnapshot[] = [];
  for (const profile of profiles) {
    snaps.push(new JSHeapSnapshot(profile, new Progress()));
  }

  let baseSnap = snaps.pop()!;
  while (baseSnap) {
    const snap = snaps.pop();
    if (!snap) {
      break; // last snap
    }

    const defs = snap.interfaceDefinitions();
    const aggregates = baseSnap.aggregatesForDiff(defs);

    const diffs = snap.calculateSnapshotDiff('', aggregates);
    for (const [constructor, diff] of Object.entries(diffs)) {
      console.log({ constructor, diff });
    }
  }
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
    let file: string | null = null;
    const fileProjectRelative = frame.file?.split(__project)[1];
    if (fileProjectRelative) {
      file = fileProjectRelative;
    } else {
      // must not always be relative to the project, like with node internals
      file = frame.file || null;
    }
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
