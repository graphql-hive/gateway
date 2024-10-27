import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { server } from './server';

const opts = Opts(process.argv);

const httpServer = createServer(server).listen(opts.getServicePort('accounts'));

httpServer.once('error', (err) => {
  console.error(err);
  process.exit(1);
});
