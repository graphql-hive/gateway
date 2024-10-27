import { createServer } from 'http';
import { Opts } from '@internal/testing';

const port = Opts(process.argv).getServicePort('cdn', true);

createServer((_req, res) => {
  res.setHeader('content-type', 'application/graphql');
  res.end(/* GraphQL */ `
    type Query {
      hello: String!
    }
  `);
}).listen(port, () => {
  console.log(`CDN service listening on http://localhost:${port}`);
});
