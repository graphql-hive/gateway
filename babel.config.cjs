module.exports = {
  presets: [
    [
      '@babel/preset-env',
      { targets: { node: process.versions.node.split('.')[0] } },
    ],
    '@babel/preset-typescript',
  ],
  plugins: [
    ['@babel/plugin-transform-class-static-block', { version: '2023-11' }],
    ['@babel/plugin-proposal-decorators', { version: '2023-11' }],
    '@babel/plugin-transform-class-properties',
    '@babel/plugin-proposal-explicit-resource-management',
    '@babel/plugin-transform-private-methods',
  ],
};
