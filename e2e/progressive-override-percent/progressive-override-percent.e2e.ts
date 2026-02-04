import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);
describe('Progressive Override', () => {
  it('gives correct results', async () => {
    const { execute, getStd } = await gateway({
      supergraph: {
        with: 'apollo',
        services: [
          await service('original-subgraph'),
          await service('override-subgraph'),
        ],
      },
    });
    const query = `{
      store(id: "123") {
        id
        someConfigOrig { status }
        someConfigNonProg { status }
        someConfigProg0 { status }
        someConfigProg100 { status }
        someConfigProgCustom { status }
      }
    }`;

    const result = await execute({ query });

    expect(result.data?.store?.someConfigOrig.status).toBe(
      'from-original-subgraph',
    );
    expect(result.data?.store?.someConfigNonProg.status).toBe(
      'from-override-subgraph',
    );
    expect(result.data?.store?.someConfigProg0.status).toBe(
      'from-original-subgraph',
    );
    expect(result.data?.store?.someConfigProg100.status).toBe(
      'from-override-subgraph',
    );
    expect(result.data?.store?.someConfigProgCustom.status).toBe(
      'from-override-subgraph',
    );

    const logs = getStd('both');
    const logLines = logs.split('\n').filter(Boolean);
    const logLinesForProgressiveOverride = logLines.filter((line) =>
      line.includes('progressiveOverride called with label'),
    );
    expect(logLinesForProgressiveOverride.length).toBe(1);
    expect(logs).not.toContain(
      '[gateway] progressiveOverride called with label: "percent(0)", returning "true"',
    );
    expect(logs).not.toContain(
      '[gateway] progressiveOverride called with label: "percent(100)", returning "true"',
    );
    expect(logs).toContain(
      '[gateway] progressiveOverride called with label: "test-custom", returning "true"',
    );
  });
});
