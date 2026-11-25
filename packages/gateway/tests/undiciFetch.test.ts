import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { FormData } from '@whatwg-node/fetch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUndiciFetch } from '../src/undiciFetch';

const fetch = createUndiciFetch();
let server: Server;
let url: string;
// the requests the server got, by path
const received = new Map<string, { req: IncomingMessage; body: string }>();

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.set(req.url!, { req, body });
      switch (req.url) {
        case '/json':
          res.writeHead(201, {
            'content-type': 'application/json',
            'x-a': 'b',
          });
          res.end(JSON.stringify({ got: body, method: req.method }));
          return;
        case '/gzip':
          res.writeHead(200, {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
          });
          res.end(gzipSync(JSON.stringify({ zipped: true })));
          return;
        case '/redirect':
          res.writeHead(302, { location: '/json' });
          res.end();
          return;
        case '/empty':
          res.writeHead(204);
          res.end();
          return;
        case '/sse':
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write('data: first\n\n');
          // ends only when the client is gone
          return;
        case '/slow':
          setTimeout(() => res.end('late'), 1000);
          return;
        case '/form':
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end(String(req.headers['content-type']));
          return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('createUndiciFetch', () => {
  it('sends the method, headers and body, and answers like fetch', async () => {
    const res = await fetch(`${url}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Custom': '1' },
      body: '{"q":1}',
    });
    expect(res.status).toBe(201);
    expect(res.statusText).toBe('Created');
    expect(res.ok).toBe(true);
    expect(res.headers.get('x-a')).toBe('b');
    expect(await res.json()).toEqual({ got: '{"q":1}', method: 'POST' });
    const { req } = received.get('/json')!;
    expect(req.headers['x-custom']).toBe('1');
    expect(req.headers['user-agent']).toBe('node');
    expect(req.headers['accept-encoding']).toBe('gzip, deflate, br');
  });

  it('decompresses what it asked to be compressed', async () => {
    const res = await fetch(`${url}/gzip`);
    expect(await res.json()).toEqual({ zipped: true });
  });

  it('follows redirects, or not, like fetch', async () => {
    const followed = await fetch(`${url}/redirect`);
    expect(followed.status).toBe(201);
    expect(followed.redirected).toBe(true);
    const manual = await fetch(`${url}/redirect`, { redirect: 'manual' });
    expect(manual.status).toBe(302);
    await expect(
      fetch(`${url}/redirect`, { redirect: 'error' }),
    ).rejects.toThrow('Redirects are not allowed');
  });

  it('answers without a body when the status has none', async () => {
    const res = await fetch(`${url}/empty`);
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('streams an event stream as it comes', async () => {
    const controller = new AbortController();
    const res = await fetch(`${url}/sse`, { signal: controller.signal });
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe('data: first\n\n');
    controller.abort();
  });

  it('rejects with the reason of an aborted signal', async () => {
    const reason = new Error('stop');
    const promise = fetch(`${url}/slow`, { signal: AbortSignal.abort(reason) });
    await expect(promise).rejects.toBe(reason);
  });

  it('leaves other bodies to the default fetch', async () => {
    const form = new FormData();
    form.append('a', '1');
    const res = await fetch(`${url}/form`, { method: 'POST', body: form });
    expect(await res.text()).toMatch(/^multipart\/form-data; boundary=/);
  });
});
