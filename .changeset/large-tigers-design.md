---
'@graphql-tools/stitch': patch
---

Validation of required selection sets in the additional resolvers and type merging configuration

```ts
stitchSchemas({
    resolvers: {
        Book: {
            title: {
                // This resolver will throw an error if the selection set does not contain the `nonExistingFieldInBook` field
                // Stitching validates the selection set of the field resolver
                selectionSet: '{ nonExistingFieldInBook }',
                resolve() {

                }
            }
        }
    },
    merge: {
        Book: {
            // This configuration will throw an error if the selection set does not contain the `nonExistingFieldInBook` field
            // Stitching validates the selection set of the type merging configuration
            selectionSet: '{ nonExistingFieldInBook }',
            fields: {
                title: {
                    // This configuration will throw an error if the selection set does not contain the `nonExistingFieldInBook` field
                    // Stitching validates the selection set of the field configuration
                    selectionSet: '{ nonExistingFieldInBook }',
                    fieldName: 'title'
                }
            }
        }
    }
})
```