# @graphql-hive/importer

Used to improve Hive's importing capabilities allowing it to parse TypeScript files.

Please note that `get-tsconfig` and `sucrase` are **intentionally** inside devDependencies at the [package.json](/packages/mporter/package.json) because we want to bundle them in.

[pkgroll will bundle all devDependencies that are used in the source code.](https://github.com/privatenumber/pkgroll?tab=readme-ov-file#dependency-bundling--externalization)
