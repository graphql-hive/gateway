import { getSubschemaForFederationWithSchema } from '@graphql-tools/federation';
import { stitchSchemas } from '@graphql-tools/stitch';
import { accounts, inventory, products, reviews } from '@internal/e2e';

const services = [accounts, inventory, products, reviews];
export default Promise.all(
  services.map((service) =>
    getSubschemaForFederationWithSchema(service.schema),
  ),
).then((subschemas) =>
  stitchSchemas({
    subschemas: subschemas.map((subschema) => ({
      ...subschema,
      batch: false,
    })),
  }),
);
