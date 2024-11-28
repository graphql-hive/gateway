import { globSync, readFileSync, writeFileSync } from 'fs';

const foundPackageJsonFiles = globSync('packages/*/package.json');

foundPackageJsonFiles.forEach((packageJsonFile) => {
  const packageJsonContent = readFileSync(packageJsonFile, 'utf8');
  const packageJson = JSON.parse(packageJsonContent);
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
  writeFileSync(packageJsonFile, JSON.stringify(packageJson, null, 2));
});
