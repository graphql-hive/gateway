import type { CircuitBreakerConfiguration } from '@graphql-hive/core';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import CircuitBreaker from 'opossum';

const defaultCircuitBreakerConfiguration: CircuitBreakerConfiguration = {
  // each failed fire already represents 5 HTTP retries, so 3 fires = 15 failed HTTP calls, which
  // is a very clear signal. since each "fire" is already 5 retries, 3 fires = strong signal
  // the endpoint is down
  volumeThreshold: 3,

  // tolerates 1 transient failure in 3 before tripping; avoids opening on a single issue
  // any failure rate at or above 80% should open the circuit.
  // a single transient failure out of 3 = 33%, won't trip.
  // 2 out of 3 = 66%, won't trip.
  // 3 out of 3 = 100%, will trip.
  errorThresholdPercentage: 80,

  // after opening, wait 60s before trying again. 30s (current default) is too short - if the
  // endpoint is down, it's likely down for at least a minute. no point hammering it sooner.
  // btw, 30s is the BatchSpanProcessor export timeout exactly, which means the circuit could
  // immediately time out again in HALF_OPEN before getting a real result if it were below or at
  // 30s; 60s gives it room to breathe
  resetTimeout: 60_000,
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

    if (this._exporter.forceFlush) {
      this.forceFlush = () => this._exporter.forceFlush!();
    }
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
  forceFlush?: () => Promise<void>;
  shutdown(): Promise<void> {
    this.circuitBreaker.shutdown();
    return this._exporter.shutdown();
  }
}
