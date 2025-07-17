import cluster, { type Worker } from 'node:cluster';
import type { Logger } from '@graphql-hive/logger';
import { registerTerminateHandler } from '@graphql-mesh/utils';

/**
 * @returns `true` when the process is forked and the current one is the primary cluster; otherwise `false`.
 */
export function handleFork(log: Logger, config: { fork?: number }): boolean {
  try {
    if (cluster.isPrimary && config.fork && config.fork > 1) {
      const workers = new Set<Worker>();
      let expectedToExit = false;
      log.debug(`Forking ${config.fork} workers`);
      for (let i = 0; i < config.fork; i++) {
        const worker = cluster.fork();
        const workerLogger = log.child({ worker: worker.id });
        worker.once('exit', (code, signal) => {
          const logData: Record<string, string | number> = {
            signal,
          };
          if (code != null) {
            logData['code'] = code;
          }
          if (expectedToExit) {
            workerLogger.debug(logData, 'exited');
          } else {
            workerLogger.error(
              logData,
              'Exited unexpectedly. A restart is recommended to ensure the stability of the service',
            );
          }
          workers.delete(worker);
          if (!expectedToExit && workers.size === 0) {
            log.error(logData, 'All workers exited unexpectedly. Exiting...');
            process.exit(1);
          }
        });
        workers.add(worker);
      }
      registerTerminateHandler((signal) => {
        log.info(`Killing workers on ${signal}`);
        expectedToExit = true;
        workers.forEach((w) => {
          w.kill(signal);
        });
      });
      return true;
    }
  } catch (e) {
    log.error(
      // @ts-expect-error very likely an instanceof error
      e,
      'Error while forking workers',
    );
  }
  return false;
}
