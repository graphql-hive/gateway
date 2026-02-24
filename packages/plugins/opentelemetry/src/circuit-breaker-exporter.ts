import type { CircuitBreakerConfiguration } from '@graphql-hive/core';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import CircuitBreaker from 'opossum';

const defaultCircuitBreakerConfiguration: CircuitBreakerConfiguration = {
  errorThresholdPercentage: 50,
  volumeThreshold: 10,
  resetTimeout: 30_000,
};

export class CircuitBreakerExporter implements SpanExporter {
  private circuitBreaker: CircuitBreaker<[ReadableSpan[]], ExportResult>;
  constructor(
    private _exporter: SpanExporter,
    config: CircuitBreakerConfiguration = defaultCircuitBreakerConfiguration,
  ) {
    this.circuitBreaker = new CircuitBreaker(
      (spans: ReadableSpan[]) =>
        new Promise((resolve, reject) => {
          this._exporter.export(spans, (result) => {
            if (result.error) {
              reject(result.error);
            } else {
              resolve(result);
            }
          });
        }),
      {
        ...defaultCircuitBreakerConfiguration,
        ...config,
      },
    );
  }
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.circuitBreaker
      .fire(spans)
      .then(resultCallback)
      .catch((error) => {
        // When the circuit is open, we should not report a failure to the SDK.
        // The SDK would retry, which is what we want to avoid.
        if (error?.code === 'EOPENBREAKER') {
          // We successfully dropped the spans, so we can report success.
          return resultCallback({ code: ExportResultCode.SUCCESS });
        }
        return resultCallback({ code: ExportResultCode.FAILED, error });
      });
  }
  shutdown(): Promise<void> {
    return this._exporter
      .shutdown()
      .finally(() => this.circuitBreaker.shutdown());
  }
}
