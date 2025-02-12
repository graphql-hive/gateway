// eslint-disable-next-line import/no-nodejs-modules
import { Console } from 'node:console';
import { JSONLogger } from '@graphql-hive/logger-json';
import { process } from '@graphql-mesh/cross-helpers';
import { LogLevel } from '@graphql-mesh/utils';
import pinoPretty from 'pino-pretty';

export function getDefaultLogger(opts?: { name?: string; level?: LogLevel }) {
  const logFormat = process.env['LOG_FORMAT'] || (globalThis as any).LOG_FORMAT;
  if (logFormat) {
    if (logFormat.toLowerCase() === 'json') {
      return new JSONLogger(opts);
    } else if (logFormat.toLowerCase() === 'pretty') {
      return createPrettyLogger(opts);
    }
  }
  const nodeEnv = process.env['NODE_ENV'] || (globalThis as any).NODE_ENV;
  if (nodeEnv === 'production') {
    return new JSONLogger(opts);
  }
  return createPrettyLogger(opts);
}

function createPrettyLogger(opts?: { name?: string; level?: LogLevel }) {
  const stdOut = pinoPretty({
    levelFirst: true,
    colorize: true,
    destination: process.stdout,
  });
  const stdErr = pinoPretty({
    levelFirst: true,
    colorize: true,
    destination: process.stdout,
  });
  return new JSONLogger({
    ...opts,
    console: new Console(stdOut, stdErr),
  });
}
