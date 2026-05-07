import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const graphqlPackageJson = require('graphql/package.json');
const graphqlVersion = graphqlPackageJson.version;

const repoDockerfiles = [];

collectDockerfiles(repoRoot, repoDockerfiles);

const replacements = [
  {
    pattern: /graphql@(?:\^)?[0-9]+\.[0-9]+\.[0-9]+/g,
    replacement: `graphql@${graphqlVersion}`,
  },
];

let changedFileCount = 0;

for (const dockerfilePath of repoDockerfiles) {
  const originalContent = readFileSync(dockerfilePath, 'utf8');
  let nextContent = originalContent;

  for (const { pattern, replacement } of replacements) {
    nextContent = nextContent.replace(pattern, replacement);
  }

  if (nextContent === originalContent) {
    continue;
  }

  writeFileSync(dockerfilePath, nextContent);
  changedFileCount += 1;
  console.log(
    `Updated ${path.relative(repoRoot, dockerfilePath)} to graphql@${graphqlVersion}`,
  );
}

if (changedFileCount === 0) {
  console.log(`Dockerfiles already use graphql@${graphqlVersion}`);
}

function collectDockerfiles(directoryPath, dockerfiles) {
  for (const dirent of require('node:fs').readdirSync(directoryPath, {
    withFileTypes: true,
  })) {
    if (shouldSkipDirent(dirent.name)) {
      continue;
    }

    const entryPath = path.join(directoryPath, dirent.name);

    if (dirent.isDirectory()) {
      collectDockerfiles(entryPath, dockerfiles);
      continue;
    }

    if (isDockerfile(dirent.name)) {
      dockerfiles.push(entryPath);
    }
  }
}

function shouldSkipDirent(name) {
  return name === '.git' || name === 'node_modules' || name === '.yarn';
}

function isDockerfile(fileName) {
  return (
    fileName === 'Dockerfile' ||
    fileName.startsWith('Dockerfile.') ||
    fileName.endsWith('.Dockerfile') ||
    fileName.endsWith('.dockerfile')
  );
}
