import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import * as winston from 'winston';
import { createLoggerFromWinston } from '../src';

describe('Winston', () => {
  let log = '';
  let lastCallback = () => {};
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      log = chunk.toString('utf-8');
      lastCallback = callback;
    },
  });
  const logLevels = ['error', 'warn', 'info', 'debug'] as const;
  for (const level of logLevels) {
    describe(`Level: ${level}`, () => {
      it('basic', () => {
        const logger = winston.createLogger({
          level,
          format: winston.format.json(),
          transports: [
            new winston.transports.Stream({
              stream,
            }),
          ],
        });
        using loggerAdapter = createLoggerFromWinston(logger);
        const testData = [
          'Hello',
          ['World'],
          { foo: 'bar' },
          42,
          true,
          null,
          undefined,
          () => 'Expensive',
        ];
        loggerAdapter[level](...testData);
        lastCallback();
        const logJson = JSON.parse(log);
        expect(logJson).toEqual({
          level,
          foo: 'bar',
          message: 'Hello, World, 42, true, Expensive',
        });
      });
      it('child', () => {
        const logger = winston.createLogger({
          level,
          format: winston.format.json(),
          transports: [
            new winston.transports.Stream({
              stream,
            }),
          ],
        });
        const loggerAdapter = createLoggerFromWinston(logger);
        const testData = [
          'Hello',
          ['World'],
          { foo: 'bar' },
          42,
          true,
          null,
          undefined,
          () => 'Expensive',
        ];
        const childLogger = loggerAdapter.child('child');
        childLogger[level](...testData);
        lastCallback();
        const logJson = JSON.parse(log);
        expect(logJson).toEqual({
          level,
          foo: 'bar',
          message: 'Hello, World, 42, true, Expensive',
          name: 'child',
        });
      });
      it('deduplicate names', () => {
        const logger = winston.createLogger({
          level,
          format: winston.format.json(),
          transports: [
            new winston.transports.Stream({
              stream,
            }),
          ],
        });
        const loggerAdapter = createLoggerFromWinston(logger);
        const testData = [
          'Hello',
          ['World'],
          { foo: 'bar' },
          42,
          true,
          null,
          undefined,
          () => 'Expensive',
        ];
        const childLogger = loggerAdapter.child('child').child('child');
        childLogger[level](...testData);
        lastCallback();
        const logJson = JSON.parse(log);
        expect(logJson).toEqual({
          level,
          foo: 'bar',
          message: 'Hello, World, 42, true, Expensive',
          name: 'child',
        });
      });
      it('nested', () => {
        const logger = winston.createLogger({
          level,
          format: winston.format.json(),
          transports: [
            new winston.transports.Stream({
              stream,
            }),
          ],
        });
        const loggerAdapter = createLoggerFromWinston(logger);
        const testData = [
          'Hello',
          ['World'],
          { foo: 'bar' },
          42,
          true,
          null,
          undefined,
          () => 'Expensive',
        ];
        const childLogger = loggerAdapter.child('child');
        const nestedLogger = childLogger.child('nested');
        nestedLogger[level](...testData);
        lastCallback();
        const logJson = JSON.parse(log);
        expect(logJson).toEqual({
          level,
          foo: 'bar',
          message: 'Hello, World, 42, true, Expensive',
          name: 'child, nested',
        });
      });
    });
  }
});
