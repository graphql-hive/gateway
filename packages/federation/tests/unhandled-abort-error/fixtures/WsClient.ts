import { EventEmitter } from 'events';
import { setTimeout } from 'timers/promises';
import { Client, createClient, FormattedExecutionResult } from 'graphql-ws';
import { WebSocket } from 'ws';
import { getTestPort } from './TestEnvironment';

interface Subscribe<T> {
  waitForNext: () => Promise<FormattedExecutionResult<T>>;
  waitForComplete: () => Promise<void>;
  dispose: () => void;
}

export class WsClient {
  private readonly client: Client;

  constructor() {
    this.client = createClient({
      url: `http://localhost:${getTestPort()}/graphql`,
      webSocketImpl: WebSocket,
      retryAttempts: 0,
    });
  }

  public async subscribe<T extends Record<string, any> = Record<string, any>>(
    query: string,
  ): Promise<Subscribe<T>> {
    const emitter = new EventEmitter();
    const results: FormattedExecutionResult<T>[] = [];
    let completed = false;

    this.client.on('connected', async () => {
      /**
       * 'connected' event is just information about establishing a websocket connection,
       * so we adds a small delay to make sure that graphql subscription is really ready
       */
      await setTimeout(30);
      emitter.emit('connected');
    });

    const dispose = this.client.subscribe<T, Record<string, unknown>>(
      { query },
      {
        next: (value) => {
          results.push(value);
          emitter.emit('next');
        },
        error: (error) => {
          emitter.emit('error', error);
          emitter.removeAllListeners();
        },
        complete: () => {
          completed = true;
          emitter.emit('complete');
          emitter.removeAllListeners();
        },
      },
    );

    const subscribe: Subscribe<T> = {
      waitForNext: async () => {
        return new Promise((resolve) => {
          const done = () => resolve(results.shift()!);
          if (results.length) {
            done();
          } else {
            emitter.once('next', done);
          }
        });
      },
      waitForComplete: async () => {
        return new Promise((resolve) => {
          const done = () => resolve();
          if (completed) {
            done();
          } else {
            emitter.once('complete', done);
          }
        });
      },
      dispose,
    };

    return new Promise((resolve, reject) => {
      emitter.once('connected', () => resolve(subscribe));
      emitter.once('error', (error) => reject(error));
    });
  }

  public async dispose(): Promise<void> {
    return this.client.dispose();
  }
}
