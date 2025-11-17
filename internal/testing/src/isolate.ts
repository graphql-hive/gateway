import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DisposableSymbols } from '@whatwg-node/disposablestack';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const __project = path.resolve(__dirname, '..', '..', '..');

export interface IsolateOptions {
  log?: boolean;
}

/**
 * Isolate the test simulating fresh installations by hiding `node_modules` and the `tsconfig.json`
 * from the project directory. This ensures that no module is accidentally imported.
 */
export async function isolate({
  log,
}: IsolateOptions = {}): Promise<AsyncDisposable> {
  if (log) console.log('Hiding root node_modules and tsconfig.json');

  const hiddenPrefix = 'HIDDEN_';
  await Promise.all([
    fs.rename(
      path.join(__project, 'node_modules'),
      path.join(__project, `${hiddenPrefix}node_modules`),
    ),
    fs.rename(
      path.join(__project, 'tsconfig.json'),
      path.join(__project, `${hiddenPrefix}tsconfig.json`),
    ),
  ]);
  return {
    async [DisposableSymbols.asyncDispose]() {
      if (log) console.log('Restoring root node_modules and tsconfig.json');
      await Promise.all([
        fs.rename(
          path.join(__project, `${hiddenPrefix}node_modules`),
          path.join(__project, 'node_modules'),
        ),
        fs.rename(
          path.join(__project, `${hiddenPrefix}tsconfig.json`),
          path.join(__project, 'tsconfig.json'),
        ),
      ]);
    },
  };
}
