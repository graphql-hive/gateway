import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      graphql: 'graphql/index.js', // TODO: why duplicate graphql errors when there's no multiple graphqls installed? mistery
    },
  },
});
