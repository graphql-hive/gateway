import {
  HiveGatewayDriver,
  HiveGatewayDriverConfig,
} from '@graphql-hive/nestjs';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';

@Module({
  imports: [
    GraphQLModule.forRoot<HiveGatewayDriverConfig>({
      driver: HiveGatewayDriver,
      supergraph: process.env['SUPERGRAPH'] || './supergraph.graphql',
    }),
  ],
})
export class AppModule {}
