import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  process.once('SIGTERM', () => {
    app.close().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  });
  await app.listen(process.env['PORT'] ?? 3000);
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
