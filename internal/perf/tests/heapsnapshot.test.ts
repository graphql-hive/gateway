import path from 'node:path';
import { expect, it } from 'vitest';
import { leakingObjectsInHeapSnapshotFiles } from '../src/heapsnapshot';

const __fixtures = path.resolve(__dirname, '__fixtures__');

it('should correctly calculate the leaking objects', async () => {
  await expect(
    leakingObjectsInHeapSnapshotFiles([
      path.join(__fixtures, 'http-server-under-load', '1.heapsnapshot'),
      path.join(__fixtures, 'http-server-under-load', '2.heapsnapshot'),
      path.join(__fixtures, 'http-server-under-load', '3.heapsnapshot'),
      path.join(__fixtures, 'http-server-under-load', '4.heapsnapshot'),
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
});
