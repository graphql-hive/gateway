import { startStandaloneServer } from '@apollo/server/standalone';
import { server } from './server';

startStandaloneServer(server, {
  listen: { port: 4001 },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
