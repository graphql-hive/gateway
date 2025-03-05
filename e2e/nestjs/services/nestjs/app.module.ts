import { HiveGatewayDriver, HiveGatewayDriverConfig } from "@graphql-hive/nestjs";
import { Opts } from "@internal/testing";
import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";

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
export class AppModule { }