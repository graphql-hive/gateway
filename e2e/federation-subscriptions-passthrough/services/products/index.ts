import { Opts } from '@internal/testing';
import { start } from './server';

const opts = Opts(process.argv);

start(opts.getServicePort('products', true)).catch((err) => {
  console.error(err);
  process.exit(1);
});
