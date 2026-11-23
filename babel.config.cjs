module.exports = {
  presets: [
    [
      '@babel/preset-env',
      { targets: { node: process.versions.node.split('.')[0] } },
    ],
    // preset-env in babel 8 already transforms explicit resource management (`using`)
    '@babel/preset-typescript',
  ],
  plugins: [
    ['@babel/plugin-transform-class-static-block', { version: '2023-11' }],
    ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
    '@babel/plugin-transform-class-properties',
    '@babel/plugin-transform-private-methods',
    // esm only deps (like nestjs 12) use import.meta.url which cant exist in the cjs jest runs
    ({ types: t, template }) => ({
      visitor: {
        MemberExpression(path) {
          const { object, property } = path.node;
          if (
            t.isMetaProperty(object) &&
            object.meta.name === 'import' &&
            object.property.name === 'meta' &&
            t.isIdentifier(property, { name: 'url' })
          ) {
            path.replaceWith(
              // not using require because some modules declare their own `require` which shadows it
              template.expression
                .ast`process.getBuiltinModule('node:url').pathToFileURL(__filename).href`,
            );
          }
        },
      },
    }),
  ],
};
