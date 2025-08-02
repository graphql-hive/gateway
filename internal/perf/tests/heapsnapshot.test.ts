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
  'should correctly calculate the leaking objects',
  {
    // parsing snapshots can take a while, so we increase the timeout
    timeout: 30_000,
  },
  async () => {
    await using snap1 = await archivedFixtureFile(
      'http-server-under-load/1.heapsnapshot',
    );
    await using snap2 = await archivedFixtureFile(
      'http-server-under-load/2.heapsnapshot',
    );
    await using snap3 = await archivedFixtureFile(
      'http-server-under-load/3.heapsnapshot',
    );
    await using snap4 = await archivedFixtureFile(
      'http-server-under-load/4.heapsnapshot',
    );
    await expect(
      leakingObjectsInHeapSnapshotFiles([
        snap1.filepath,
        snap2.filepath,
        snap3.filepath,
        snap4.filepath,
      ]),
    ).resolves.toMatchInlineSnapshot(`
      {
        "(compiled code)": {
          "addedCount": 1727,
          "addedSize": 228096,
          "countDelta": 91,
          "name": "(compiled code)",
          "removedCount": 1636,
          "removedSize": 163328,
          "sizeDelta": 64768,
        },
      }
    `);
  },
);

/**
 * Unarchives the {@link archivedFile provided fixture file} for using in
 * tests and then removes it on disposal.
 *
 * @param archivedFile - The name of the archived fixture file (without `.tar.gz`). Is the
 * filename of the file inside the archive.
 */
async function archivedFixtureFile(archivedFile: string) {
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
  return {
    [Symbol.asyncDispose]() {
      return fs.unlink(filepath);
    },
    filepath,
  };
}
