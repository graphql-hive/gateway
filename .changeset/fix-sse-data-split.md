---
'@graphql-tools/executor-http': patch
---

Fix SSE data parsing when JSON payload contains literal "data:" substrings

The SSE event parser used `msg.split('data:')` to extract the data field, which
incorrectly splits on `data:` substrings inside the JSON payload (e.g., OAuth
scopes like `file_metadata:read`, data URIs like `data:image/png`). This caused
`JSON.parse` to fail with "Unterminated string in JSON" errors.

The fix uses line-based parsing per the SSE spec: split on newlines first, then
find the line starting with `data:`.
