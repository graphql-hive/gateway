import { $ } from 'bun';

// change the unifiedGraphManager import to remove the marker comment
console.log(
  'Modifying unifiedGraphManager.ts to use stitching-only runtime...',
);
const origGraphManagerPath = './src/unifiedGraphManager.ts';
const origGraphManagerContent = await Bun.file(origGraphManagerPath).text();
const updatedGraphManagerLines: string[] = [];
let insideDeleteBlock = false;
for (const line of origGraphManagerContent.split('\n')) {
  if (insideDeleteBlock) {
    if (line.includes('// </use-only-stitching-unified-handler>')) {
      insideDeleteBlock = false;
      updatedGraphManagerLines.push(
        "import { handleFederationSupergraph } from './federation/supergraph';",
      );
    }
    continue;
  }
  if (line.includes('// <use-only-stitching-unified-handler>')) {
    insideDeleteBlock = true;
    continue;
  }
  updatedGraphManagerLines.push(line);
}
Bun.write(origGraphManagerPath, updatedGraphManagerLines.join('\n') + '\n');

try {
  console.log('Building...');
  await $`yarn exec pkgroll --clean-dist`;
} finally {
  // restore the original file content
  console.log('Restoring unifiedGraphManager.ts to original state...');
  await Bun.write(origGraphManagerPath, origGraphManagerContent);
}

// replace import with require in the cjs build output
console.log('Replacing import with require in cjs build output...');
const cjsFile = './dist/index.cjs';
const fileContent = await Bun.file(cjsFile).text();
const newContent = fileContent.replace(
  'import(moduleName)',
  'require(moduleName)',
);
await Bun.write(cjsFile, newContent);

console.log('OK');
