# Source-built base versus PR

This comparison isolates the gateway PR. Base is
`534d5f5352a0f726445db543d19fea90ef5ecfc3`; candidate implements the same source
changes as `97a8a3d`, with additional regression tests and comments. Both use
the same dependency installation and built gateway runtime. Only the built
delegate and HTTP-executor entry points differ, and the harness asserts that
both selected modules were loaded. **No GraphQL Tools executor patch is used.**

## Five fresh-process pairs, 50 MB response

| Metric                           | Base median | PR median | Median paired reduction | Improving pairs |
| -------------------------------- | ----------: | --------: | ----------------------: | --------------: |
| Idle heap                        |    32.79 MB |  32.78 MB |                   0.03% |             3/5 |
| Maximum observed heap checkpoint |  1139.17 MB | 740.12 MB |                  34.76% |             5/5 |
| Request-added heap               |  1106.38 MB | 707.31 MB |              **35.80%** |             5/5 |
| Process-lifetime peak RSS        |  1312.84 MB | 926.43 MB |              **29.43%** |             5/5 |
| CPU                              |     18.58 s |   13.06 s |                  29.69% |             5/5 |
| Elapsed                          |     13.35 s |    9.42 s |                  26.85% |             5/5 |
| Released, post-GC heap           |    30.68 MB |  30.68 MB |                  0.008% |             3/5 |

Paired request-added heap reductions range 34.88–36.52%; RSS reductions
29.35–32.19%. All responses match exactly 50,000,000 bytes and SHA-256
`e81bdf4ba606a7cdb8d45169257102601faaa1490186b4f97c2a91dd1a96e806`.
These results meet the >30% request-added heap target, but do not establish
a >30% median RSS reduction. They compare this PR with its unmodified base;
they are not another 35.8% improvement over the earlier optimized baseline.

## Method and limits

Windows x64, Node 24.19.0 / V8 13.6.233.17-node.51. Source-built runtime 2.13.0,
delegate 12.3.0, executor-http 3.5.0; the repository yarn.lock fixes dependencies.
Old-space 2813 MiB, semi-space 16 MiB, no synthetic ballast. One dense
single-subgraph request per fresh process, tiny warmup followed by forced-GC
idle baseline, alternating AB/BA order, no profilers or concurrent builds/tests.
Request-added heap is each trial's observed peak minus its own idle value.
Checkpoints may miss short peaks; RSS includes startup and the guard worker.
This measures Fetch response consumption, not real socket backpressure.

A three-pair 25 MB pilot preceded confirmation. Its baseline RSS (~735 MB)
made extrapolation to 100 MB exceed the 2.5 GiB guard. Before running larger
requests, the protocol was amended to 50 MB / five pairs. No 100/150 MB
source-built claims are made. The initial pilot launcher failed before request
execution because its module-resolution hook recursively invoked itself;
that setup failure is excluded, and the corrected full pilot is retained.
This result does not establish performance under real multi-subgraph traffic,
other engines, or high concurrency. Correctness coverage includes those paths
where feasible; performance generalization requires separate measurements.

## Reproduction

Build the PR checkout and a separate checkout of the base with the same Node,
Yarn and lockfile. Run `yarn install --immutable --mode=skip-build` in each.
In the PR checkout, run:

```sh
yarn workspaces foreach -R --from @graphql-hive/gateway-runtime --from @graphql-mesh/transport-http -t run build
```

In the base checkout, build `@graphql-tools/delegate` and
`@graphql-tools/executor-http` with `yarn workspace <name> build`. Other workspace
dependencies are shared from the PR installation during the comparison; none
of their source changed in this PR. The original local run used a node_modules
junction to that installation and invoked its pkgroll binary for both builds.

Generate the exact fixture with the frozen generator, then run from the PR root:

```sh
node bench/delegation-memory/repro/outputs/bench/fixture.mjs 50000000 /path/to/dense-50000000.json 8 1
node bench/delegation-memory/source/run.mjs /path/to/base /path/to/dense-50000000.json /path/to/new-results 50000000 5 confirmation
```

The launcher requires 6.5 GB free memory, enforces 2.5 GiB RSS / 3 GiB free-memory
guards and a 240-second timeout, checks build/source fingerprints before each
trial, and refuses to replace existing results. Start at 25 MB / three pairs.
Keep all measurements serial. Results include raw per-run baselines, peaks,
CPU/time, response hashes and selected build paths, with local prefixes redacted.

Source regression validation: 603 tests pass across delegate, HTTP executor,
stitching and batch-execution suites (two skipped, two TODOs; one skipped file).
The final async-merging test uses the source executor and passes after its type
annotations were tightened. Repository-wide TypeScript checking, changed-source
lint and ESM/CJS smoke tests pass. Upstream multi-version/platform CI remains
subject to maintainer approval of workflows from this fork.
