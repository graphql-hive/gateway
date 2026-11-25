import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

const AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKE';

describe('AWS Sigv4', () => {
  const { gateway, service } = createTenv(__dirname);
  it('signs the request correctly', async () => {
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [
          await service('upstream', {
            env: {
              AWS_ACCESS_KEY_ID,
              AWS_SECRET_ACCESS_KEY,
            },
          }),
        ],
      },
      env: {
        AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY,
      },
    });
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          hello
        }
      `,
    });
    expect(result).toEqual({
      data: {
        hello: 'world',
      },
    });
  });
  it('fails when the request is not signed', async () => {
    const gw = await gateway({
      supergraph: {
        with: 'apollo',
        services: [
          await service('upstream', {
            env: {
              AWS_ACCESS_KEY_ID,
              AWS_SECRET_ACCESS_KEY,
            },
          }),
        ],
      },
      env: {
        AWS_ACCESS_KEY_ID: 'invalid',
        AWS_SECRET_ACCESS_KEY: 'invalid',
      },
    });
    const result = await gw.execute({
      query: /* GraphQL */ `
        query {
          hello
        }
      `,
    });
    expect(result).toEqual({
      data: {
        hello: null,
      },
      errors: [
        {
          message: 'Expected access key AKIAIOSFODNN7EXAMPLE, but got invalid',
          extensions: {
            code: 'DOWNSTREAM_SERVICE_ERROR',
            serviceName: 'upstream',
          },
          path: ['hello'],
        },
      ],
    });
  });
});
