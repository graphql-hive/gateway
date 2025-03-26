import { hostname } from 'node:os';
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createLoggerFromPino } from '../src';

describe('Pino', () => {
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
      it('basic', async () => {
        const logger = pino(
          {
            level,
          },
          stream,
        );
        const loggerAdapter = createLoggerFromPino(logger);
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
          level: pino.levels.values[level],
          foo: 'bar',
          msg: 'Hello, World, 42, true, Expensive',
          pid: process.pid,
          time: expect.any(Number),
          hostname: hostname(),
        });
      });
      it('child', async () => {
        const logger = pino(
          {
            level,
          },
          stream,
        );
        const loggerAdapter = createLoggerFromPino(logger);
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
          level: pino.levels.values[level],
          foo: 'bar',
          msg: 'Hello, World, 42, true, Expensive',
          name: 'child',
          pid: process.pid,
          time: expect.any(Number),
          hostname: hostname(),
        });
      });
      it('deduplicate names', async () => {
        const logger = pino(
          {
            level,
          },
          stream,
        );
        const loggerAdapter = createLoggerFromPino(logger);
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
          level: pino.levels.values[level],
          foo: 'bar',
          msg: 'Hello, World, 42, true, Expensive',
          name: 'child',
          pid: process.pid,
          time: expect.any(Number),
          hostname: hostname(),
        });
      });
      it('nested', async () => {
        const logger = pino(
          {
            level,
          },
          stream,
        );
        const loggerAdapter = createLoggerFromPino(logger);
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
          level: pino.levels.values[level],
          foo: 'bar',
          msg: 'Hello, World, 42, true, Expensive',
          name: 'child, nested',
          pid: process.pid,
          time: expect.any(Number),
          hostname: hostname(),
        });
      });
    });
  }
});
