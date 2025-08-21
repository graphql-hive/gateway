group "gateway" {
  targets = ["gateway"]
}

variable "GATEWAY_TAGS" {
  default = "dev"
}

target "gateway" {
  context = "packages/gateway"
  dockerfile = "node.Dockerfile"
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

target "gateway_bun" {
  context = "packages/gateway"
  dockerfile = "bun.Dockerfile"
  platforms = ["linux/amd64", "linux/arm64"]
  tags = formatlist("ghcr.io/graphql-hive/gateway:%s-bun", split(",", GATEWAY_TAGS))
  annotations = [
    "index:org.opencontainers.image.title=Hive Gateway on Bun",
    "index:org.opencontainers.image.description=GraphQL Gateway by The Guild that can act as a Apollo Federation Gateway or a Proxy Gateway for any GraphQL service.",
    "index:org.opencontainers.image.authors=The Guild",
    "index:org.opencontainers.image.licenses=MIT",
    "index:org.opencontainers.image.source=https://github.com/graphql-hive/gateway/tree/main/packages/gateway",
    "index:org.opencontainers.image.documentation=https://the-guild.dev/graphql/hive/docs/gateway/deployment/docker"
  ]
}

//

group "e2e" {
  targets = [
    "gateway_e2e",
    "gateway_e2e_openapi-javascript-wiki",
    "gateway_e2e_operation-field-permissions",
    "gateway_e2e_distributed-subscriptions-webhooks"
  ]
}

group "e2e_bun" {
  targets = [
    "gateway_e2e-bun",
    "gateway_e2e_openapi-javascript-wiki_bun",
    "gateway_e2e_operation-field-permissions_bun",
    "gateway_e2e_distributed-subscriptions-webhooks_bun"
  ]
}

target "gateway_e2e_base" {
  context = "packages/gateway"
  dockerfile = "node.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e_base"]
}
target "gateway_e2e" {
  context = "packages/gateway"
  dockerfile = "node_e2e.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e"]
  contexts = {
    "gateway_e2e_base": "target:gateway_e2e_base"
  }
}
target "gateway_e2e_base-bun" {
  context = "packages/gateway"
  dockerfile = "bun.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e_base-bun"]
}
target "gateway_e2e-bun" {
  context = "packages/gateway"
  dockerfile = "bun_e2e.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e-bun"]
  contexts = {
    "gateway_e2e_base-bun": "target:gateway_e2e_base-bun"
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
target "gateway_e2e_openapi-javascript-wiki_bun" {
  context = "e2e/openapi-javascript-wiki"
  dockerfile = "gateway_bun.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e.openapi-javascript-wiki-bun"]
  contexts = {
    "gateway_e2e-bun": "target:gateway_e2e-bun"
  }
}

target "gateway_e2e_operation-field-permissions" {
  context = "e2e/operation-field-permissions"
  dockerfile = "gateway.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e.operation-field-permissions"]
  contexts = {
    "gateway_e2e": "target:gateway_e2e"
  }
}
target "gateway_e2e_operation-field-permissions_bun" {
  context = "e2e/operation-field-permissions"
  dockerfile = "gateway_bun.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e.operation-field-permissions-bun"]
  contexts = {
    "gateway_e2e-bun": "target:gateway_e2e-bun"
  }
}

target "gateway_e2e_distributed-subscriptions-webhooks" {
  context = "e2e/distributed-subscriptions-webhooks"
  dockerfile = "gateway.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e.distributed-subscriptions-webhooks"]
  contexts = {
    "gateway_e2e": "target:gateway_e2e"
  }
}
target "gateway_e2e_distributed-subscriptions-webhooks_bun" {
  context = "e2e/distributed-subscriptions-webhooks"
  dockerfile = "gateway_bun.Dockerfile"
  tags = ["ghcr.io/graphql-hive/gateway:e2e.distributed-subscriptions-webhooks-bun"]
  contexts = {
    "gateway_e2e-bun": "target:gateway_e2e-bun"
  }
}
