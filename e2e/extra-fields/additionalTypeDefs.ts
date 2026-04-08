export const additionalTypeDefs = /* GraphQL */ `
  extend type Foo {
    bar: Bar
      @resolveTo(
        sourceName: "bar"
        sourceTypeName: "Query"
        sourceFieldName: "bar"
      )
  }

  extend type Bar {
    foo: Foo
      @resolveTo(
        sourceName: "foo"
        sourceTypeName: "Query"
        sourceFieldName: "foo"
      )
  }
`;
