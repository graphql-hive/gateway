import { readFileSync } from 'fs';
import { ApolloGateway } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const port = opts.getServicePort('apollo-gateway');

async function main() {
  const supergraph = process.env['SUPERGRAPH'];
  if (!supergraph) {
    throw new Error('SUPERGRAPH env var is required');
  }
  const supergraphSdl = readFileSync(supergraph, 'utf-8');
  const server = new ApolloServer({
    gateway: new ApolloGateway({
      supergraphSdl,
    }),
  });
  const { url } = await startStandaloneServer(server, {
    listen: { port },
  });
  console.log(`🚀 Gateway ready at ${url}`);
}

main().then;
