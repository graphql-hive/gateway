import { createReadStream } from 'fs';
import { Diff, parseHeapSnapshot } from '@internal/heapsnapshot';

export interface HeapSnapshotDiff {
  [ctor: string]: Omit<Diff, 'addedIndexes' | 'deletedIndexes'>;
}

/**
 * Diffs the provided v8 JavaScript {@link files heap snapshot files}
 * consecutively and filters the results to only include objects that have a positive
 * delta in both count and size in **every** snapshot, possibly indicating a leak.
 *
 * Note that this is a heuristic and may not always indicate a leak, some objects may
 * legitimately grow in size or count over time.
 */
export async function leakingObjectsInHeapSnapshotFiles(
  files: string[],
): Promise<HeapSnapshotDiff> {
  if (files.length < 3) {
    throw new Error(
      'At least three heap snapshot files are required for leak detection.',
    );
  }
  const snapshotFiles = [...files];

  const totalGrowingDiff: HeapSnapshotDiff = {};

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

    const growingDiff: HeapSnapshotDiff = {};
    for (const { addedIndexes, deletedIndexes, ...diff } of Object.values(
      snapshotDiff,
    )) {
      if (
        // size just kept growing
        diff.sizeDelta > 0 &&
        // count just kept growing
        diff.countDelta > 0
      ) {
        growingDiff[diff.name] = diff;
      }
    }

    if (!Object.keys(totalGrowingDiff).length) {
      // this is the first snapshot, so we just take the diff as is
      Object.assign(totalGrowingDiff, growingDiff);
      continue;
    }

    for (const diff of Object.values(growingDiff)) {
      const totalGrowingDiffForName = totalGrowingDiff[diff.name];
      if (!totalGrowingDiffForName) {
        // didnt grow in the previous snapshot, so we skip it
        continue;
      }

      totalGrowingDiffForName.addedCount += diff.addedCount;
      totalGrowingDiffForName.removedCount += diff.removedCount;
      totalGrowingDiffForName.addedSize += diff.addedSize;
      totalGrowingDiffForName.removedSize += diff.removedSize;
      totalGrowingDiffForName.countDelta += diff.countDelta;
      totalGrowingDiffForName.sizeDelta += diff.sizeDelta;
    }

    // remove everything that the total has but not in the current index, means the thing didnt grow
    for (const totalDiffName of Object.keys(totalGrowingDiff)) {
      if (!growingDiff[totalDiffName]) {
        delete totalGrowingDiff[totalDiffName];
      }
    }

    baseSnap = snap;
  }

  return totalGrowingDiff;
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
