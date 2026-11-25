// The responses of the operations in `operations/` (with the variables in `<name>.variables.json`
// when there is one), recorded from a gateway in `expected/`, and checked against another one.
// Any change in how the Hive Router runtime stores, merges or writes data must not change them.
//
//   node bench/router-runtime/diff.mjs record [url]
//   node bench/router-runtime/diff.mjs check [url]

import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const here = import.meta.dirname;
const operationsDir = path.join(here, 'operations');
const expectedDir = path.join(here, 'expected');

function operations() {
  return fs
    .readdirSync(operationsDir)
    .filter((file) => file.endsWith('.graphql'))
    .sort()
    .map((file) => {
      const name = file.slice(0, -'.graphql'.length);
      const variablesFile = path.join(operationsDir, `${name}.variables.json`);
      return {
        name,
        query: fs.readFileSync(path.join(operationsDir, file), 'utf8'),
        variables: fs.existsSync(variablesFile)
          ? JSON.parse(fs.readFileSync(variablesFile, 'utf8'))
          : undefined,
      };
    });
}

async function execute(url, { query, variables }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export async function recordOperations(url) {
  fs.mkdirSync(expectedDir, { recursive: true });
  for (const operation of operations()) {
    const result = await execute(url, operation);
    if (result.errors) {
      throw new Error(`${operation.name}: ${JSON.stringify(result.errors)}`);
    }
    fs.writeFileSync(
      path.join(expectedDir, `${operation.name}.json`),
      JSON.stringify(result, null, 2) + '\n',
    );
  }
}

/** The operations whose response differs from the recorded one. */
export async function checkOperations(url) {
  const diffs = [];
  for (const operation of operations()) {
    const expected = JSON.parse(
      fs.readFileSync(path.join(expectedDir, `${operation.name}.json`), 'utf8'),
    );
    const actual = await execute(url, operation);
    if (!isDeepStrictEqual(actual, expected)) {
      diffs.push(
        `  ${operation.name}: ${JSON.stringify(actual).slice(0, 300)}`,
      );
    }
  }
  return diffs;
}

if (process.argv[1] === import.meta.filename) {
  const [mode, url = 'http://localhost:4000/graphql'] = process.argv.slice(2);
  if (mode === 'record') {
    await recordOperations(url);
    console.log(`recorded ${operations().length} responses in ${expectedDir}`);
  } else if (mode === 'check') {
    const diffs = await checkOperations(url);
    if (diffs.length) {
      console.error(`${diffs.length} responses differ:\n${diffs.join('\n')}`);
      process.exit(1);
    }
    console.log(`all ${operations().length} responses match`);
  } else {
    console.error('usage: diff.mjs record|check [url]');
    process.exit(1);
  }
}
