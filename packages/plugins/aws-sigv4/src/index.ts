import { STS } from '@aws-sdk/client-sts';
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
  serviceName?: string;
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
  /**
   * An identifier for the assumed role session.
   *
   * @default process.env.AWS_ROLE_ARN
   */
  roleArn?: string;
  /**
   * The Amazon Resource Names (ARNs) of the IAM managed policies that you want to use as
   * managed session policies. The policies must exist in the same account as the role.
   *
   * @default process.env.AWS_IAM_ROLE_SESSION_NAME
   */
  roleSessionName?: string;
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
    async onFetch({ url, options, setURL, setOptions, executionRequest }) {
      const subgraphName = (executionRequest &&
        subgraphNameByExecutionRequest.get(executionRequest))!;
      if (!isBufferOrString(options.body)) {
        return;
      }
      const factoryResult = optionsFactory({ url, options, subgraphName });
      if (factoryResult === false) {
        return;
      }
      let signQuery = false;
      let accessKeyId: string | undefined =
        process.env['AWS_ACCESS_KEY_ID'] || process.env['AWS_ACCESS_KEY'];
      let secretAccessKey: string | undefined =
        process.env['AWS_SECRET_ACCESS_KEY'] || process.env['AWS_SECRET_KEY'];
      let sessionToken: string | undefined = process.env['AWS_SESSION_TOKEN'];
      let service: string | undefined;
      let region: string | undefined;
      let roleArn: string | undefined = process.env['AWS_ROLE_ARN'];
      let roleSessionName: string | undefined =
        process.env['AWS_IAM_ROLE_SESSION_NAME'];
      if (typeof factoryResult === 'object' && factoryResult != null) {
        signQuery = factoryResult.signQuery || false;
        accessKeyId =
          factoryResult.accessKeyId ||
          process.env['AWS_ACCESS_KEY_ID'] ||
          process.env['AWS_ACCESS_KEY'];
        secretAccessKey =
          factoryResult.secretAccessKey ||
          process.env['AWS_SECRET_ACCESS_KEY'] ||
          process.env['AWS_SECRET_KEY'];
        sessionToken =
          factoryResult.sessionToken || process.env['AWS_SESSION_TOKEN'];
        roleArn = factoryResult.roleArn;
        roleSessionName = factoryResult.roleSessionName;
        service = factoryResult.serviceName;
        region = factoryResult.region;
      }
      if (roleArn && roleSessionName) {
        const sts = new STS({
          region,
        });
        const { Credentials } = await sts.assumeRole({
          RoleArn: roleArn,
          RoleSessionName: roleSessionName,
        });
        accessKeyId = Credentials?.AccessKeyId || accessKeyId;
        secretAccessKey = Credentials?.SecretAccessKey || secretAccessKey;
        sessionToken = Credentials?.SessionToken || sessionToken;
      }
      const parsedUrl = new URL(url);
      const aws4Request: AWS4Request = {
        host: parsedUrl.host,
        method: options.method,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        body: options.body,
        headers: options.headers,
        signQuery,
        service,
        region,
      };
      const modifiedAws4Request = aws4.sign(aws4Request, {
        accessKeyId,
        secretAccessKey,
        sessionToken,
      });
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
