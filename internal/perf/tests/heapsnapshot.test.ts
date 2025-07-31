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
        "addedCount": 31530,
        "addedSize": 3536040,
        "countDelta": 274,
        "ctor": "(compiled code)",
        "removedCount": 31256,
        "removedSize": 3429480,
        "sizeDelta": 106560,
      },
      "Array": {
        "addedCount": 636,
        "addedSize": 20672,
        "countDelta": 36,
        "ctor": "Array",
        "removedCount": 600,
        "removedSize": 19520,
        "sizeDelta": 1152,
      },
      "HTTPParser": {
        "addedCount": 314,
        "addedSize": 97968,
        "countDelta": 36,
        "ctor": "HTTPParser",
        "removedCount": 278,
        "removedSize": 86736,
        "sizeDelta": 11232,
      },
    }
  `);
});
