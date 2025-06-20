import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transpileTypeScriptFile } from '../src/transpile';

describe.skipIf(process.env['LEAK_TEST'])('Transpile', () => {
  it('should transpile basic typescript file', async () => {
    const url = pathToFileURL(path.join(__dirname, 'fixtures', 'basic.ts'));
    const { format, source } = await transpileTypeScriptFile(url.toString());
    expect(format).toMatchInlineSnapshot(`"module"`);
    expect(source.trim()).toMatchInlineSnapshot(`"export const str = 'ing';"`);
  });

  it.skipIf(
    // bun has issues with the snapshot. it looks exactly the same but bun claims it doesnt match
    globalThis.Bun,
  )('should transpile basic typescript commonjs file', async () => {
    const url = pathToFileURL(path.join(__dirname, 'fixtures', 'basic.cts'));
    const { format, source } = await transpileTypeScriptFile(url.toString());
    expect(format).toMatchInlineSnapshot(`"commonjs"`);
    expect(source.trim()).toMatchInlineSnapshot(`
      ""use strict";const str = 'ing';
      module.exports = { str };"
    `);
  });

  it('should fail transpiling typescript file with syntax error and file location', async () => {
    const url = pathToFileURL(
      path.join(__dirname, 'fixtures', 'syntax-error.ts'),
    );
    await expect(transpileTypeScriptFile(url.toString())).rejects.toThrow(
      // we include the starting forwardslash and the project path because we want to make sure the absolute path is reported
      /Error transforming \/(.*)\/packages\/importer\/tests\/fixtures\/syntax-error.ts: Unexpected token, expected ";" \(2:11\)/,
    );
  });
});
