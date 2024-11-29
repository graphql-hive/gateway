import os from 'node:os';
import { boolEnv } from '@internal/testing';
import { createTenv } from './tenv';

export type OTLPExporterType = 'http' | 'grpc';

export type JaegerTracesApiResponse = {
  data: Array<{
    traceID: string;
    spans: Array<{
      traceID: string;
      spanID: string;
      operationName: string;
      tags: Array<{ key: string; value: string; type: string }>;
    }>;
  }>;
};

export function createTjaeger(cwd: string) {
  const { gatewayRunner, container } = createTenv(cwd);
  return {
    async start(exporterType: OTLPExporterType = 'http') {
      const hostname =
        gatewayRunner === 'docker' || gatewayRunner === 'bun-docker'
          ? boolEnv('CI')
            ? '172.17.0.1'
            : 'host.docker.internal'
          : '0.0.0.0';

      const serviceName = `${exporterType}-${Math.random().toString(32).slice(2)}`;

      const jaeger = await container({
        name: `jaeger-${serviceName}`, // unique name
        image:
          os.platform().toLowerCase() === 'win32'
            ? 'johnnyhuy/jaeger-windows:1809'
            : 'jaegertracing/all-in-one:1.56',
        env: {
          COLLECTOR_OTLP_ENABLED: 'true',
        },
        containerPort: 4318,
        additionalContainerPorts: [16686, 4317],
        healthcheck: ['CMD-SHELL', 'wget --spider http://0.0.0.0:14269'],
      });

      return {
        env: {
          OTLP_EXPORTER_TYPE: exporterType,
          OTLP_EXPORTER_URL:
            exporterType === 'http'
              ? `http://${hostname}:${jaeger.port}/v1/traces`
              : `http://${hostname}:${jaeger.additionalPorts[4317]}`,
          OTLP_SERVICE_NAME: serviceName,
        },
        async getTraces() {
          const res = await fetch(
            `http://0.0.0.0:${jaeger.additionalPorts[16686]}/api/traces?service=${serviceName}`,
          );
          return res.json() as unknown as JaegerTracesApiResponse;
        },
      };
    },
  };
}
