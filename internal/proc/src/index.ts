import childProcess from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { createDeferred, fakePromise } from '@graphql-tools/utils';
import { hostnames, isDebug, trimError } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { fetch } from '@whatwg-node/fetch';
import terminate from 'terminate/promise';

export interface Proc extends AsyncDisposable {
  waitForExit: Promise<void>;
  /** Sends a signal to the process. */
  kill(signal?: NodeJS.Signals): void;
  getStd(o: 'out' | 'err' | 'both'): string;
  getStats(): Promise<{
    // Total CPU utilization (of all cores) as a percentage.
    cpu: number;
    // Memory consumption in megabytes (MB).
    mem: number;
  }>;
}

export interface Server extends Proc {
  port: number;
  protocol: string;
}

export interface ProcOptions {
  /**
   * Pipe the logs from the spawned process to the current process, or to a file
   * relative to the Tenv cwd when passing a string.
   *
   * Useful for debugging.
   *
   * @default truthyEnv('DEBUG')
   */
  pipeLogs?: boolean | string;
  /**
   * Additional environment variables to pass to the spawned process.
   *
   * They will be merged with `process.env` overriding any existing value.
   */
  env?: Record<string, string | number | null | undefined>;
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
    pipeLogs,
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
      (acc, [key, val]) => {
        if (val == null) {
          // omit nullish envionment variables
          return acc;
        }
        return { ...acc, [key]: String(val) };
      },
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
  // Limit stored output to prevent memory issues with high-volume logging
  // Keep last 10MB of output (approximately 10 million characters)
  const MAX_OUTPUT_LENGTH = 10_000_000;
  const proc: Proc = {
    waitForExit,
    kill(signal) {
      child.kill(signal);
    },
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
    [DisposableSymbols.asyncDispose]: async () => {
      if (exited) {
        // there's nothing to dispose since the process already exitted (error or not)
        return fakePromise();
      }
      if (child.pid) {
        await terminate(child.pid).catch((e) => {
          // ignore errors when terminating the process
          console.error(`Failed to terminate process ${child.pid}:`, e);
        });
      }
      child.kill();
      await waitForExit.catch(() => {
        // we dont care about if abnormal exit code when disposing
        // specifically in Windows, exit code is always 1 when killing a live process
      });
    },
  };
  stack?.use(proc);

  child.stdout.on('data', (x) => {
    const str = x.toString();
    stdout += str;
    if (stdout.length > MAX_OUTPUT_LENGTH) {
      stdout = stdout.slice(-MAX_OUTPUT_LENGTH);
    }
    stdboth += str;
    if (stdboth.length > MAX_OUTPUT_LENGTH) {
      stdboth = stdboth.slice(-MAX_OUTPUT_LENGTH);
    }
    pipeLog({ cwd, pipeLogs }, x);
  });
  child.stderr.on('data', (x) => {
    const str = replaceStderr(x.toString());
    stderr += str;
    if (stderr.length > MAX_OUTPUT_LENGTH) {
      stderr = stderr.slice(-MAX_OUTPUT_LENGTH);
    }
    stdboth += str;
    if (stdboth.length > MAX_OUTPUT_LENGTH) {
      stdboth = stdboth.slice(-MAX_OUTPUT_LENGTH);
    }
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

/** Maybe pipes the log entry to the stderr of the current process, or appends it to a file relative to the {@link cwd} - if {@link pipeLogs} is a `string`. */
function pipeLog(
  { cwd, pipeLogs }: { cwd: string; pipeLogs: boolean | string | undefined },
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
