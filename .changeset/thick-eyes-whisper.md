---
'@graphql-hive/gateway': major
---

Remove mocking plugin from Hive Gateway built-ins

There is no need to provide the `useMock` plugin alongside Hive Gateway built-ins. Not only is the mock plugin 2MB in size (minified), but installing and using it is very simple.
