import { createReadStream } from 'fs';
import { parseHeapSnapshot } from '@internal/heapsnapshot';

export interface HeapSnapshotDiff {
  [ctor: string]: {
    ctor: string;
    addedCount: number;
    removedCount: number;
    addedSize: number;
    removedSize: number;
    countDelta: number;
    sizeDelta: number;
  };
}

/**
 * Diffs the provided v8 JavaScript heap snapshot files (`*.heapsnapshot`)
 * consecutively, returning a total of the differences by summing up the deltas
 * of each snapshot compared to the previous one starting from the first one.
 */
export async function diffHeapSnapshotFiles(
  files: string[],
): Promise<HeapSnapshotDiff> {
  if (files.length < 2) {
    throw new Error(
      'At least two heap snapshot files are required for comparison.',
    );
  }
  const snapshotFiles = [...files];

  const totalDiff: HeapSnapshotDiff = {};

  let baseSnap = await parseHeapSnapshot(
    createReadStream(snapshotFiles.shift()!),
  );
  while (baseSnap) {
    const snapshotFile = snapshotFiles.shift()!;
    if (!snapshotFile) {
      break; // no more profiles to compare
    }

    const snap = await parseHeapSnapshot(createReadStream(snapshotFile));

    const defs = snap.interfaceDefinitions();
    const aggregates = baseSnap.aggregatesForDiff(defs);
    const snapshotDiff = snap.calculateSnapshotDiff('', aggregates);

    for (const diff of Object.values(snapshotDiff)) {
      const totalDiffForCtor = (totalDiff[diff.name] ||= {
        ctor: diff.name,
        addedCount: 0,
        removedCount: 0,
        addedSize: 0,
        removedSize: 0,
        countDelta: 0,
        sizeDelta: 0,
      });
      totalDiffForCtor.addedCount += diff.addedCount;
      totalDiffForCtor.removedCount += diff.removedCount;
      totalDiffForCtor.addedSize += diff.addedSize;
      totalDiffForCtor.removedSize += diff.removedSize;
      totalDiffForCtor.countDelta += diff.countDelta;
      totalDiffForCtor.sizeDelta += diff.sizeDelta;
    }

    baseSnap = snap;
  }

  return totalDiff;
}

/**
 * Diffs the provided v8 JavaScript heap snapshot files (`*.heapsnapshot`)
 * using {@link diffHeapSnapshotFiles} and filters the results to only include
 * objects that have a positive delta in both count and size, **possibly** indicating
 * a leak. Note that this is a heuristic and may not always indicate a leak, some objects
 * may legitimately grow in size or count over time.
 */
export async function leakingObjectsInHeapSnapshotFiles(
  snapshotFiles: string[],
): Promise<HeapSnapshotDiff> {
  const diff = await diffHeapSnapshotFiles(snapshotFiles);

  const leakingDiff: HeapSnapshotDiff = {};
  for (const object of Object.values(diff)) {
    if (
      // size just kept growing
      object.sizeDelta > 0 &&
      // count just kept growing (10 retained objects is ok, it's probably javascript things)
      // TODO: is this really the case? can there be a super subtle leak? (our loadtests run long so this is unlikely atm)
      object.countDelta > 10
    ) {
      leakingDiff[object.ctor] = object;
    }
  }

  return leakingDiff;
}

/** Converts the provided bytes size to human-readable format (kB, MB, GB). Uses the SI prefix. */
export function bytesToHuman(size: number) {
  if (size < 1_000) {
    return `${size}B`;
  } else if (size < 1_000_000) {
    return `${(size / 1_000).toFixed(2)}kB`;
  } else if (size < 1_000_000_000) {
    return `${(size / 1_000_000).toFixed(2)}MB`;
  }
  return `${(size / 1_000_000_000).toFixed(2)}GB`;
}
