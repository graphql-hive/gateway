---
'@graphql-hive/gateway': minor
---

Send subgraph requests with undici in Node

In Node, unless a `fetchAPI.fetch` is configured, the gateway CLI sends requests with undici's `request` instead of `node:http` behind `@whatwg-node/fetch`, which costs a lot less CPU per subgraph request. It answers with the same `Response` and works like before: asks for compressed responses and decompresses them, follows redirects as asked, sends `user-agent: node` and rejects with the reason of an aborted signal. Event streams and multipart responses stay streamed. A `Request`, a body other than a string or bytes, or a URL other than `http(s)` is still sent with `@whatwg-node/fetch`.
