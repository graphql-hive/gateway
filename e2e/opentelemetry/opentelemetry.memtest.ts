import { Container, createExampleSetup, createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';
import { beforeAll, describe } from 'vitest';

const cwd = __dirname;

const { gateway, container } = createTenv(cwd);
const { supergraph, query } = createExampleSetup(cwd);

(['grpc', 'http'] as const).forEach((OTLP_EXPORTER_TYPE) => {
  describe(`OpenTelemetry ${OTLP_EXPORTER_TYPE} exporter`, () => {
    let jaeger: Container;
    beforeAll(async () => {
      jaeger = await container({
        name: `jaeger-${OTLP_EXPORTER_TYPE}`,
        image: 'jaegertracing/all-in-one:1.56',
        env: {
          COLLECTOR_OTLP_ENABLED: 'true',
        },
        containerPort: 4318,
        additionalContainerPorts: [16686, 4317],
        healthcheck: ['CMD-SHELL', 'wget --spider http://0.0.0.0:14269'],
      });
    });
    const jaegerUrls = {
      get http() {
        return `http://0.0.0.0:${jaeger.port}/v1/traces`;
      },
      get grpc() {
        return `http://0.0.0.0:${jaeger.additionalPorts[4317]}`;
      },
    };

    memtest(
      {
        cwd,
        query,
      },
      async () =>
        gateway({
          supergraph: await supergraph(),
          env: {
            MEMTEST: 1,
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: jaegerUrls[OTLP_EXPORTER_TYPE],
            OTLP_SERVICE_NAME: `memtest-${OTLP_EXPORTER_TYPE}`,
          },
        }),
    );
  });
});
