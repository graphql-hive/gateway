# Source-built base versus PR

This final comparison isolates the gateway PR against upstream main
`2b0aa18b4a3f966d601728370cee9a8c28a2bc2a`, including its latest delegation/stitching fixes.
The candidate includes that base plus this PR's changes. Both sides use the same
new lockfile, compiler and built runtime; only delegate and HTTP-executor entry
points differ, and the harness asserts both selected modules were loaded.
**No GraphQL Tools executor patch is used.**

## Five fresh-process pairs, 50 MB response

| Metric                | Base median | PR median | Median paired reduction |
| --------------------- | ----------: | --------: | ----------------------: |
| Idle heap             |    32.80 MB |  32.79 MB |                   0.03% |
| Observed peak heap    |  1139.99 MB | 742.01 MB |                  34.75% |
| Request-added heap    |  1107.18 MB | 709.22 MB |                  35.78% |
| Peak RSS              |  1310.52 MB | 926.30 MB |                  29.36% |
| CPU                   |     19.00 s |   12.34 s |                  35.03% |
| Elapsed               |     14.07 s |    9.53 s |                  33.57% |
| Released post-GC heap |    30.69 MB |  30.68 MB |                   0.02% |

Every pair improves request-added heap, RSS, CPU and elapsed. Paired added-heap
reductions range 34.85–36.37%; RSS 29.15–29.67%.
All responses match exactly 50,000,000 bytes and SHA-256
`e81bdf4ba606a7cdb8d45169257102601faaa1490186b4f97c2a91dd1a96e806`.
Percentages are medians of paired reductions, not ratios of independent medians.
The request-added heap reduction exceeds 30%; the median RSS reduction does not.
This measures all PR changes against the unmodified base, not an additional
reduction beyond the earlier optimized implementation.

The current evidence is `results/main-pilot25.json` and
`results/main-confirm50{,.summary}.json`. The earlier `source-*` series against
534d5f5 is retained as historical evidence. After upstream advanced, dependencies,
source tests, typechecking and builds were refreshed before repeating the
25 MB pilot and 50 MB confirmation.

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

Source regression validation: 770 tests pass across delegate, HTTP executor,
stitching, batch execution, wrapping, and the updated federation-key tests
(four skipped, two TODOs; two skipped files).
The async-merging tests use the source executor. Repository-wide TypeScript checking, changed-source
lint and ESM/CJS smoke tests pass. Upstream multi-version/platform CI remains
subject to maintainer approval of workflows from this fork.
