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
    await wsClient.dispose();
    await ctx.stop();
  });

  const successSubscription1 = /* GraphQL */ `
    subscription SuccessSubscription1 {
      testSuccessSubscription {
        id
        email
      }
    }
  `;

  const successSubscription2 = /* GraphQL */ `
    subscription SuccessSubscription2 {
      testSuccessSubscription {
        id
        email
      }
    }
  `;

  const expectedSuccessResult = {
    data: {
      testSuccessSubscription: userMock1,
    },
  };

  it('subscribes and returns valid subscription mock for TestUser1 - successSubscription1', async () => {
    const subscribe = await wsClient.subscribe(successSubscription1);

    pubSub.publish('test-topic', userMock1);

    const result = await subscribe.waitForNext();
    expect(result).toMatchObject(expectedSuccessResult);
  });

  it('subscribes and returns valid subscription mock for TestUser1 - successSubscription2', async () => {
    const subscribe = await wsClient.subscribe(successSubscription2);

    pubSub.publish('test-topic', userMock1);

    const result = await subscribe.waitForNext();
    expect(result).toMatchObject(expectedSuccessResult);
  });
});
