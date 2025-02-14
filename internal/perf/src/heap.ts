import HeapParser from '@memlab/core/HeapParser';
import { IHeapNode } from '@memlab/core/Types';

export async function analyzeHeapSnapshot(file: string) {
  const heap = await HeapParser.parse(file);

  const biggestNodes: IHeapNode[] = [];

  heap.nodes.forEach((node) => {
    // only the top 5 nodes with the highest retained size
    biggestNodes.push(node);
    biggestNodes.sort((n1, n2) => n2.retainedSize - n1.retainedSize);
    if (biggestNodes.length > 10) {
      biggestNodes.pop();
    }
  });
}
