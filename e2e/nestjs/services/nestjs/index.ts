import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  process.once('SIGTERM', () => {
    app.close().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  });
  const port = opts.getServicePort('nestjs', true);
  await app.listen(port);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
