# IMPORTANT: make sure bundle is ready with `yarn bundle`

FROM oven/bun:1.3.13-slim AS install

WORKDIR /install

RUN bun i graphql@16.14.0

#

FROM oven/bun:1.3.13-slim

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    debian-security-support \
    libc-bin \
    wget curl \
    dumb-init

# cleanup
RUN apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /gateway

# DEPRECATED: the /serve mount point has been deprecated in favour of /gateway
#             we're keeping a symlink just for an easier transition
RUN ln -s /gateway /serve

COPY --chown=root --from=install /install/node_modules /node_modules
COPY --chown=root bundle/node_modules /node_modules
COPY --chown=root bundle/dist .

# node user can create files and install modules, but not modify the bundle (existing contents)
RUN chown bun . && \
    echo "{}" > package.json && chown bun package.json

# npm install should ignore peer deps (which is often "graphql" which is available in root)
RUN echo "omit=peer" > .npmrc && chown bun .npmrc

# we need to set NODE_PATH to include because the root node_modules will dynamically import modules and we want node to search user-installed modules too (when extending the docker image)
ENV NODE_PATH=/gateway/node_modules

USER bun
ENTRYPOINT ["dumb-init", "bun", "bin.mjs"]
