import fs from 'fs/promises';
import { parseHeapSnapshot } from '@internal/heapsnapshot';

export interface Diff {
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

export async function diffHeapSnapshotFiles(
  snapshotFiles: string[],
): Promise<Diff> {
  if (snapshotFiles.length < 2) {
    throw new Error(
      'At least two heap snapshot files are required for comparison.',
    );
  }

  const profiles = await Promise.all(
    snapshotFiles.map((file) => fs.readFile(file, 'utf8')),
  );

  const totalDiff: Diff = {};

  let baseSnap = await parseHeapSnapshot(profiles.shift()!);
  while (baseSnap) {
    const comparedProfile = profiles.shift()!;
    if (!comparedProfile) {
      break; // no more profiles to compare
    }

    const snap = await parseHeapSnapshot(comparedProfile);

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

export async function leakingObjectsInHeapSnapshotFiles(
  snapshotFiles: string[],
): Promise<Diff> {
  const diff = await diffHeapSnapshotFiles(snapshotFiles);

  const leakingDiff: Diff = {};
  for (const object of Object.values(diff)) {
    if (object.countDelta > 0 && object.sizeDelta > 0) {
      leakingDiff[object.ctor] = object;
    }
  }

  return leakingDiff;
}
