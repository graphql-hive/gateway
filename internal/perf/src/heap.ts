import { serializer } from '@memlab/core';
import { getFullHeapFromFile, PluginUtils } from '@memlab/heap-analysis';

export async function analyzeHeapSnapshot(file: string) {
  const snap = await getFullHeapFromFile(file);

  // these are largest _single_ objects in the heap
  const largestSingleObjects = PluginUtils.filterOutLargestObjects(
    snap,
    PluginUtils.isNodeWorthInspecting,
    5,
  );
  console.group('Largest single objects');
  for (const node of largestSingleObjects) {
    console.group(`(${node.type}) ${node.name}`.trim());

    console.log('self size', (node.self_size / 1024).toFixed(2), 'kB');
    console.log(
      'retained size',
      (node.retainedSize / (1024 * 1024)).toFixed(2),
      'MB',
    );

    console.groupEnd();
  }
  console.groupEnd();

  //

  // a summed node is a node whose sizes are summed up for all instances of that node
  type SummedObject = {
    type: string;
    name: string;
    selfSize: number;
    retainedSize: number;
  };

  const summedObjects: {
    [key: string]: SummedObject;
  } = {};

  snap.nodes.forEach((node) => {
    if (!PluginUtils.isNodeWorthInspecting(node)) {
      // we only care about nodes we have control over, like objects and strings
      return;
    }

    const key = serializer.summarizeNodeShape(node);

    if (summedObjects[key]) {
      summedObjects[key].selfSize += node.self_size;
      summedObjects[key].retainedSize += node.retainedSize;
    } else {
      summedObjects[key] = {
        type: node.type,
        name: node.name,
        selfSize: node.self_size,
        retainedSize: node.retainedSize,
      };
    }
  });

  const largestSummedObjects: SummedObject[] = [];

  for (const object of Object.values(summedObjects)) {
    // only the top 10 nodes with the highest retained size
    largestSummedObjects.push(object);
    largestSummedObjects.sort((n1, n2) => n2.retainedSize - n1.retainedSize);
    if (largestSummedObjects.length > 10) {
      largestSummedObjects.pop();
    }
  }

  console.group('Largest summed objects');
  for (const node of largestSummedObjects) {
    console.group(`(${node.type}) ${node.name}`.trim());

    console.log('self size', (node.selfSize / (1024 * 1024)).toFixed(2), 'MB');
    console.log(
      'retained size',
      (node.retainedSize / (1024 * 1024)).toFixed(2),
      'MB',
    );

    console.groupEnd();
  }
  console.groupEnd();
}
