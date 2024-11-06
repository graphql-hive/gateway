// we test the leak detector because we patched jest-leak-detector
import LeakDetector from 'jest-leak-detector';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.env.LEAK_TEST || globalThis.Bun)(
  'Leak Detector',
  () => {
    it('should detect simple leak', async () => {
      let obj: any = {};

      const detector = new LeakDetector(obj);

      expect(await detector.isLeaking()).toBeTruthy();

      obj = null;

      expect(await detector.isLeaking()).toBeFalsy();
    });

    it('should detect complex leak', async () => {
      let obj1: any = {};
      let obj2: any = {};

      obj1.obj2 = obj2;
      obj2.obj1 = obj1;

      const detector1 = new LeakDetector(obj1);
      const detector2 = new LeakDetector(obj2);

      expect(await detector1.isLeaking()).toBeTruthy();
      expect(await detector2.isLeaking()).toBeTruthy();

      obj1 = null;

      // both leaking because obj2 still referencing obj1
      expect(await detector1.isLeaking()).toBeTruthy();
      expect(await detector2.isLeaking()).toBeTruthy();

      obj2 = null;

      expect(await detector1.isLeaking()).toBeFalsy();
      expect(await detector2.isLeaking()).toBeFalsy();
    });

    it('should detect no leak', async () => {
      let obj: {} | null = {};

      const detector = new LeakDetector(obj);
      obj = null;

      expect(await detector.isLeaking()).toBeFalsy();
    });
  },
);
