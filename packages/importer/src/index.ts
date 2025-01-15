import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform, type Transform } from 'sucrase';

const isDebug = ['1', 'y', 'yes', 't', 'true'].includes(
  String(process.env['DEBUG']),
);

export function debug(msg: string) {
  if (isDebug) {
    process.stderr.write(`[${new Date().toISOString()}] HOOKS ${msg}\n`);
  }
}

export interface Transpiled {
  format: 'commonjs' | 'module';
  source: string;
}

export async function transpileTypeScriptFile(
  url: string,
): Promise<Transpiled> {
  debug(`Transpiling TypeScript file at "${url}"`);
  const filePath = fileURLToPath(url);
  let source: string;
  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read file at "${url}"; ${Object(e).stack || e}`);
  }
  let format: 'module' | 'commonjs';
  if (/\.ts$/.test(url)) {
    format = 'module';
  } else if (/\.mts$/.test(url)) {
    format = 'module';
  } else if (/\.cts$/.test(url)) {
    format = 'commonjs';
  } else {
    throw new Error(
      `Format of "${url}" could not be detected, is it a TypeScript file?`,
    );
  }
  const transforms: Transform[] = ['typescript'];
  if (format === 'commonjs') {
    transforms.push('imports');
  }
  const { code } = transform(source, { transforms });
  return {
    format,
    source: code,
  };
}
