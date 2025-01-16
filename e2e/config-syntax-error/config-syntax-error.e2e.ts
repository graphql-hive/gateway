import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service, gatewayRunner } = createTenv(__dirname);

it('should point to exact location of syntax error when parsing a malformed config', async () => {
  await expect(
    gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('hello')],
      },
    }),
  ).rejects.toThrowError(
    gatewayRunner === 'bun' || gatewayRunner === 'bun-docker'
      ? /error: Expected "{" but found "hello"(.|\n)*\/custom-resolvers.ts:8:11/
      : /SyntaxError \[Error\]: Error transforming (.*)\/custom-resolvers.ts: Unexpected token, expected "{" \(8:11\)/,
  );
});
