import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// By default, Vite bypasses node_packages to native Node; meaning, imports to
// packages that match the tsconfig paths wont work because Node will require the
// packages as per the Node resolution spec.
//
// Vite will process inlined modules.
const inline = [/@graphql-mesh\/fusion-composition/, /@graphql-mesh\/utils/];

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { server: { deps: { inline } } },
  resolve: {
    alias: {
      graphql: 'graphql/index.js', // TODO: why duplicate graphql errors when there's no multiple graphqls installed? mistery
    },
  },
});
