import { createServer } from 'http';
import { server } from './server';

const httpServer = createServer(server).listen(4001);

httpServer.once('error', (err) => {
  console.error(err);
  process.exit(1);
});
