import type { Plugin as EnvelopPlugin } from '@envelop/core';
import {
  ConfigByField as RateLimiterConfigByField,
  Store,
  useRateLimiter,
  type Identity,
} from '@envelop/rate-limiter';
import { process } from '@graphql-mesh/cross-helpers';
import { stringInterpolator } from '@graphql-mesh/string-interpolation';
import type { KeyValueCache } from '@graphql-mesh/types';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';

class RateLimitingStore extends Store {
  constructor(private cache: KeyValueCache) {
    super();
  }

  getForIdentity(identity: Identity): Promise<number[]> | number[] {
    return handleMaybePromise(
      () =>
        this.cache.get(
          `rate-limit:${identity.contextIdentity}:${identity.fieldIdentity}`,
        ),
      (value) => value || [],
    );
  }

  setForIdentity(identity: Identity, timestamps: number[], windowMs: number) {
    return this.cache.set(
      `rate-limit:${identity.contextIdentity}:${identity.fieldIdentity}`,
      timestamps,
      { ttl: windowMs / 1000 },
    ) as Promise<void>;
  }
}

export type RateLimitingConfig = {
  /**
   * The type name that the following field belongs to
   */
  type: string;
  /**
   * The field of the type that the rate limit is applied to
   */
  field: string;
  /**
   * The maximum number of requests that can be made in a given time period
   */
  max: number;
  /**
   * The time period in which the rate limit is applied
   */
  ttl: number;
} & (
  | {
      /**
       * A template string that builds the rate limit identity key using `{args.argName}` or
       * `{context.propName}` dot-path interpolation. Takes precedence over `identifyFn` when set.
       *
       * Use this as a concise alternative to `identifyFn` when the identity is a single path.
       *
       * @example
       * identifier: "{args.id}"      // one bucket per argument value
       * identifier: "{context.ip}"   // one bucket per ip, no auth required
       */
      identifier: NonNullable<RateLimiterConfigByField['identifier']>;
    }
  | {
      /**
       * Override the identity function for this specific field. Takes precedence over the
       * plugin-level `identifyFn`.
       *
       * Unlike the plugin-level `identifyFn`, this is always called with the resolved field
       * argument values, making it suitable for unauthenticated rate limiting keyed on an argument.
       *
       * @example
       * identifyFn: (ctx, args) => String(args.id)
       */
      identifyFn: NonNullable<RateLimiterConfigByField['identifyFn']>;
    }
  | {
      /**
       * Field argument names whose values are included in the rate limit key, creating a separate
       * bucket per unique combination of values. Equivalent to `@rateLimit(identityArgs: [...])`.
       *
       * @example
       * identityArgs: ['id']  // one bucket per unique id argument value
       */
      identityArgs: NonNullable<RateLimiterConfigByField['identityArgs']>;
    }
);

export interface RateLimitingOptions {
  config: RateLimitingConfig[];
  cache: KeyValueCache;
}

export function useRateLimiting<T extends Record<string, unknown> = {}>({
  config,
  cache,
}: RateLimitingOptions): EnvelopPlugin<T> {
  const plugin = useRateLimiter({
    identifyFn: (context: any) =>
      context.headers?.authorization ||
      context.req?.socket?.remoteAddress ||
      context.req?.connection?.remoteAddress ||
      context.req?.ip ||
      context.headers?.['x-forwarded-for'] ||
      context.headers?.host ||
      'unknown',
    store: new RateLimitingStore(cache),
    interpolateMessage: (message, identifier, params) =>
      stringInterpolator.parse(message, {
        ...params,
        id: identifier,
        identifier,
      }),
    configByField: config.map((fieldConfig) => ({
      ...fieldConfig,
      window: `${fieldConfig.ttl}ms`,
      message: `Rate limit of "${fieldConfig.type}.${fieldConfig.field}" exceeded for "{id}"`,
      ...('identifier' in fieldConfig
        ? {
            identifyFn: (context, args) =>
              stringInterpolator.parse(fieldConfig.identifier, {
                context,
                env: process.env,
                args,
              }),
          }
        : {}),
    })),
  });

  // @ts-expect-error rate limiter plugin requires RateLimiterContext which the gateway doesnt need to provide
  // this is because of wrong typedefinitions (plugin wanted to say that it will EXTEND the context with
  // RateLimiterContext, but it wrongly requires it to be present)
  return plugin;
}
