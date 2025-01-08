import fs from 'fs';
import path from 'path';
import express from 'express';
import { graphqlHTTP } from 'express-graphql';
import { buildSchema } from 'graphql';
import { Opts } from '@internal/testing';

const app = express();
const opts = Opts(process.argv);
const port = opts.getServicePort('Graph');

const schemaPath = path.join(__dirname, 'Graph.graphql');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

const root = {
  hello: () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('Hello world!');
      }, 20_000);
    });
  },
};

app.use(
  '/graphql',
  graphqlHTTP({
    schema: buildSchema(schemaContent),
    rootValue: root,
    graphiql: true,
  }),
);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}/graphql`);
});
