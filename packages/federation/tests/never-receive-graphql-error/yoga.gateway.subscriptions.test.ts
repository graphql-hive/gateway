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
import { SseClient } from './fixtures/SseClient';
import { pubSub, TestEnvironment } from './fixtures/TestEnvironment';
import { userMock1 } from './fixtures/TestSubgraph1';
import { WsClient } from './fixtures/WsClient';

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(versionInfo.major >= 16)('Yoga gateway - subscriptions test', () => {
  let ctx: TestEnvironment;
  const sseClient: SseClient = new SseClient();
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

  const successSubscription = /* GraphQL */ `
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

  const errorSubscription = /* GraphQL */ `
    subscription {
      testErrorSubscription {
        id
      }
    }
  `;

  const expectedErrorResult = {
    data: { testErrorSubscription: null },
    errors: [
      {
        message: 'My subgraph1 error!',
        extensions: {
          code: 'BAD_REQUEST',
        },
      },
    ],
  };

  it('subscribes and returns valid subscription mock for TestUser1 - SseClient', async () => {
    const subscribe = await sseClient.subscribe(successSubscription);

    pubSub.publish('test-topic', userMock1);

    const result = await subscribe.waitForNext();
    expect(result).toMatchObject(expectedResult);

    subscribe.dispose();
  });

  it('should receive GraphQLError if subgraph throw an error - SseClient', async () => {
    const subscribe = await sseClient.subscribe(errorSubscription);

    const result = await subscribe.waitForNext();
    expect(result).toMatchObject(expectedErrorResult);

    subscribe.dispose();
  });

  it('subscribes and returns valid subscription mock for TestUser1 - WsClient', async () => {
    const subscribe = await wsClient.subscribe(successSubscription);

    pubSub.publish('test-topic', userMock1);

    const result = await subscribe.waitForNext();
    expect(result).toMatchObject(expectedResult);

    subscribe.dispose();
  });

  it('should receive GraphQLError if subgraph throw an error - WsClient', async () => {
    const subscribe = await wsClient.subscribe(errorSubscription);

    const result = await subscribe.waitForNext();
    expect(result).toMatchObject(expectedErrorResult);

    subscribe.dispose();
  });
});
