import { fetch } from '@whatwg-node/fetch';
import { isDebug } from './env';

export const hostnames = ['0.0.0.0', '127.0.0.1', 'localhost'];

export async function getLocalhost(port: number) {
  const timeoutSignal = AbortSignal.timeout(5000);
  while (!timeoutSignal.aborted) {
    for (const hostname of hostnames) {
      const url = `http://${hostname}:${port}`;
      if (isDebug()) {
        console.log(`getLocalhost(port): Trying ${url}`);
      }
      try {
        await fetch(url, { signal: timeoutSignal });
      } catch (e) {
        if (isDebug()) {
          console.log(`getLocalhost(port): Failed to connect on ${url}`);
        }
        continue;
      }
      if (isDebug()) {
        console.log(`getLocalhost(port): ${url} is available`);
      }
      return `http://${hostname}`;
    }
  }
  throw new Error(
    `No available hostname found locally for port ${port}. Tried ${hostnames.join(', ')} hostnames.`,
  );
}
