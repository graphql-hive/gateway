import module from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPathsMatcher, getTsconfig } from 'get-tsconfig';

// tsx applies tsconfig paths only to imports coming from outside node_modules, so
// deps in node_modules importing workspace packages (like yoga importing @graphql-hive/logger)
// end up at the unbuilt dist/ from the package exports. this falls back to the tsconfig
// paths when regular resolution fails so that e2e child processes work without `yarn build`
const tsconfig = getTsconfig(
  path.resolve(import.meta.dirname, '..', '..', '..', 'tsconfig.json'),
);
const matchPaths = tsconfig ? createPathsMatcher(tsconfig) : null;

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      for (const candidate of matchPaths?.(specifier) || []) {
        try {
          // cjs requires want a path, esm imports want a url
          return nextResolve(
            context.conditions?.includes('require')
              ? candidate
              : pathToFileURL(candidate).href,
            context,
          );
        } catch {
          // try next candidate
        }
      }
      throw err;
    }
  },
});
