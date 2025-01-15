import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should point to exact location of syntax error when parsing a malformed config', async () => {
  await expect(
    gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('hello')],
      },
    }),
  ).rejects.toThrowError(
    /SyntaxError \[Error\]: Error transforming (.*)\/custom-resolvers.ts: Unexpected token, expected "{" \(8:11\)/,
  );
});
