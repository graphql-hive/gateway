import { getSubschemaForFederationWithSchema } from '@graphql-tools/federation';
import { stitchSchemas } from '@graphql-tools/stitch';
import accounts from './services/accounts';
import inventory from './services/inventory';
import products from './services/products';
import reviews from './services/reviews';

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
