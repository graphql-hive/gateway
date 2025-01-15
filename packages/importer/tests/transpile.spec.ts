import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { it } from 'vitest';
import { transpileTypeScriptFile } from '../src/transpile';

it('should transpile basic typescript file', async ({ expect }) => {
  const url = pathToFileURL(path.join(__dirname, 'fixtures', 'basic.ts'));
  await expect(transpileTypeScriptFile(url.toString())).resolves
    .toMatchInlineSnapshot(`
    {
      "format": "module",
      "source": "export const str = 'ing';
    ",
    }
  `);
});

it('should transpile basic typescript commonjs file', async ({ expect }) => {
  const url = pathToFileURL(path.join(__dirname, 'fixtures', 'basic.cts'));
  await expect(transpileTypeScriptFile(url.toString())).resolves
    .toMatchInlineSnapshot(`
    {
      "format": "commonjs",
      "source": ""use strict";const str = 'ing';
    module.exports = { str };
    ",
    }
  `);
});

it('should fail transpiling typescript file with syntax error and file location', async ({
  expect,
}) => {
  const url = pathToFileURL(
    path.join(__dirname, 'fixtures', 'syntax-error.ts'),
  );
  await expect(transpileTypeScriptFile(url.toString())).rejects.toThrowError(
    // we include the starting forwardslash and the project path because we want to make sure the absolute path is reported
    /Error transforming \/(.*)\/packages\/importer\/tests\/fixtures\/syntax-error.ts: Unexpected token, expected ";" \(2:11\)/,
  );
});
