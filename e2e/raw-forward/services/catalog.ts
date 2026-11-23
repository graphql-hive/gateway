import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import {
  Kind,
  parse,
  valueFromASTUntyped,
  type OperationDefinitionNode,
} from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

// Only used to answer the federation SDL query of the composition.
const yoga = createYoga({
  schema: buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        catalog(first: Int, mode: String): Catalog!
        count: Int
      }

      type Catalog {
        id: ID!
        total: Int!
        products: [Product!]!
      }

      type Product {
        id: ID!
        name: String!
        price: Float!
      }
    `),
  }),
});

// Deterministic data for the root fields of a request, keyed by their response
// keys (the gateway aliases root fields when it merges them into one request).
// `catalog(first: N)` has N products. `catalog(mode: "bad")` breaks the schema
// (a string for an Int). Written with the whitespace of
// `JSON.stringify(value, null, 1)`, which the gateway serializer would not write.
// With COMPACT=1 it writes the bytes of the gateway serializer instead, so a
// benchmark moves the same number of bytes in every mode.
function answer(query: string, variables: Record<string, any>) {
  const [operation] = parse(query).definitions.filter(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION,
  );
  const data: Record<string, unknown> = {};
  for (const field of operation!.selectionSet.selections) {
    if (field.kind !== Kind.FIELD) {
      continue;
    }
    const args = Object.fromEntries(
      (field.arguments ?? []).map((arg) => [
        arg.name.value,
        valueFromASTUntyped(arg.value, variables),
      ]),
    );
    const key = field.alias?.value ?? field.name.value;
    if (field.name.value === 'count') {
      data[key] = 7;
    } else {
      const first = Number(args['first'] ?? 3);
      data[key] = {
        id: 'c1',
        total: args['mode'] === 'bad' ? 'abc' : first,
        products: Array.from({ length: first }, (_, i) => ({
          id: String(i + 1),
          name: `Product ${i + 1}`,
          price: i + 0.25,
        })),
      };
    }
  }
  return process.env['COMPACT']
    ? JSON.stringify({ data })
    : JSON.stringify({ data }, null, 1);
}

// With STATS=1, `GET /stats` answers how many queries the service answered
// (not counting the federation SDL query), so a benchmark can prove that the
// gateway made one subgraph request per client request.
let answered = 0;

createServer(async (req, res) => {
  if (process.env['STATS'] && req.method === 'GET' && req.url === '/stats') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ answered }));
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const { query = '', variables = {} } = raw ? JSON.parse(raw) : {};
  if (!query || query.includes('_service')) {
    const response = await yoga.fetch('http://localhost/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    });
    res.writeHead(response.status, { 'content-type': 'application/json' });
    res.end(await response.text());
    return;
  }
  answered++;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(answer(query, variables));
}).listen(opts.getServicePort('catalog'));
