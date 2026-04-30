import { createTenv } from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { describe, it } from 'vitest';

describe('GraphiQL / Laboratory options', () => {
  const opts = {
    supergraph:
      'https://federation-demo.theguild.workers.dev/supergraph.graphql',
    proxy: 'https://federation-demo.theguild.workers.dev/users',
  } as const;
  const { gateway } = createTenv(__dirname);
  for (const mode of Object.keys(opts) as (keyof typeof opts)[]) {
    const url = opts[mode];
    describe(mode, () => {
      it('renders Laboratory by default', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/graphql`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('Laboratory')) {
          throw new Error(`Expected Laboratory to be rendered by default`);
        }
      });
      it('renders GraphiQL when --render-legacy-graphiql arg is set', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
          args: ['--render-legacy-graphiql'],
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/graphql`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('GraphiQL')) {
          throw new Error(
            `Expected GraphiQL to be rendered when --render-legacy-graphiql is set`,
          );
        }
      });
      it('renders GraphiQL when RENDER_LEGACY_GRAPHIQL env var is set', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
          env: { RENDER_LEGACY_GRAPHIQL: '1' },
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/graphql`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('GraphiQL')) {
          throw new Error(
            `Expected GraphiQL to be rendered when RENDER_LEGACY_GRAPHIQL env var is set`,
          );
        }
      });
      it('renders GraphiQL when renderLegacyGraphiQL is set via config file', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
          env: { RENDER_LEGACY_GRAPHIQL_CONFIG: '1' },
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/graphql`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('GraphiQL')) {
          throw new Error(
            `Expected GraphiQL to be rendered when renderLegacyGraphiQL is set via config file`,
          );
        }
      });
      it('mentions Laboratory in the landing page by default', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('Laboratory')) {
          throw new Error(
            `Expected landing page to mention Laboratory by default`,
          );
        }
      });
      it('mentions GraphiQL in the landing page when --render-legacy-graphiql arg is set', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
          args: ['--render-legacy-graphiql'],
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('GraphiQL')) {
          throw new Error(
            `Expected landing page to mention GraphiQL when --render-legacy-graphiql is set`,
          );
        }
      });
      it('mentions GraphiQL in the landing page when RENDER_LEGACY_GRAPHIQL env var is set', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
          env: { RENDER_LEGACY_GRAPHIQL: '1' },
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('GraphiQL')) {
          throw new Error(
            `Expected landing page to mention GraphiQL when RENDER_LEGACY_GRAPHIQL env var is set`,
          );
        }
      });
      it('mentions GraphiQL in the landing page when renderLegacyGraphiQL is set via config file', async () => {
        const { port, protocol } = await gateway({
          [mode]: url,
          env: { RENDER_LEGACY_GRAPHIQL_CONFIG: '1' },
        });
        const hostname = await getLocalhost(port, protocol);
        const response = await fetch(`${hostname}:${port}/`, {
          headers: {
            accept: 'text/html',
          },
        });
        const text = await response.text();
        if (!text.includes('GraphiQL')) {
          throw new Error(
            `Expected landing page to mention GraphiQL when renderLegacyGraphiQL is set via config file`,
          );
        }
      });
    });
  }
});
