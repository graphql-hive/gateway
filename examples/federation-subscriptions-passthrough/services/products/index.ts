import { start } from './server';

start(4001).catch((err) => {
  console.error(err);
  process.exit(1);
});
