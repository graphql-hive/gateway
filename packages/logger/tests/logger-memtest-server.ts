import { createServer } from 'node:http';
import { Logger } from '../src/logger';

const syncLogger = new Logger({
  level: 'debug',
  writers: [
    {
      write: () => {
        // noop
      },
    },
  ],
});

const asyncLogger = new Logger({
  level: 'debug',
  writers: [
    {
      // Simulate async I/O with minimal delay
      write: () => new Promise((resolve) => setImmediate(resolve)),
    },
  ],
});

// Large object for attribute testing
const largeObject = {
  data: new Array(100).fill(null).map((_, j) => ({
    index: j,
    value: `data-value-${j}`,
    nested: {
      level1: { level2: { level3: `nested-${j}` } },
    },
  })),
};

// Circular reference object
const circularObj: any = { id: 1, data: 'test' };
circularObj.self = circularObj;
circularObj.nested = { parent: circularObj };

const server = createServer((req, res) => {
  try {
    const parts = req.url?.split('/') || [];
    const name = parts[parts.length - 1];
    switch (name) {
      case 'sync-logging':
        // High-volume synchronous logging
        syncLogger.info(
          { iteration: Date.now(), data: 'test data' },
          'Sync message',
        );
        break;

      case 'async-logging':
        // Async logging with I/O simulation
        asyncLogger.info(
          { iteration: Date.now(), data: 'test data' },
          'Async message',
        );
        break;

      case 'child-loggers': {
        // Create child loggers
        const child1 = syncLogger.child({ parent: 'root' }, 'child1 ');
        const child2 = child1.child({ parent: 'child1' }, 'child2 ');
        child2.info('Deep child message');
        break;
      }

      case 'child-loggers-large': {
        // Create child loggers
        const child1 = syncLogger.child(
          { parent: 'root', l1: largeObject },
          'child1 ',
        );
        const child2 = child1.child(
          { parent: 'child1', l2: largeObject },
          'child2 ',
        );
        child2.info(largeObject, 'Large object message');
        break;
      }

      case 'large-attributes':
        // Log large attribute objects
        syncLogger.info(largeObject, 'Large object message');
        break;

      case 'circular-refs':
        // Log circular references
        syncLogger.info(circularObj, 'Circular message');
        break;

      case 'lazy-attributes':
        // Log with lazy attributes
        syncLogger.info(
          () => ({
            id: Date.now(),
            data: new Array(10).fill(null).map((_, j) => `item-${j}`),
            timestamp: Date.now(),
          }),
          'Lazy message',
        );
        break;

      case 'mixed-levels':
        // Log at different levels
        syncLogger.trace('Trace message');
        syncLogger.debug('Debug message');
        syncLogger.info('Info message');
        syncLogger.warn('Warn message');
        syncLogger.error('Error message');
        break;

      case 'level-changes':
        // Change log levels
        syncLogger.setLevel('debug');
        syncLogger.debug('Debug enabled');
        syncLogger.setLevel('info');
        syncLogger.info('Back to info');
        break;

      default:
        res.writeHead(404).end();
        return;
    }
    res.writeHead(200).end();
  } catch (err) {
    res.writeHead(500).end((err as Error).stack);
  }
});

server.listen(parseInt(process.env['PORT']!));
