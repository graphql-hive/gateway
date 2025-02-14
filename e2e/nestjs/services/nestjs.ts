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

const app = await NestFactory.create(AppModule);
const port = opts.getServicePort('nestjs', true);
await app.listen(port);
