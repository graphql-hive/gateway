import { start } from './server';

start(4002).catch((err) => {
  console.error(err);
  process.exit(1);
});
