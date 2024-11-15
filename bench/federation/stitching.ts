import { getSubschemaForFederationWithSchema } from '@graphql-tools/federation';
import { stitchSchemas } from '@graphql-tools/stitch';
import * as accounts from './services/accounts';
import * as inventory from './services/inventory';
import * as products from './services/products';
import * as reviews from './services/reviews';

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
