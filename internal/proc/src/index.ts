import childProcess from 'child_process';
import fs from 'fs/promises';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { createDeferred } from '@graphql-tools/utils';
import { hostnames, isDebug, trimError } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import terminate from 'terminate/promise';

export interface Proc extends AsyncDisposable {
  getStd(o: 'out' | 'err' | 'both'): string;
  getStats(): Promise<{
    // Total CPU utilization (of all cores) as a percentage.
    cpu: number;
    // Memory consumption in megabytes (MB).
    mem: number;
  }>;
}

export interface ProcOptions {
  /**
   * Pipe the logs from the spawned process to the current process, or to a file
   * relative to the Tenv cwd when passing a string.
   *
   * Useful for debugging.
   *
   * @default boolEnv('DEBUG')
   */
  pipeLogs?: boolean | string;
  /**
   * Additional environment variables to pass to the spawned process.
   *
   * They will be merged with `process.env` overriding any existing value.
   */
  env?: Record<string, string | number>;
  /** Extra args to pass to the process. */
  args?: (string | number | boolean)[];
  /** Custom replacer of stderr coming from he process. */
  replaceStderr?: (str: string) => string;
}

interface SpawnOptions extends ProcOptions {
  cwd: string;
  shell?: boolean;
  signal?: AbortSignal;
  stack?: AsyncDisposableStack;
}

export function spawn(
  {
    cwd,
    pipeLogs = isDebug(),
    env = {},
    shell,
    signal,
    stack,
    replaceStderr = (str) => str,
  }: SpawnOptions,
  cmd: string,
  ...args: (string | number | boolean | null | undefined)[]
): Promise<[proc: Proc, waitForExit: Promise<void>]> {
  const child = childProcess.spawn(cmd, args.filter(Boolean).map(String), {
    cwd,
    // ignore stdin, pipe stdout and stderr
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.entries(env).reduce(
      (acc, [key, val]) => ({ ...acc, [key]: String(val) }),
      { ...process.env },
    ),
    shell,
    signal,
  });

  const exitDeferred = createDeferred<void>();
  const waitForExit = exitDeferred.promise;
  let exited = false;
  let stdout = '';
  let stderr = '';
  let stdboth = '';
  const proc: Proc = {
    getStd(o) {
      switch (o) {
        case 'out':
          return stdout;
        case 'err':
          return stderr;
        case 'both':
          return stdboth;
      }
    },
    async getStats() {
      const [proc, waitForExit] = await spawn(
        { cwd, pipeLogs: isDebug() },
        'ps',
        '-o',
        'pcpu=,rss=',
        '-p',
        child.pid!,
      );
      await waitForExit;
      const [cpu, mem] = proc.getStd('out').trim().split(/\s+/);
      return {
        cpu: parseFloat(cpu!),
        mem: parseFloat(mem!) * 0.001, // KB to MB
      };
    },
    [DisposableSymbols.asyncDispose]: () => {
      const childPid = child.pid;
      if (childPid && !exited) {
        return terminate(childPid);
      }
      return waitForExit;
    },
  };
  stack?.use(proc);

  child.stdout.on('data', (x) => {
    const str = x.toString();
    stdout += str;
    stdboth += str;
    pipeLog({ cwd, pipeLogs }, x);
  });
  child.stderr.on('data', (x) => {
    const str = replaceStderr(x.toString());
    stderr += str;
    stdboth += str;
    pipeLog({ cwd, pipeLogs }, x);
  });

  child.once('exit', () => {
    // process ended
    child.stdout.destroy();
    child.stderr.destroy();
  });
  child.once('close', (code) => {
    exited = true;
    // process ended _and_ the stdio streams have been closed
    if (code) {
      exitDeferred.reject(
        new Error(
          `Exit code ${code} from ${cmd} ${args.join(' ')}\n${trimError(stdboth)}`,
        ),
      );
    } else {
      exitDeferred.resolve();
    }
  });

  return new Promise((resolve, reject) => {
    child.once('error', (err) => {
      exited = true;
      exitDeferred.reject(err); // reject waitForExit promise
      reject(err);
    });
    child.once('spawn', () => resolve([proc, waitForExit]));
  });
}

export function getAvailablePort(): Promise<number> {
  const deferred = createDeferred<number>();
  const server = createServer();
  server.once('error', (err) => deferred.reject(err));
  server.listen(0, () => {
    try {
      const addressInfo = server.address() as AddressInfo;
      server.close((err) => {
        if (err) {
          return deferred.reject(err);
        }

        return deferred.resolve(addressInfo.port);
      });
    } catch (err) {
      return deferred.reject(err);
    }
  });
  return deferred.promise;
}

/** Maybe pipes the log entry to the stderr of the current process, or appends it to a file relative to the {@link cwd} - if {@link pipeLogs} is a `string`. */
function pipeLog(
  { cwd, pipeLogs }: { cwd: string; pipeLogs: boolean | string },
  log: string,
) {
  if (pipeLogs === true) {
    process.stderr.write(log);
  } else if (typeof pipeLogs === 'string') {
    fs.appendFile(path.join(cwd, pipeLogs), log);
  }
}

export async function waitForPort({
  port,
  signal,
  protocol = 'http',
  interval = 1_000,
}: {
  port: number;
  signal: AbortSignal;
  protocol?: string;
  interval?: number;
}) {
  outer: while (!signal.aborted) {
    for (const localHostname of hostnames) {
      try {
        await fetch(`${protocol}://${localHostname}:${port}`, { signal });
        break outer;
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes('self-signed certificate') &&
          protocol === 'https'
        ) {
          break outer;
        }
      }
    }
    // no need to track retries, jest will time out aborting the signal
    signal.throwIfAborted();
    await setTimeout(interval);
  }
}
