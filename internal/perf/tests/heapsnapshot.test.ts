import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from '@internal/proc';
import { getEnvBool } from '~internal/env';
import { expect, it } from 'vitest';
import { leakingObjectsInHeapSnapshotFiles } from '../src/heapsnapshot';

const __fixtures = path.resolve(__dirname, '__fixtures__');

it.skipIf(
  // no need to test in bun (also, bun does not support increasing timeouts per test)
  globalThis.Bun || getEnvBool('SKIP_HEAP_SNAPSHOT_TESTS'),
)(
  'should correctly calculate no leaking objects',
  {
    // parsing snapshots can take a while, so we increase the timeout
    timeout: 30_000,
  },
  async () => {
    await using snaps = await archivedFixtureFiles([
      'http-server-under-load/1.heapsnapshot',
      'http-server-under-load/2.heapsnapshot',
      'http-server-under-load/3.heapsnapshot',
      'http-server-under-load/4.heapsnapshot',
    ]);
    await expect(leakingObjectsInHeapSnapshotFiles(snaps.filepaths)).resolves
      .toMatchInlineSnapshot(`
      {}
    `);
  },
);

it.skipIf(
  // no need to test in bun (also, bun does not support increasing timeouts per test)
  globalThis.Bun,
)(
  'should correctly detect randomly growing and freeing objects in size',
  {
    // parsing snapshots can take a while, so we increase the timeout
    timeout: 30_000,
  },
  async () => {
    await using snaps = await archivedFixtureFiles([
      'random-grow-and-free/1.heapsnapshot',
      'random-grow-and-free/2.heapsnapshot',
      'random-grow-and-free/3.heapsnapshot',
      'random-grow-and-free/4.heapsnapshot',
      'random-grow-and-free/5.heapsnapshot',
      'random-grow-and-free/6.heapsnapshot',
    ]);
    await expect(leakingObjectsInHeapSnapshotFiles(snaps.filepaths)).resolves
      .toMatchInlineSnapshot(`
      {
        "(compiled code)": {
          "addedCount": 16020,
          "addedSize": 3015968,
          "countDelta": -9728,
          "name": "(compiled code)",
          "removedCount": 25748,
          "removedSize": 1731144,
          "sizeDelta": 1284824,
        },
      }
    `);
  },
);

it.skipIf(
  // no need to test in bun (also, bun does not support increasing timeouts per test)
  globalThis.Bun,
)(
  'should detect a small leak in a forever growing array',
  {
    // parsing snapshots can take a while, so we increase the timeout
    timeout: 30_000,
  },
  async () => {
    await using snaps = await archivedFixtureFiles([
      'small-leak-in-growing-array/1.heapsnapshot',
      'small-leak-in-growing-array/2.heapsnapshot',
      'small-leak-in-growing-array/3.heapsnapshot',
      'small-leak-in-growing-array/4.heapsnapshot',
      'small-leak-in-growing-array/5.heapsnapshot',
      'small-leak-in-growing-array/6.heapsnapshot',
    ]);
    await expect(leakingObjectsInHeapSnapshotFiles(snaps.filepaths)).resolves
      .toMatchInlineSnapshot(`
      {
        "(system)": {
          "addedCount": 47,
          "addedSize": 88040,
          "countDelta": -50,
          "name": "(system)",
          "removedCount": 97,
          "removedSize": 38408,
          "sizeDelta": 49632,
        },
        "{subgraphName}": {
          "addedCount": 60597,
          "addedSize": 1939104,
          "countDelta": 60597,
          "name": "{subgraphName}",
          "removedCount": 0,
          "removedSize": 0,
          "sizeDelta": 1939104,
        },
      }
    `);
  },
);

it.skipIf(
  // no need to test in bun (also, bun does not support increasing timeouts per test)
  globalThis.Bun,
)(
  'should ignore constructors that have zero instance count delta (all released) but positive memory delta (leftover memory)',
  {
    // parsing snapshots can take a while, so we increase the timeout
    timeout: 30_000,
  },
  async () => {
    await using snaps = await archivedFixtureFiles([
      'released-all-instances-but-leftover-memory/1.heapsnapshot',
      'released-all-instances-but-leftover-memory/2.heapsnapshot',
      'released-all-instances-but-leftover-memory/3.heapsnapshot',
      'released-all-instances-but-leftover-memory/4.heapsnapshot',
      'released-all-instances-but-leftover-memory/5.heapsnapshot',
      'released-all-instances-but-leftover-memory/6.heapsnapshot',
    ]);
    await expect(leakingObjectsInHeapSnapshotFiles(snaps.filepaths)).resolves
      .toMatchInlineSnapshot(`
      {
        "(compiled code)": {
          "addedCount": 25287,
          "addedSize": 5208456,
          "countDelta": -8387,
          "name": "(compiled code)",
          "removedCount": 33674,
          "removedSize": 2495560,
          "sizeDelta": 2712896,
        },
        "(system)": {
          "addedCount": 48,
          "addedSize": 85968,
          "countDelta": -55,
          "name": "(system)",
          "removedCount": 103,
          "removedSize": 26312,
          "sizeDelta": 59656,
        },
      }
    `);
  },
);

/**
 * Unarchives the {@link archivedFiles provided fixture files} for using in
 * tests and then removes them on disposal.
 *
 * @param archivedFiles - An array of file names of the archived fixture file (without `.tar.gz`). Is the
 * filename of the file inside the archive.
 */
async function archivedFixtureFiles(archivedFiles: string[]) {
  const filepaths: string[] = [];
  for (const archivedFile of archivedFiles) {
    const filepath = path.join(__fixtures, archivedFile);
    const [, waitForExit] = await spawn(
      {
        cwd: __fixtures,
      },
      'tar',
      '-xz',
      '-f',
      archivedFile + '.tar.gz',
      '-C',
      path.dirname(filepath),
    );
    await waitForExit;
    filepaths.push(filepath);
  }
  return {
    async [Symbol.asyncDispose]() {
      await Promise.all(filepaths.map((filepath) => fs.unlink(filepath)));
    },
    filepaths,
  };
}
