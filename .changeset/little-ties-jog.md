---
'@graphql-hive/plugin-opentelemetry': minor
'@graphql-hive/gateway-runtime': minor
---

Expose GraphQLError as OpenTelemetry Events.

Errors contains in the result of a graphql operation are now reported as standalone OpenTelemetry
Events (name `graphql.error`) instead of OpenTelemetry Exceptions.

This is aligned with the guidance of the Graphql OpenTelemetry working group.

It allows to add more graphql specific attributes to errors reported in a response:

- `message`: The error message
- `path`: The path in the operation document from which the error originated
- `locations`: The list of related locations in the document source
- `coordinate`: The schema coordinate of the resolver which is the source of the error

This brings the experimental support of the `coordinate` error attribute in the Yoga Runtime. For
security reason, this attribute is purposefully not serialized, to avoid leaking schema information
to clients.
