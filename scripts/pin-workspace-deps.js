import { globSync } from 'fs';

const foundPackageJsonFiles = globSync('packages/*/package.json');

foundPackageJsonFiles.forEach(async (packageJsonFile) => {
  const packageJson = require(packageJsonFile);
  const dependencyProps = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ];
  for (const depProp of dependencyProps) {
    const dependencies = packageJson[depProp];
    if (dependencies) {
      for (const depName in dependencies) {
        const depVersion = dependencies[depName];
        if (depVersion === 'workspace:^') {
          dependencies[depName] = `workspace:*`;
        }
      }
    }
  }
  fs.writeFileSync(packageJsonFile, JSON.stringify(packageJson, null, 2));
});
