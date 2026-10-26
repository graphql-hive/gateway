# Delegation allocation investigation

**Current PR validation:** the [source-built base-versus-PR comparison](source/README.md)
isolates the gateway changes with an unchanged executor. Five 50 MB pairs show
35.78% less request-added heap, 29.36% less RSS, 35.03% less CPU and 33.57% less
elapsed time. The older measurements below remain historical combination evidence.

This PR ports three accepted allocation changes into the gateway: skip the HTTP
result clone for an unshared query, use compact fresh null-prototype metadata
maps with a local reusable annotation descriptor, and avoid fake-promise wrappers
and continuation closures for synchronous composite completion.

The measurements below are from pinned published packages with loader overlays,
not a fresh benchmark of this source checkout. In particular, the memory series
also changed **GraphQL Tools executor result maps**, which live in another
repository. That executor change is included in the frozen reproducer and as a
companion patch, but is **not implemented by this gateway PR**. Do not attribute
the combination's memory improvement to gateway changes alone.

## Observed results

All MB are decimal. Percentages are medians of individual paired reductions,
not ratios of independent medians. Positive percentages mean improvement.

| Comparison                                                       | Pairs | RSS reduction | Observed heap reduction | CPU reduction | Elapsed reduction |
| ---------------------------------------------------------------- | ----: | ------------: | ----------------------: | ------------: | ----------------: |
| Compact maps + annotation versus previous fixes, 100 MB response |     7 |         9.85% |                  14.01% |         8.46% |             9.01% |
| Add inline composite completion, 100 MB response                 |     5 |         0.44% |                  -1.83% |        10.92% |            12.10% |
| Add inline composite completion, 150 MB response                 |     3 |         0.52% |                  -0.19% |        11.86% |            10.66% |

The first comparison uses 500 MB of deliberately retained synthetic heap ballast
and old-space 2813 MiB. Both sides already have shared-only cloning and fast
null-prototype maps; the candidate adds compact constructors and annotation
descriptor reuse. Heap medians were 1553.01 → 1335.19 MB and RSS medians were
2133.73 → 1923.38 MB. At old-space 1536 MiB, a separate 150 MB capacity series
changed from 3/3 explicit V8 OOMs to 3/3 matching responses, with the same ballast.
This does not establish an exact minimum heap requirement.

The inline-completion comparisons use **no ballast**, old-space 1536 MiB and
semi-space 16 MiB. Both sides include all preceding memory changes. At 100 MB,
CPU improved in 4/5 pairs and elapsed time in 5/5. At 150 MB, both improved in
2/3 pairs. Request-added heap regressed by 1.88% and 0.19% respectively, and
RSS changes did not meet the predeclared memory-win criterion. **The inline
change is a performance improvement, not an additional memory reduction.**

| 150 MB inline comparison, independent medians        |   Baseline |  Candidate |
| ---------------------------------------------------- | ---------: | ---------: |
| Post-warmup idle heap                                |   24.96 MB |   25.01 MB |
| Maximum observed heap checkpoint                     | 1250.78 MB | 1255.17 MB |
| Request-added heap (per-run peak minus its own idle) | 1225.82 MB | 1230.16 MB |
| After-release, post-GC heap                          |   22.88 MB |   22.92 MB |
| CPU time                                             |    51.11 s |    45.05 s |
| Elapsed time                                         |    34.03 s |    30.40 s |

The response itself does not account for the whole request increase. There are
6,428,568 nested result objects in this synthetic 150 MB workload. Parsing,
annotation, completion and serialization still dominate request-time memory.

## Measurement boundaries

- Windows x64, Node 24.19.0, V8 13.6.233.17-node.51. Pinned runtime 2.12.2,
  delegate 12.2.1, executor-http 3.4.1, executor 2.1.0, GraphQL 16.14.0 and
  delegate promise-helpers 1.3.2; `repro/outputs/bench/package-lock.json` fixes
  the complete tree. The source PR is based on a newer main with the same
  three targeted implementation files; package versions have advanced.
- Dense fixture: one subgraph, no joins, one request, three nested objects per
  row, one eight-character ASCII scalar per object. Real multi-subgraph and
  asynchronous workloads need independent performance validation.
- Fresh processes, tiny warmup, forced-GC idle baseline, serial paired trials,
  byte count and SHA-256 validation. Profilers and snapshots were off.
- Heap is the maximum observed main-isolate checkpoint, which may miss short
  peaks. RSS is process-lifetime high-water and includes setup and the guard
  worker. CPU includes GC and worker work. The Fetch-body consumption path is
  not the same as Node HTTP socket delivery.
- No pooling across ballast policies, response sizes or rejected candidates.
  Ranges and pair counts are observations, not confidence intervals. No claim
  of a universal memory floor or production speedup is made.
- Inline confirmation gates: at least 5% median CPU/elapsed improvement with
  4/5 improving pairs and less than 3% median heap/RSS regression. A memory win
  separately requires at least 5% reduction and 4/5 improving pairs. The 150 MB
  follow-up requires correct responses, positive median CPU/time improvement
  and less than 3% median memory regression.

## Reproduce the pinned inline comparison

Copy `repro` to a fresh directory outside this monorepo. Keep its `outputs`
hierarchy intact. Use Node 24.19.0 and npm from the same installation:

```sh
npm ci --prefix outputs/bench --ignore-scripts
node outputs/phase4/verify-inline.mjs
mkdir -p work/fixtures
node outputs/bench/fixture.mjs 25000000 work/fixtures/dense-25000000.json 8 1
node outputs/bench/prepare-dense-fixtures.mjs
node outputs/phase4/run-inline.mjs 25000000 3 reproduction-pilot
# Inspect the pilot and resource headroom before increasing the response size.
node outputs/phase4/run-inline.mjs 100000000 5 reproduction-confirm
node outputs/phase3/analyze.mjs outputs/phase4/reproduction-confirm.json
node outputs/phase4/decide.mjs outputs/phase4/reproduction-confirm.json confirm
```

Run only one measured child at a time. The runner requires 6.5 GB free at launch,
guards RSS at 2.5 GiB and free memory at 3 GiB, and times out after 240 seconds.
Do not weaken those guards to force a larger run. Use unique tags; the runner
refuses to replace prior aggregate evidence. The 150 MB follow-up uses
`150000000 3 reproduction-validation`. The focused verification runs 89 helper
compatibility cases and 89 executor/metadata/gateway/merging cases.

The reproduction contains the **corrected** inline candidate. Its earlier
version missed inherited fake-promise marker reads; those pilot/confirmation
runs are excluded. Accepted source fingerprints are preserved in
`repro/SHA256.json` and result JSON. Local filesystem prefixes in published
result JSON are replaced with `<workspace>`; measurements are unchanged.

The compact-result companion source patch targets GraphQL Tools commit
`f7b0beb39ab9db786b1886a6b2d29239f6c28a09` (executor 4.1.4); the measured
loader overlay targets installed executor 2.1.0. Do not equate a dependency
upgrade with applying that patch.

This PR excludes the rejected argument-map, reserved metadata-slot and bounded
HTTP-write experiments. Further execution/serialization redesign is separate work.

## Source-port validation

The delegate and HTTP executor unit suites pass, including new coverage for
shared-request isolation, fresh mutable metadata maps, reentrant annotation,
descriptor inheritance, synchronous/native/custom-thenable completion, and
inherited fake-promise markers. Repository-wide TypeScript checking and lint
of the three changed source files pass. Both packages and their workspace
dependencies build to ESM and CommonJS; smoke tests of both formats verify
synchronous completion and unshared/shared HTTP result handling.

The package build emits `extract-files/*.mts` resolution warnings in the
unchanged upload module, but exits successfully. Full upstream CI, deployment,
production schemas and concurrent performance are not validated here.
