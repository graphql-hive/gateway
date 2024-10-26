import { fetch } from '@whatwg-node/fetch';
import { isDebug } from './env';

export const hostnames = ['0.0.0.0', '127.0.0.1', 'localhost'];

export async function getLocalhost(port: number) {
  const timeoutSignal = AbortSignal.timeout(5000);
  while (!timeoutSignal.aborted) {
    for (const hostname of hostnames) {
      if (isDebug()) {
        console.log(`getLocalhost(port): Trying hostname: ${hostname}`);
      }
      try {
        const res = await fetch(`http://${hostname}:${port}`, {
          signal: timeoutSignal,
        });
        await res.text();
      } catch (e) {
        if (isDebug()) {
          console.log(
            `getLocalhost(port): Failed to connect to hostname: ${hostname}`,
          );
        }
        continue;
      }
      if (isDebug()) {
        console.log(`getLocalhost(port): Found hostname: ${hostname}`);
      }
      return `http://${hostname}`;
    }
  }
  throw new Error(
    `No available hostname found as a local hostname for the given port: ${port}. Tried hostnames: ${hostnames.join(', ')}`,
  );
}
