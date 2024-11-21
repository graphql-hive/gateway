// we test the leak detector because we patched jest-leak-detector
import LeakDetector from 'jest-leak-detector';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.env.LEAK_TEST)('Leak Detector', () => {
  it('should detect simple leak', async () => {
    let obj: any = {};

    const detector = new LeakDetector(obj);

    await expect(detector.isLeaking()).resolves.toBeTruthy();

    obj = null;

    await expect(detector.isLeaking()).resolves.toBeFalsy();
  });

  it('should detect complex leak', async () => {
    let obj1: any = {};
    let obj2: any = {};

    obj1.obj2 = obj2;
    obj2.obj1 = obj1;

    const detector1 = new LeakDetector(obj1);
    const detector2 = new LeakDetector(obj2);

    await expect(detector1.isLeaking()).resolves.toBeTruthy();
    await expect(detector2.isLeaking()).resolves.toBeTruthy();

    obj1 = null;

    // both leaking because obj2 still referencing obj1
    await expect(detector1.isLeaking()).resolves.toBeTruthy();
    await expect(detector2.isLeaking()).resolves.toBeTruthy();

    obj2 = null;

    await expect(detector1.isLeaking()).resolves.toBeFalsy();
    await expect(detector2.isLeaking()).resolves.toBeFalsy();
  });

  it('should detect no leak', async () => {
    let obj: {} | null = {};

    const detector = new LeakDetector(obj);
    obj = null;

    await expect(detector.isLeaking()).resolves.toBeFalsy();
  });
});
