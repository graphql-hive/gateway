import { setTimeout } from 'timers/promises';
import { versionInfo } from 'graphql';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { pubSub, TestEnvironment } from './fixtures/TestEnvironment';
import { userMock1 } from './fixtures/TestSubgraph1';
import { WsClient } from './fixtures/WsClient';

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(versionInfo.major >= 16)('Yoga gateway - subscriptions test', () => {
  let ctx: TestEnvironment;
  const wsClient: WsClient = new WsClient();

  beforeAll(async () => {
    ctx = new TestEnvironment();
    await ctx.start();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  const subscription = /* GraphQL */ `
    subscription {
      testSuccessSubscription {
        id
        email
      }
    }
  `;

  const expectedResult = {
    data: {
      testSuccessSubscription: userMock1,
    },
  };

  it('subscribes and returns valid subscription mock for TestUser1', async () => {
    const subscribe = await wsClient.subscribe(subscription);

    pubSub.publish('test-topic', userMock1);

    const result = await subscribe.waitForNext();
    expect(result).toMatchObject(expectedResult);

    const errorSpy = vi.spyOn(console, 'error');
    subscribe.dispose();

    // wait for error is logged
    await setTimeout(200);
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Internal error occurred'),
      expect.objectContaining({ message: 'The operation was aborted' }),
    );
    expect(errorSpy).toHaveBeenCalledTimes(0);
  });
});
