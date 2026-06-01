import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should respond when deadline reached', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('hello')],
    },
  });

  const err: Error = await gw
    .execute({
      query: '{slowHello}',
    })
    .catch((err) => err);

  expect(err.message).toContain(
    'ResponseError: Status is not 200, got status 503 Service Unavailable',
  );
});

it('should invoke onResponse on deadline reached', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('hello')],
    },
  });

  const err: Error = await gw
    .execute({
      query: '{slowHello}',
    })
    .catch((err) => err);

  expect(err.message).toContain(
    'ResponseError: Status is not 200, got status 503 Service Unavailable',
  );

  // wait for the subgraph timeout to pass to ensure onResponse is invoked (event if deadline does not work)
  await new Promise((resolve) => setTimeout(resolve, 300));

  const onResponseRawData = gw
    .getStd('both')
    .split('\n')
    .find((line) => line.startsWith('[onResponse]'))
    ?.replace('[onResponse]', '');
  expect(onResponseRawData).toBeTruthy();

  const onResponseData = JSON.parse(onResponseRawData!);
  expect(onResponseData.statusCode).toBe(503); // the status code when deadline is reached
  expect(onResponseData.durationInMs).toBeLessThan(150); // 100ms is the request deadline + some leeway
});
