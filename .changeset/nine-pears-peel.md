---
'@graphql-mesh/plugin-opentelemetry': minor
---

Add a configurable sampling rate. The sampling strategy relies on a determenistic probability sampler with a parent priority, meaning that if a span is sampled, all its children spans will also be sampled.
