module.exports = {
  name: 'snapshot-no-semver-range',
  /**
   * @param {typeof require} require
   * @returns {import('@yarnpkg/core').Plugin<import('@yarnpkg/plugin-pack').Hooks>} */
  factory(require) {
    /** @type {import('@yarnpkg/core')} */
    const { structUtils } = require('@yarnpkg/core');
    return {
      hooks: {
        /** @param {Record<string, any>} packageJson  */
        beforeWorkspacePacking(workspace, packageJson) {
          console.group('snapshot-no-semver-range');
          console.log(
            'Setting exact snapshot versions to workspace dependencies...',
          );
          for (const category of [
            'dependencies',
            'devDependencies',
            'peerDependencies',
          ]) {
            for (const desc of workspace.manifest
              .getForScope(category)
              .values()) {
              const range = structUtils.parseRange(desc.range);
              if (range.protocol !== 'workspace:') {
                // we dont care about deps outside our workspaces
                continue;
              }

              // find the matching workspace for the dependency
              const matchingWorkspace =
                workspace.project.tryWorkspaceByDescriptor(desc);
              if (!matchingWorkspace) {
                throw new Error(
                  `Dependency workspace "${desc.name}" not found`,
                );
              }

              if (!['^', '~'].includes(range.selector)) {
                // keep as is if the version is not ranged
                continue;
              }

              const version = matchingWorkspace.manifest.version;
              if (!version) {
                throw new Error(
                  `Dependency workspace "${desc.name}" does not have a version set`,
                );
              }
              if (!version.includes('-')) {
                // if the version does not include a dash, it's probably not a snapshot - we want to range it (keep as is)
                continue;
              }

              console.log(
                `Setting "${desc.name}" to exact snapshot version "${version}" (from ranged "workspace:${range.selector}")`,
              );
              packageJson[category][desc.name] = version;
            }
          }
          console.log('Done!');
          console.groupEnd();
        },
      },
    };
  },
};
