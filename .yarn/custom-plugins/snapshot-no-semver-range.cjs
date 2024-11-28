module.exports = {
  name: 'snapshot-no-semver-range',
  /** @returns {import('@yarnpkg/core').Plugin<import('@yarnpkg/plugin-pack').Hooks>} */
  factory() {
    return {
      hooks: {
        beforeWorkspacePacking(_workspace, packageJson) {
          console.group('snapshot-no-semver-range');
          for (const category of [
            'dependencies',
            'devDependencies',
            'peerDependencies',
          ]) {
            /** @type {Record<string, string>} */
            const deps =
              // @ts-expect-error packageJson is package.json
              packageJson[category];
            for (const [name, version] of Object.entries(deps)) {
              if (
                version.includes('-') && // a dash in version means snapshot release
                (version.startsWith('^') || version.startsWith('~')) // and is a ranged version
              ) {
                // remove the range
                const exactVersion = version.slice(1);
                console.debug(
                  `Setting "${name}" to exact version "${exactVersion}" (from ranged "${version}")`,
                );
                deps[name] = exactVersion;
              }
            }
          }
          console.groupEnd();
        },
      },
    };
  },
};
