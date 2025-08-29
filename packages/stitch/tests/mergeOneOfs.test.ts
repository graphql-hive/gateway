import { stitchSchemas } from '@graphql-tools/stitch';
import { buildSchema, printSchema } from 'graphql';
import { expect, it } from 'vitest';

it('should merge @oneOf directives', () => {
  const subschemaSdl = /* GraphQL */ `
type Query {
  findPerson(in: FindPersonInput): Person
  findPersonById(id: String): Person @deprecated(reason: "use findPerson")
}

type Person {
  Name: String
  ID: String
}

input FindPersonInput @oneOf {
  byId: String
  byName: String
}
`.trim();
  const subschema = buildSchema(subschemaSdl);
  const gatewaySchema = stitchSchemas({
    subschemas: [{ schema: subschema }],
  });
  expect(printSchema(gatewaySchema)).toBe(subschemaSdl);
});
