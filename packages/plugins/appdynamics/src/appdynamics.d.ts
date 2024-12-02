declare module 'appdynamics' {
  import type { ClientRequest } from 'node:http';

  export function startTransaction(
    correlationInfo?: string | HTTPRequest | CorrelationHeader | null,
    cb?: (tx: TimePromise) => void,
  ): TimePromise;

  export function getTransaction(req: ClientRequest): TimePromise;

  export function parseCorrelationInfo(
    source: string | HTTPRequest,
  ): CorrelationHeader;

  /**
   * Transaction handle
   */
  export interface TimePromise {
    resume(): void;
    start(cb: (tp: TimpePromise) => void);
    markError(err: Error, statusCode?: number): void;
    end(err?: Error, statusCode?: number): void;
    startExitCall(exitCallInfo: ExitCallInfo): ExitCall;
    endExitCall(exitCall: ExitCall): void;
    createCorrelationInfo(exitCall, doNotResolve?: boolean): CorrelationHeader;
    addSnapshotData(key: string, value: unknown): void;
    addAnalyticsData(key: string, value: unknown): void;

    // callbacks
    beforeExitCall(exitCall: ExitCall): ExitCall;
  }

  export type HTTPRequest = {
    headers?: {
      singularityheader?: string;
    };
  };

  export type CorrelationHeader = {
    businessTransactionName: string;
    headers: {
      singularityheader: string;
    };
  };

  export type ExitCall = {
    exitType: 'EXIT_HTTP';
    /**
     * @default "HTTP"
     */
    backendName: string;
    label: string;
    method: string;
    requestHeaders: Record<string, string>;
    responseHeaders: Record<string, string>;
    statusCode: number;
    category: 'read' | 'write';
    /**
     * URL of the request
     */
    command: string;
    identifyingProperties: {
      HOST: string;
      PORT: string;
    };
  };

  export const correlation: {
    HEADER_NAME: string;
  };
}
