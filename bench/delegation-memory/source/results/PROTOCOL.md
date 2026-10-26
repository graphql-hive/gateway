# Source-built PR verification (predeclared)

Final integration amendment, before new trials: upstream main advanced to 2b0aa18b4a3f966d601728370cee9a8c28a2bc2a with delegate/stitch fixes. Merge that base into the candidate, refresh identical dependencies, rebuild both sides, and repeat 25MB3pairs then 50MB5pairs under the same gates/guards. Retain the original 534d5f5 series separately; final claims will use the updated-base series. Both sides use the new main lockfile. No measured runs overlap the integration tests or builds.

Before larger trials: the source pilot base uses ~735MB RSS at25MB. Linear100MB extrapolation exceeds the2.5GiB RSS guard. Amend confirmation to50MB5pairs, before any50MB trials. Keep guard unchanged; do not attempt100/150 unless later measured scaling supports headroom. No claim of100/150 source-build performance from these smaller cases.

Compare base 534d5f5352a0f726445db543d19fea90ef5ecfc3 with the PR implementation. Build both changed packages with the same compiler and dependencies; use the source-built gateway runtime and unchanged workspace dependencies on both sides. The runner verifies that the selected delegate/HTTP builds were actually loaded. No executor overlays or ballast.

Serial fresh-process AB/BA pairs, Node24.19.0 Windows x64, old-space2813MiB/semi16MiB. Tiny warmup then forced-GC idle; request-added heap is maximum observed main-isolate checkpoint minus that run's idle. RSS is process lifetime including worker/setup. Exact byte counts/SHA256. Observer/profilers off. Guard2.5GiB RSS/3GiBfree; launch6.5GBfree; timeout240s. Stop on a guard/failure rather than label it OOM.

25MB pilot3pairs, then100MB confirmation5pairs if pilot improves memory without >3%median CPU/time regression. 150MB validation3pairs only if estimated headroom is safe. At100MB report gateway-only heap/RSS, require >=4/5 improving pairs and <3% median CPU/elapsed regression. >30% is the user's threshold for calling a further memory opportunity substantial, not a prerequisite for publishing the already accepted PR. Keep all attempts. No profiling/test/build workloads overlap measured pairs.
