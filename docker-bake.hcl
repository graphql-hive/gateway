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
    "org.opencontainers.image.title=\"Hive Gateway\"",
    "org.opencontainers.image.description=\"GraphQL Gateway by The Guild\"",
    "org.opencontainers.image.licenses=MIT",
    "org.opencontainers.image.source=https://github.com/graphql-hive/gateway/tree/main/packages/gateway",
    "org.opencontainers.image.documentation=https://the-guild.dev/graphql/hive/docs/gateway/deployment/docker"
  ]
}
