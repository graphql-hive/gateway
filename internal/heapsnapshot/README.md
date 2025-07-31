Fork of [ChromeDevTools/devtools-frontend/[...]/heap_snapshot_worker](https://github.com/ChromeDevTools/devtools-frontend/blob/dd60dc9c8add93357dcffcfc3e2a9e5a31864413/front_end/entrypoints/heap_snapshot_worker) without the browser requirements, adapted for Node, with utilities for quick setup, parsing and analysis.

Please make sure to build and commit any changes done inside this package to allow for "buildless" testing.

This is the only package in the project that is used built (it's not listed in `tsconfig.json#paths`) because it uses worker threads and they need Node-ready JavaScript.
