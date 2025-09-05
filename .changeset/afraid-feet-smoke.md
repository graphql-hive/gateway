---
'@graphql-hive/pubsub': minor
---

Close the client connection on NATS and Redis pubsubs on dispose

This will gracefully dispose the pubsub on gateway shutdown. There is an option to disable this behaviour `noCloseOnDispose` and `noQuitOnDispose` respectively.
