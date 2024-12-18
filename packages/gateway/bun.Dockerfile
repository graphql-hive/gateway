# IMPORTANT: make sure bundle is ready with `yarn bundle`

FROM oven/bun:1.1.40 AS install

WORKDIR /install

RUN bun i graphql@^16.9.0

#

FROM oven/bun:1.1.40

RUN apt-get update && apt-get install -y \
    # for healthchecks
    wget curl \
    # for proper signal propagation
    dumb-init && \
    # clean
    apt-get clean

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

USER bun
ENTRYPOINT ["dumb-init", "bun", "bin.mjs"]
