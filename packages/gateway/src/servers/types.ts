import type { Logger } from '@graphql-hive/logger';

export interface ServerConfig {
  /**
   * Host to listen on.
   *
   * @default '127.0.0.1' on Windows, otherwise '0.0.0.0'
   */
  host?: string;
  /**
   * Port to listen on.
   *
   * @default 4000
   */
  port?: number;
  /**
   * SSL Credentials for the HTTPS Server.
   *
   * If this is provided, Gateway will be over secure HTTPS instead of unsecure HTTP.
   */
  sslCredentials?: ServerConfigSSLCredentials;
  /**
   * The size of the HTTP headers to allow
   *
   * @default 16384
   */
  maxHeaderSize?: number;
  /**
   * Whether to disable setting up a WebSocket server.
   *
   * @default false
   */
  disableWebsockets?: boolean;
  /**
   * Sets the maximum time in milliseconds allowed to receive the
   * _entire_ request from the client (headers + body). It does not limit
   * the total duration of the request lifecycle - once the body is fully
   * received, this timer is cancelled and your handler can run indefinitely.
   *
   * For a hard end-to-end deadline, use {@link requestDeadline} instead.
   *
   * @default 300000 (5 minutes)
   */
  requestTimeout?: number;
  /**
   * Sets a hard end-to-end time limit in milliseconds for the
   * entire request lifecycle — from connection to response completion.
   *
   * Unlike {@link requestTimeout}, this timer is NOT cancelled when the body
   * is received; it runs until the response is finished or the socket
   * is destroyed.
   */
  requestDeadline?: number;
  /**
   * Sets the number of milliseconds to wait before timing out a
   * connection due to inactivity in Node's HTTP server
   *
   * This setting has no effect in Bun, use {@link requestTimeout} instead.
   *
   * @default "Node's default (5 seconds)"
   */
  keepAliveTimeout?: number;
}

export interface ServerConfigSSLCredentials {
  key_file_name?: string;
  cert_file_name?: string;
  ca_file_name?: string;
  passphrase?: string;
  dh_params_file_name?: string;
  ssl_ciphers?: string;
  ssl_prefer_low_memory_usage?: boolean;
}

export interface ServerForRuntimeOptions extends ServerConfig {
  log: Logger;
}
