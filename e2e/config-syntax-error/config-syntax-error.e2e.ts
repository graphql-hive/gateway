import { createTenv } from '@internal/e2e';
import { isCI } from '@internal/testing';
import { expect, it } from 'vitest';

const { gateway, service, gatewayRunner } = createTenv(__dirname);

it.skipIf(
  // for whatever reason docker in CI sometimes (sometimes is the keyword, more than less)
  // doesnt provide all the logs and throws errors with weird messages and I dont know where from or why
  // see https://github.com/graphql-hive/gateway/actions/runs/12830196184/job/35777821364
  isCI() && gatewayRunner === 'docker',
)(
  'should point to exact location of syntax error when parsing a malformed config',
  async () => {
    await expect(
      gateway({
        supergraph: {
          with: 'mesh',
          services: [await service('hello')],
        },
        runner: {
          docker: {
            volumes: [
              {
                host: 'custom-resolvers.ts',
                container: '/gateway/custom-resolvers.ts',
              },
            ],
          },
        },
      }),
    ).rejects.toThrow(
      gatewayRunner === 'bun' || gatewayRunner === 'bun-docker'
        ? /Expected \\"{\\" but found \\"hello\\"(.|\n)*\/custom-resolvers.ts/
        : /Error transforming .*(\/|\\)custom-resolvers.ts: Unexpected token, expected \\"{\\" \(8:11\)/,
    );
  },
);
