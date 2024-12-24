import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import j from 'jscodeshift';
import z from 'zod';

const arg1 = process.argv[2] || '';
if (!arg1) {
  throw new Error('Config not provided in first argument');
}

const config = await z
  .object({
    e2eDir: z
      .string()
      .refine(async (arg) => {
        try {
          await fs.stat(arg);
          return true;
        } catch {
          return false;
        }
      }, 'Directory does not exist')
      .transform((arg) => path.resolve(arg))
      .refine(
        (arg) =>
          glob(path.join(arg, '*.e2e.ts')).then((paths) => paths.length > 0),
        'Directory does not contain an E2E test (no "*.e2e.ts" file)',
      ),
  })
  .parseAsync(JSON.parse(arg1));

console.log(`Converting E2E test at "${config.e2eDir}" to an example`);
