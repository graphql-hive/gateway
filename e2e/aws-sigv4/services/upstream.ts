import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { awsVerify, rawBodyFromStream, rawBodyFromVerify } from 'aws4-express';
import express from 'express';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const app = express();

// whenever you may need to get original body string and you case
// when json parser u may use like this
app.use(
  express.json({
    type: '*/*',
    verify: rawBodyFromVerify,
  }),
);

// or when json parser u may use like this
app.use(
  express.raw({
    type: '*/*',
    verify: rawBodyFromVerify,
  }),
);

// or when url encoded body u may use like this
app.use(
  express.urlencoded({
    extended: true,
    type: '*/*',
    verify: rawBodyFromVerify,
  }),
);

// or events on when json parser u may use like this
app.use(rawBodyFromStream);

// main handler to authorization incomming requests:
app.use(
  awsVerify({
    enabled(req) {
      if (req.headers['x-request-id']) {
        return true;
      }
      return false;
    },
    secretKey(message, _req, res) {
      if (message.accessKey !== process.env['AWS_ACCESS_KEY_ID']) {
        res.status(403).send({
          errors: [
            {
              message: `Expected access key ${process.env['AWS_ACCESS_KEY_ID']}, but got ${message.accessKey}`,
            },
          ],
        });
        return;
      }
      const secretKey = process.env['AWS_SECRET_ACCESS_KEY'];
      if (!secretKey) {
        res.status(403).send({
          errors: [
            {
              message: `AWS_SECRET_ACCESS_KEY is required`,
            },
          ],
        });
        return;
      }
      return secretKey;
    },
  }),
);

const yoga = createYoga({
  schema: buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        hello: String
      }
    `),
    resolvers: {
      Query: {
        hello: () => 'world',
      },
    },
  }),
});

app.use(yoga.graphqlEndpoint, yoga);

const opts = Opts(process.argv);

const port = opts.getServicePort('upstream', true);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
