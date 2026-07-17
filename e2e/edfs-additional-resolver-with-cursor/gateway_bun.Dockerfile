FROM gateway_e2e-bun

RUN bun i @nats-io/transport-node @nats-io/jetstream @whatwg-node/promise-helpers
