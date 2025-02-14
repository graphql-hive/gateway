import HeapParser from '@memlab/core/HeapParser';

export async function parseHeap(file: string) {
  await HeapParser.parse(file);
  // TODO: implement and use
}
