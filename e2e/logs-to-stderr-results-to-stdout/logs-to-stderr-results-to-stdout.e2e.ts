import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, fs } = createTenv(__dirname);

it('should write gateway logs to stderr', async () => {
  const { getStd } = await gateway({
    supergraph: await fs.tempfile(
      'supergraph.graphql',
      'type Query { hello: String }',
    ),
  });
  expect(getStd('err')).toContain('Serving local supergraph from');
});
