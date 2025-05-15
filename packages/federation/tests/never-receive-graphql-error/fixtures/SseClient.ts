import { EventEmitter } from 'events';
import { Client, createClient, ExecutionResult } from 'graphql-sse';
import { getTestPort } from './TestEnvironment';

interface Subscribe<T> {
  waitForNext: () => Promise<ExecutionResult<T>>;
  waitForComplete: () => Promise<void>;
  dispose: () => void;
}

export class SseClient {
  private readonly client: Client;

  constructor() {
    this.client = createClient({
      url: `http://localhost:${getTestPort()}/graphql`,
      retryAttempts: 0,
    });
  }

  public async subscribe<T extends Record<string, any> = Record<string, any>>(
    query: string,
  ): Promise<Subscribe<T>> {
    const emitter = new EventEmitter();
    const results: ExecutionResult<T>[] = [];
    let completed = false;

    emitter.once('next', () => emitter.emit('connected'));

    const dispose = this.client.subscribe<T, Record<string, unknown>>(
      { query },
      {
        next: (value) => {
          results.push(value);
          emitter.emit('next');
        },
        error: (error) => {
          console.error(error);
          emitter.emit('error', error);
          emitter.removeAllListeners();
        },
        complete: () => {
          completed = true;
          emitter.emit('complete');
          emitter.removeAllListeners();
        },
      },
      {
        connected: () => {
          emitter.emit('connected');
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

  public dispose(): void {
    return this.client.dispose();
  }
}
