import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { subgraphNameByExecutionRequest } from '@graphql-mesh/fusion-runtime';
import aws4, { type Request as AWS4Request } from 'aws4';

function isBufferOrString(body: unknown): body is Buffer | string {
  return typeof body === 'string' || globalThis.Buffer?.isBuffer(body);
}

export interface AWSSignv4PluginOptions {
  /**
   * To sign the query instead of adding an Authorization header
   * @default false
   */
  signQuery?: boolean;
  /**
   * Service name to use when signing the request.
   * By default, it is inferred from the hostname.
   */
  service?: string;
  /**
   * Region name to use when signing the request.
   * By default, it is inferred from the hostname.
   */
  region?: string;
  /**
   * ACCESS_KEY_ID
   * @default process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY
   */
  accessKeyId?: string;
  /**
   * AWS_SECRET_ACCESS_KEY
   * @default process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY
   */
  secretAccessKey?: string;
  /**
   * AWS_SESSION_TOKEN
   * @default process.env.AWS_SESSION_TOKEN
   */
  sessionToken?: string;
}

export interface AWSSignv4PluginOptionsFactoryOptions {
  url: string;
  options: RequestInit;
  subgraphName: string;
}

export type AWSSignv4PluginOptionsFactory = (
  factoryOptions: AWSSignv4PluginOptionsFactoryOptions,
) => AWSSignv4PluginOptions | undefined | false | true;

export function useAWSSigv4<TContext extends Record<string, any>>(
  opts?: AWSSignv4PluginOptions | AWSSignv4PluginOptionsFactory,
): GatewayPlugin<TContext> {
  const optionsFactory = typeof opts === 'function' ? opts : () => opts || true;
  return {
    onFetch({ url, options, setURL, setOptions, executionRequest }) {
      const subgraphName = (executionRequest &&
        subgraphNameByExecutionRequest.get(executionRequest))!;
      if (!isBufferOrString(options.body)) {
        return;
      }
      const factoryResult = optionsFactory({ url, options, subgraphName });
      if (factoryResult === false) {
        return;
      }
      let factoryResultObject: AWSSignv4PluginOptions | undefined;
      if (typeof factoryResult === 'object' && factoryResult != null) {
        factoryResultObject = factoryResult;
      }
      const parsedUrl = new URL(url);
      const aws4Request: AWS4Request = {
        host: parsedUrl.hostname,
        method: options.method,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        body: options.body,
        headers: options.headers,
        ...(factoryResultObject || {}),
      };
      const modifiedAws4Request = aws4.sign(aws4Request, factoryResultObject);
      setURL(
        `${parsedUrl.protocol}//${modifiedAws4Request.host}${modifiedAws4Request.path}`,
      );
      setOptions({
        ...options,
        method: modifiedAws4Request.method,
        headers: modifiedAws4Request.headers as Record<string, string>,
        body: modifiedAws4Request.body,
      });
    },
  };
}
