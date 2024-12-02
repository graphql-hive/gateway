import { ExportedHandler, Response } from '@cloudflare/workers-types';
import {
  createGatewayRuntime,
  DisposableSymbols,
} from '@graphql-hive/gateway-runtime';
import http from '@graphql-mesh/transport-http';
import rest from '@graphql-mesh/transport-rest';
import { fakePromise } from '@graphql-tools/utils';
// @ts-ignore
import supergraph from './supergraph';

interface Env {
  DEBUG: string;
}

export default {
  async fetch(req, env, ctx) {
    const runtime = createGatewayRuntime({
      supergraph,
      transports: { http, rest },
      maskedErrors: false,
    });
    const res = await runtime(req, env, ctx);
    ctx.waitUntil(fakePromise(runtime[DisposableSymbols.asyncDispose]()));
    return res as unknown as Response;
  },
} satisfies ExportedHandler<Env>;
