import fs from 'fs';
import path from 'path';
import { Opts } from '@internal/testing';
import { createYoga, createSchema } from 'graphql-yoga';
import express from 'express';

const app = express();
const opts = Opts(process.argv);
const port = opts.getServicePort('Graph');

const schemaPath = path.join(__dirname, 'Graph.graphql');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');

app.use(
  '/graphql',
  createYoga({
    schema: createSchema({
      typeDefs: schemaContent,
      resolvers: {
        hello: () => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve('Hello world!');
            }, 20_000);
          });
        },
      }
    })
  })
);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}/graphql`);
});
