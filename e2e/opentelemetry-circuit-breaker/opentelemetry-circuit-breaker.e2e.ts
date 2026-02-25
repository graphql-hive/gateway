import { createExampleSetup, createTenv, Gateway } from '@internal/e2e';
import { createDisposableServer } from '@internal/testing';
import { Push, Repeater, Stop } from '@repeaterjs/repeater';
import { fetch } from '@whatwg-node/fetch';
import { createServerAdapter, DisposableSymbols } from '@whatwg-node/server';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

it('should huh?', async () => {
  const otel = await createIterableServer();

  const gw = await gateway({
    supergraph: await supergraph(),
    env: {
      HIVE_TRACING_ENDPOINT: otel.url,
    },
  });

  await expect(gw.execute({ query: '{ __typename }' })).resolves.toEqual(
    expect.objectContaining({ data: expect.any(Object) }),
  );

  // batch exporter scheduledDelayMillis defaults to 5s
  await advanceGatewayTimersByTime(gw, 5_000);

  await otel.waitForRequest();
});

async function advanceGatewayTimersByTime(gateway: Gateway, timeInMs: number) {
  const res = await fetch(`http://localhost:${gateway.port}/_tick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(timeInMs),
  });
  if (!res.ok) {
    throw new Error(`Failed to advance gateway timers: ${res.statusText}`);
  }
}

async function createIterableServer() {
  let push: Push<Request, Response>;
  let stop: Stop;
  const rep = new Repeater<Request, unknown, Response>((_push, _stop) => {
    push = _push;
    stop = _stop;
  });

  const serv = await createDisposableServer(
    createServerAdapter(async (req) => {
      const res = await push(req);
      if (res) return res;
      return new Response();
    }),
  );

  // stop the iterator when the server gets disposed
  const origDispose = serv[DisposableSymbols.asyncDispose];
  serv[DisposableSymbols.asyncDispose] = async () => {
    stop();
    await origDispose.call(serv);
  };

  return Object.assign(rep, {
    url: serv.url,
    waitForRequest: (res?: Response) =>
      rep.next(res).then(({ done, value }) => {
        if (done) throw new Error('Server iterator stopped');
        return value;
      }),
  });
}
