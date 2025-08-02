import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from '@internal/proc';
import { expect, it } from 'vitest';
import { leakingObjectsInHeapSnapshotFiles } from '../src/heapsnapshot';

const __fixtures = path.resolve(__dirname, '__fixtures__');

it.skipIf(
  // no need to test in bun (also, bun does not support increasing timeouts per test)
  globalThis.Bun,
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
          "addedCount": 24267,
          "addedSize": 4981944,
          "countDelta": -19747,
          "name": "(compiled code)",
          "removedCount": 44014,
          "removedSize": 2541944,
          "sizeDelta": 2440000,
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
