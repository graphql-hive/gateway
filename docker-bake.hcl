group "gateway" {
  targets = ["gateway"]
}

variable "GATEWAY_TAGS" {
  default = "dev"
}

target "gateway" {
  context = "packages/gateway"
  platforms = ["linux/amd64", "linux/arm64"]
  tags = formatlist("ghcr.io/graphql-hive/gateway:%s", split(",", GATEWAY_TAGS))
  annotations = [
    "index:org.opencontainers.image.title=Hive Gateway",
    "index:org.opencontainers.image.description=GraphQL Gateway by The Guild that can act as a Apollo Federation Gateway or a Proxy Gateway for any GraphQL service.",
    "index:org.opencontainers.image.authors=The Guild",
    "index:org.opencontainers.image.licenses=MIT",
    "index:org.opencontainers.image.source=https://github.com/graphql-hive/gateway/tree/main/packages/gateway",
    "index:org.opencontainers.image.documentation=https://the-guild.dev/graphql/hive/docs/gateway/deployment/docker"
  ]
}

//

group "e2e" {
  targets = ["gateway_e2e", "gateway_e2e_sqlite-chinook", "gateway_e2e_openapi-javascript-wiki"]
}

target "gateway_e2e" {
  context = "packages/gateway"
  tags = ["ghcr.io/graphql-hive/gateway:e2e"]
}

target "gateway_e2e_sqlite-chinook" {
  context = "e2e/sqlite-chinook"
  dockerfile = "gateway.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e.sqlite-chinook"]
  contexts = {
    "gateway_e2e": "target:gateway_e2e"
  }
}

target "gateway_e2e_openapi-javascript-wiki" {
  context = "e2e/openapi-javascript-wiki"
  dockerfile = "gateway.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e.openapi-javascript-wiki"]
  contexts = {
    "gateway_e2e": "target:gateway_e2e"
  }
}
