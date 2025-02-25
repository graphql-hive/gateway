import {
  HiveGatewayDriver,
  HiveGatewayDriverConfig,
} from '@graphql-hive/nestjs';
import { Opts } from '@internal/testing';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';

const opts = Opts(process.argv);
const supergraph = opts.get('supergraph', true);

@Module({
  imports: [
    GraphQLModule.forRoot<HiveGatewayDriverConfig>({
      driver: HiveGatewayDriver,
      supergraph,
    }),
  ],
})
class AppModule {}

const port = opts.getServicePort('nestjs', true);

async function main() {
  const app = await NestFactory.create(AppModule);
  await app.listen(port);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
