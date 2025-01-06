FROM gateway_e2e_bun

RUN bun i @envelop/core @envelop/operation-field-permissions
