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
   * Sets the number of milliseconds to wait before timing out a
   * connection due to inactivity in Node's HTTP server
   *
   * This setting has no effect in Bun, use {@link requestTimeout} instead.
   *
   * @default "Node's default (5 seconds)"
   */
  keepAliveTimeout?: number;
  /**
   * How long in milliseconds to wait for in-flight requests to complete after
   * receiving a termination signal before forcefully closing all connections.
   *
   * During this window the server stops accepting new connections and idles
   * out keep-alive connections, but lets active requests finish naturally.
   * After the timeout expires, {@link https://nodejs.org/api/http.html#servercloseallconnections | server.closeAllConnections()} is called
   * as a hard fuse so the process can exit.
   *
   * Set to `0` to skip the drain window and close all connections immediately.
   *
   * @default 30000 // (30 seconds)
   */
  gracefulShutdownTimeout?: number;
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
