# Hive Router runtime benchmark

Load tests the gateway on the Hive Router runtime (`@graphql-hive/router-runtime`) with the
subgraphs and operation of Hive Router's own benchmark, and checks that it answers like it should.

## What it needs

- [k6](https://k6.io), or its path in `K6`
- The benchmark subgraphs of [Hive Router](https://github.com/graphql-hive/router), listening on
  port 4200. Build them with `cargo build --release -p subgraphs` in that repository and put the
  binary at `./subgraphs` in this one, or its path in `SUBGRAPHS_BIN`.

## Running

```sh
node bench/router-runtime/run.mjs
node bench/router-runtime/run.mjs --scenarios dedup,no-dedup,entity-reuse --runs 3 --duration 60s
```

For every scenario and run it starts the gateway from source, checks its responses (see below),
warms it up, load tests it with `--vus` virtual users for `--duration`, and reports:

| column                          |                                                                |
| ------------------------------- | -------------------------------------------------------------- |
| `req/s`, `p50/p90/p99 ms`       | from k6                                                        |
| `CPU µs/req`                    | the gateway process's CPU time over the load test, per request |
| `GC µs/req`, `GCs/1k req`       | the gateway's GC pauses, per request                           |
| `heap MB (avg)`, `RSS MB (max)` | sampled every 250ms during the load test                       |

On a busy machine requests per second and latency move a lot, the CPU and GC time per request a lot
less. Compare runs made back to back.

## Scenarios

| scenario                |                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dedup`                 | the defaults. Every virtual user sends the same operation, so most subgraph requests are in flight at the same time as identical ones and are sent once, their responses shared                                       |
| `no-dedup`              | every request sends its own subgraph requests, so parsing and merging their responses is paid per request, like with traffic that rarely repeats an operation at the same time                                        |
| `entity-reuse`          | `entityReuse: true`, which copies entities already in the response instead of fetching them again. It needs a `@graphql-hive/router-query-planner` that emits `entityReuse`, with older ones it's the same as `dedup` |
| `entity-reuse-no-dedup` | both                                                                                                                                                                                                                  |

## Checking the responses

`diff.mjs` sends the operations in `operations/` and compares the responses with the ones recorded
in `expected/`. The runner does it before every load test, a gateway that answers differently isn't
worth measuring. It's also how a change to how the runtime stores, merges or writes data is checked.

```sh
node bench/router-runtime/diff.mjs check http://localhost:4000/graphql
node bench/router-runtime/diff.mjs record http://localhost:4000/graphql
```

The recorded responses are the same with the gateway's default executor, and `expected/bench.json`
is Hive Router's `bench/expected_response.json`.
