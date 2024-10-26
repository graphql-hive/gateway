import { Opts } from '@internal/testing';
import { start } from './server';

const opts = Opts(process.argv);

start(opts.getServicePort('reviews')).catch((err) => {
  console.error(err);
  process.exit(1);
});
