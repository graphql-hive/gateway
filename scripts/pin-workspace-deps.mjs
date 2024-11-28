import { globSync, readFileSync, writeFileSync } from 'fs';

for (const packageJsonFile of globSync('packages/*/package.json')) {
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
          console.log(`Pinned ${depName} in ${packageJsonFile} to workspace:*`);
        }
      }
    }
  }
  writeFileSync(packageJsonFile, JSON.stringify(packageJson, null, 2));
}
