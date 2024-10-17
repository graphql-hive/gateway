import { fetch } from '@whatwg-node/fetch';
import { isDebug } from './env';

export const localHostnames = ['0.0.0.0', '127.0.0.1', 'localhost'];

export async function getLocalHostName(port: number) {
  const timeoutSignal = AbortSignal.timeout(5000);
  while (!timeoutSignal.aborted) {
    for (const hostname of [...localHostnames]) {
      if (isDebug()) {
        console.log(`Trying hostname: ${hostname}`);
      }
      try {
        const res = await fetch(`http://${hostname}:${port}`, {
          signal: timeoutSignal,
        });
        await res.text();
      } catch (e) {
        if (isDebug()) {
          console.log(`Failed to connect to hostname: ${hostname}`);
        }
        continue;
      }
      if (isDebug()) {
        console.log(`Found hostname: ${hostname}`);
      }
      return hostname;
    }
  }
  throw new Error(
    `No available hostname found as a local hostname for the given port: ${port}. Tried hostnames: ${localHostnames.join(', ')}`,
  );
}
