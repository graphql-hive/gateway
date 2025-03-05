import { Opts } from '@internal/testing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const opts = Opts(process.argv);
const port = opts.getServicePort('nestjs', true);

async function main() {
  const app = await NestFactory.create(AppModule);
  await app.listen(port);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
