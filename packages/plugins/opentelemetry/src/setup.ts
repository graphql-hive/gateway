// This must be run first. Node uses patching on implementations to inject telemetry so must run before the packages
// are instantiated.
import * as api from '@opentelemetry/api';
import { propagation } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { SDK_INFO } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {Resource} from "@opentelemetry/resources";
import {
    ATTR_SERVICE_NAME,
    ATTR_TELEMETRY_SDK_LANGUAGE, ATTR_TELEMETRY_SDK_VERSION
} from "@opentelemetry/semantic-conventions";
import {OTLPTraceExporter} from "@opentelemetry/exporter-trace-otlp-grpc";

const contextManager = new AsyncLocalStorageContextManager().enable();
api.context.setGlobalContextManager(contextManager);

const exporter = new OTLPTraceExporter({
    url: "todo:configuration",
})

const provider = new NodeTracerProvider({
    resource: new Resource({
        [ATTR_SERVICE_NAME]: "hive-gateway",
        // [ATTR_SERVICE_VERSION]: 1,
        [ATTR_TELEMETRY_SDK_LANGUAGE]: SDK_INFO[ATTR_TELEMETRY_SDK_LANGUAGE],
        [ATTR_TELEMETRY_SDK_VERSION]: SDK_INFO[ATTR_TELEMETRY_SDK_VERSION],
    }),
    spanProcessors: [
        new BatchSpanProcessor(exporter, {
            maxQueueSize: 8192,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 100,
            exportTimeoutMillis: 30_000,
        }),
    ]
});

propagation.setGlobalPropagator(
    new CompositePropagator({
        propagators: [new W3CTraceContextPropagator()],
    }),
);

api.trace.setGlobalTracerProvider(provider);

provider.register();

registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
        new DnsInstrumentation(),
        new HttpInstrumentation({}),
        new GrpcInstrumentation(),
    ],
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    // eslint-disable-next-line no-console
    process.on(signal, () => provider.shutdown().catch(console.error));
}
